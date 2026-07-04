# StockEx — Games System: Complete Logic & Reimplementation Spec

> **Purpose of this document**
> This is a self-contained specification of the entire "Games" (prediction/betting) subsystem of StockEx —
> backend logic, SuperAdmin configuration, money flow, settlement engine, every API endpoint, and the full
> user-side (frontend) behaviour for every screen. It is written so that an AI assistant (or developer) can
> **re-implement the same games in a brand-new project** without needing the original codebase. Read it top to
> bottom; each game is fully specified (config → window → bet → result → payout → settlement → UI).
>
> Stack it was built on: **Node.js + Express + MongoDB (Mongoose) + Socket.IO** backend, **React (Vite) + TailwindCSS**
> frontend, live prices from **Zerodha KiteConnect** (Nifty) and **Binance** (BTC). You can swap any layer as long as
> the contracts below are preserved.

---

## 0. TL;DR — Core Mental Model

- A "game" = **a bet on real market price movement** (Nifty 50 index or BTC/USDT).
- Money comes from a **dedicated `gamesWallet`** on each user (separate from all trading wallets).
- **SUPER_ADMIN is the house / counter-party.** When a user loses, the stake ends up with SuperAdmin's pool; when a
  user wins, the payout is funded from SuperAdmin's pool. SuperAdmin can go negative (house needs top-up) but the user
  is always paid.
- There are **7 games**, all configured from a single MongoDB singleton document: **`GameSettings`**.
- **Only SUPER_ADMIN** can configure games (enable/disable, multipliers, timings, limits, hierarchy shares).
  Admin/Broker/Sub-Broker only see their commission/referral shares. Users get read-only settings.
- A **background auto-settlement engine** runs on timers (independent of whether any user is online), reads the
  authoritative market price, publishes results, and credits winners. Idempotency guards prevent double payouts.

### The 7 games (grouped by mechanic)

| # | UI id        | GameSettings key | Asset   | Mechanic  | Default payout |
|---|--------------|------------------|---------|-----------|----------------|
| 1 | `updown`     | `niftyUpDown`    | Nifty   | Up/Down   | 1.95×          |
| 2 | `btcupdown`  | `btcUpDown`      | BTC     | Up/Down   | 1.95×          |
| 3 | `niftynumber`| `niftyNumber`    | Nifty   | Number    | 9× (fixed ₹4000)|
| 4 | `btcnumber`  | `btcNumber`      | BTC     | Number    | 9× (fixed ₹4000)|
| 5 | `niftybracket`| `niftyBracket`  | Nifty   | Bracket   | 1.9×           |
| 6 | `niftyjackpot`| `niftyJackpot`  | Nifty   | Jackpot   | pool % by rank |
| 7 | `btcjackpot` | `btcJackpot`     | BTC     | Jackpot   | bank % by rank |

Note the naming mismatch you must keep straight: the **UI id** (`updown`, `niftynumber`, …) differs from the
**GameSettings key** (`niftyUpDown`, `niftyNumber`, …) and from the **ledger id** (`niftyUpDown`, `updown`, …).
Keep a mapping table (see §11).

---

## 1. Data Models (MongoDB / Mongoose)

### 1.1 `User.gamesWallet` (embedded on the User document)
```js
gamesWallet: {
  balance: Number,            // spendable balance for games
  usedMargin: Number,         // amount currently locked in open/pending bets
  realizedPnL: Number,
  unrealizedPnL: Number,
  todayRealizedPnL: Number,
  todayUnrealizedPnL: Number,
  profitBlocked: Boolean,     // if true, wins are not credited (risk lever)
}
```
Also relevant on User: `referralStats.firstGameWinByGame` (object; tracks first win per game key for referral rewards),
`referredBy` (ObjectId → referrer user), `admin` / `hierarchyPath` (for hierarchy commission routing).

### 1.2 `GameSettings` (singleton — the master config; see §2 for all fields)
One document only. Accessed via `GameSettings.getSettings()` which lazily creates it and **auto-heals** any newly
added game blocks (so adding a new game to the schema never 404s existing installs).

### 1.3 Bet / bid models (one per game family)
- `NiftyUpDownBet` / up-down bets are largely represented as **`GamesWalletLedger`** rows with `meta.windowNumber`,
  `meta.prediction` (the production up/down path is ledger-driven; there is also a simplified model path).
- `NiftyNumberBet`, `BtcNumberBet` — `{ user, selectedNumber, quantity, amount, status, closingPrice, resultNumber, profit, betDate }`
- `NiftyBracketTrade` — `{ user, prediction (BUY/SELL), amount, entryPrice, spotAtOrder, upperTarget, lowerTarget, expiresAt, settlesAtSessionClose, status }`
- `NiftyJackpotBid` — `{ user, gameId, amount, niftyPriceAtBid (predicted price), status, rank, prize, betDate }`
- `NiftyJackpotResult` — `{ resultDate, lockedPrice, resultDeclared }`
- `BtcJackpotBid` — `{ user, amount, ticketCount, ticketPrice, predictedBtc, betDate, placedAtIst, status, rank, grossPrize, prize }`
- `BtcJackpotBank` — `{ betDate, totalStake, bidsCount, lockedBtcPrice }`
- `BtcJackpotResult` — `{ resultDate, lockedBtcPrice, resultDeclared }`

### 1.4 Ledgers & settlement guards
- `GamesWalletLedger` — every game money movement: `{ ownerType:'USER', ownerId, type:'CREDIT'|'DEBIT', amount, balance (after), description, meta{...}, createdAt }`.
- `WalletLedger` — used for the SuperAdmin pool credits/debits (BTC games), `meta.gameKey`, `meta.poolDebitKind`, hierarchy credits.
- `UpDownWindowSettlement` — **idempotency guard**; unique index on `(user, gameId, windowNumber, settlementDay)` so a
  window bet can never be settled/credited twice.
- `GameResult` — published per-window/per-day result rows: `{ gameId, windowNumber, day, openPrice, closePrice, result:'UP'|'DOWN'|'TIE', priceSource, createdAt }`.
- `GameTransactionSlip` / `GameTransactionSlipEntry` — groups multi-leg payouts with states `PENDING → PARTIALLY_SETTLED → SETTLED`.

---

## 2. SuperAdmin Configuration (`GameSettings`)

All fields below are what SuperAdmin controls. Endpoints in §5.1. Every per-game block extends a shared
`gameConfigSchema` and then overrides defaults.

### 2.1 Global settings
```js
gamesEnabled: true,                 // master on/off for the whole games system
maintenanceMode: false,             // shows maintenanceMessage, blocks play
maintenanceMessage: "Games are under maintenance...",
tokenValue: 300,                    // 1 token = ₹300 (used to display amounts as "tickets")
platformCommission: 5,              // global platform fee %

profitDistribution: {               // default hierarchy split of win/brokerage
  superAdminPercent: 40, adminPercent: 30, brokerPercent: 20, subBrokerPercent: 10
},

globalMinTickets: 1, globalMaxTickets: 1000,
dailyBetLimit: 500000,              // max a user can stake per day
dailyWinLimit: 1000000,            // max a user can win per day
gamePositionExpiryGraceSeconds: 3600, // unsettled stake auto-refund grace

riskManagement: { maxExposurePerUser, maxWinPerRound, autoSuspendOnLargeWin, largeWinThreshold, suspiciousActivityAlert },
referralBonus, firstDepositBonus, lossCashback, phoneVerification, tradingHours  // (bonus/risk knobs)
```

### 2.2 Shared per-game fields (`gameConfigSchema`)
```js
enabled, minTickets(1), maxTickets(500), winMultiplier, brokeragePercent(5),
roundDuration(sec), cooldownBetweenRounds, maxBetsPerRound, ticketPrice,
maxTicketsUpPerWindow, maxTicketsDownPerWindow,     // Up/Down side caps (0 = unlimited)
maxTicketsBuyPerDay, maxTicketsSellPerDay,          // Bracket side caps
referralDistribution: { firstWinByTickets, winPercent, topRanksOnly, topRanksCount }
```

### 2.3 Per-game overrides (defaults shown)
- **niftyUpDown**: `winMultiplier 1.95`, `roundDuration 900` (15m), `brokeragePercent 5`, `startTime 09:15:00`, `endTime 15:45:00`, `referralDistribution.winPercent 10`, hierarchy `profitSubBroker/Broker/Admin 10/20/30`, `grossPrize*Percent 0` (uses profit-only brokerage model).
- **btcUpDown**: `winMultiplier 1.95`, `startTime 00:00:01`, `endTime 23:45:00`, `allowedExpiryTimes [60,120,300,600,900]`, `defaultExpiryTime 60`, `brokeragePercent 5`, `profitSubBroker/Broker/Admin 5/1/1` (SA is counter-party).
- **niftyNumber**: `winMultiplier 9`, `fixedProfit 4000`, `grossPrizeSubBroker/Broker/Admin 2/1/0.5`, `betsPerDay 10`, `maxTicketsPerNumber 2`, `biddingStartTime 09:15`, `biddingEndTime 15:24`, `resultTime 15:45`, `maxBidTime 15:40`.
- **btcNumber**: like niftyNumber but `resultTime 23:30`, `maxBidTime 23:25`, `biddingEndTime 23:24`.
- **niftyBracket**: `ticketPrice 1000`, `winMultiplier 1.9`, `bracketGap 20`, `bracketGapType 'point'|'percentage'`, `bracketGapPercent 0.1`, `bracketAnchorToSpot true`, `bracketSessionCloseRule 'directionVsEntry'|'breakPastBands'`, `bracketStrictLtpComparison true`, `expiryMinutes 5`, `settleAtResultTime true`, `resultTime 15:31`, `biddingStartTime 09:15:29`, `biddingEndTime 15:29`, `grossPrizeSubBroker/Broker/Admin 2/1/1`.
- **niftyJackpot**: `topWinners 20`, `prizePercentages` (rank-wise; rank1 45%, rank2 10%, rank3 3%, …), `biddingStartTime 00:00`, `biddingEndTime 23:59`, `resultTime 15:45`, `bidsPerDay 100`, `maxTicketsPerRequest 1`, `grossPrizeSubBroker/Broker/Admin 2/1/0.5`, `referralDistribution {winPercent 5, topRanksOnly true, topRanksCount 3}`.
- **btcJackpot**: `ticketPrice 500`, `topWinners 20`, `prizePercentages` (rank1 45% … sums ~100%), `biddingStartTime 00:00`, `biddingEndTime 23:29`, `resultTime 23:30`, `bidsPerDay 200`, `maxTicketsPerRequest 1`, `hierarchy {subBrokerPercent 2, brokerPercent 1, adminPercent 0.5}` (funded from SA, **NOT** deducted from winner).

### 2.4 The 5 levers that define each game's economics
1. `winMultiplier` (and `prizePercentages` for jackpots) — the payout / house edge.
2. `ticketPrice` + `minTickets`/`maxTickets`/`betsPerDay` — how much money can flow in.
3. `biddingStartTime` / `biddingEndTime` / `resultTime` / `roundDuration` — timing windows.
4. `brokeragePercent` + `grossPrize*Percent` / `profit*Percent` — hierarchy cuts.
5. `referralDistribution.winPercent` — referrer reward.

---

## 3. Money Flow & Payout Models

### 3.1 Bet placement (common path)
`POST /api/user/game-bet/place` (or game-specific route) →
1. `assertHierarchyGameNotDeniedForUserId(userId, gameId)` — is this game allowed for this user's hierarchy?
2. Load `GameSettings`; check `enabled`, and `minBet ≤ amount ≤ maxBet` (via tickets × ticketPrice).
3. `atomicGamesWalletDebit(userId, amount)` — **atomic** MongoDB `$inc` that only succeeds if balance is sufficient
   (never goes negative; race-safe).
4. Create a `GameTransactionSlip` + `addDebitEntry`, and `recordGamesWalletLedger(userId, 'DEBIT', amount, ...)`.
5. Create the game-specific bet/bid record with `status: 'PENDING'`.
6. (BTC pool games only) credit the SuperAdmin pool with the stake immediately, with rollback if bet insert fails.

### 3.2 Two payout models (this is the #1 thing to get right)

**Model A — Fixed multiplier (Up/Down, Bracket):** user receives the **full** `stake × winMultiplier`.
```
grossWin      = amount × winMultiplier
profitBeforeFee = grossWin − amount
brokerage T   = brokeragePercent% × profitBeforeFee     // fee on PROFIT only
creditToUser  = grossWin                                 // user gets full gross
SA pool debit = grossWin  (payout)  AND  T (fee)         // two separate debits
T is split up the hierarchy via distributeWinBrokerage(); remainder stays with SA.
```
Reference impl (`utils/upDownSettlementMath.js`):
```js
settleUpDownFromPrices(prediction, openPrice, closePrice) // UP if close>open, DOWN if close<open, TIE(equal)=loss
computeUpDownWinPayout(amount, winMult, brokeragePercent) // {grossWin, brokerage, creditTotal, pnl}
```

**Model B — Gross-prize hierarchy (Number, Jackpot):** hierarchy percentages are taken from the winner's gross slice.
```
G = winner gross slice   (Number: fixedProfit×qty OR ticketPrice×winMult×qty; Jackpot: prize% × pool)
hierarchyCut = (grossPrizeSubBrokerPercent + grossPrizeBrokerPercent + grossPrizeAdminPercent)% of G
Nifty Number/Jackpot: cut is DEDUCTED from the user's prize → user gets (G − hierarchyCut) net.
BTC Jackpot:          cut is FUNDED BY SuperAdmin → winner gets FULL G; hierarchy paid separately from SA.
```
If all `grossPrize*Percent` are 0, the game falls back to the profit-only `brokeragePercent` model.

### 3.3 Hierarchy distribution
`services/gameProfitDistribution.js` splits the fee/prize-cut among the user's `SUB_BROKER → BROKER → ADMIN`
(walking `hierarchyPath`), each getting their configured `profit*Percent` / `grossPrize*Percent`; the remainder
returns to SUPER_ADMIN. Each hierarchy credit writes a `WalletLedger` row with `meta.hierarchyLevel` + `meta.relatedUserId`.

### 3.4 Referral reward
On a user's **first win** in a given game (tracked in `User.referralStats.firstGameWinByGame[gameKey]`), the
**referrer** (`User.referredBy`) is credited `referralDistribution.winPercent%` of the relevant stake — once per
window (Up/Down), once per day (Number/Jackpot), or once per resolved trade (Bracket). Jackpots may gate this to
`topRanksOnly`. Implemented in `services/referralPerWin.js` / `referralGameStakeCredit.js`, subject to a
SuperAdmin-earnings **threshold gate** before payout is released.

---

## 4. The 7 Games — Full Spec

For each: **Bidding window → Bet → Result source & rule → Payout → Settlement cadence → Key files.**

### 4.1 Nifty Up/Down (`updown` / `niftyUpDown`)
- **Window:** sequential **15-minute** rounds during NSE hours `09:15:00–15:45:00` IST (`roundDuration 900`).
  Boundaries at :00/:15/:30/:45. Bet in window N; result revealed one leg later.
- **Bet:** prediction `UP|DOWN`, `amount`, `entryPrice`, `windowNumber`.
- **Result source (priority):** Kite 15-min candle → Kite 1-min candle at IST ref second → Zerodha WS LTP → DB → file cache.
  `open` = previous window's close (window 1 = 15m bar open); `close` = current window's 15m close.
- **Rule:** `close > open ⇒ UP wins`, `close < open ⇒ DOWN wins`, `close == open ⇒ TIE = loss`.
- **Payout:** Model A, `winMultiplier 1.95`, fee 5% of profit from SA pool.
- **Settlement:** `autoSettleNiftyUpDown()` publishes `GameResult` (≥45s cadence in engine); secondary loop credits
  users via `settleUpDownUserWindowFromLedger()` only once IST ≥ the window's result second; `UpDownWindowSettlement`
  prevents double credit.
- **Files:** `services/gamesAutoSettlement.js` (autoSettleNiftyUpDown, user settlement loop), `services/upDownSettlementService.js`, `utils/upDownSettlementMath.js`.

### 4.2 BTC Up/Down (`btcupdown` / `btcUpDown`)
- **Window:** 24×7, **15-minute** IST windows (~94–96/day), session bounds `00:00:01–23:45:00`.
- **Bet:** same shape as Nifty Up/Down.
- **Result source:** Binance 15m kline → 1m close at IST ref → live WS spot (if <120s after result) → Binance REST → ledger min.
- **Rule / Payout:** identical to Nifty Up/Down (Model A, 1.95×). SuperAdmin BTC pool is the counter-party.
- **Settlement:** **dedicated 5-second fast loop** (`autoSettleBtcUpDown()`), single-flight guarded, so every close
  publishes within seconds even if nobody is online. Results are 100% server-side (client only polls).
- **Files:** `services/gamesAutoSettlement.js` (autoSettleBtcUpDown), `utils/btcUpDownOpenPrice.js`.

### 4.3 Nifty Number (`niftynumber` / `niftyNumber`)
- **Window:** bids `09:15–15:24` IST; result `15:45`; `betsPerDay 10`; `maxTicketsPerNumber 2`.
- **Bet:** `selectedNumbers[]` (UI offers `.00–.95` in steps of 5), `amount` per ticket, `quantity`.
- **Result:** Kite closing price's **decimal (fractional) two digits**. e.g. `23,123.65 ⇒ result = 65`
  (`utils/niftyNumberResult.js` → `closingPriceToDecimalPart`). Win if `selectedNumber === resultNumber`.
- **Payout:** Model B, `gross = fixedProfit(4000) × qty` (or `ticketPrice × winMult × qty`); hierarchy `grossPrize*` deducted → user gets net.
- **Settlement:** `declareNiftyNumberResultForDate({date, closingPrice})` after resultTime, ~120s cadence, one batch update.
- **Files:** `services/niftyNumberDeclareService.js`, `utils/decimalNumberWinGrossPrize.js`.

### 4.4 BTC Number (`btcnumber` / `btcNumber`)
- **Window:** bids until `23:24`; result `23:30` IST. UI offers full `.00–.99`.
- **Bet:** same as Nifty Number.
- **Result:** BTC/USDT spot at 23:30 → integer part's **last two digits** (`75,242.89 ⇒ 75242 % 100 = 42`).
- **Payout / Settlement:** same as Nifty Number (`declareBtcNumberResultForDate`), BTC price source.
- **Files:** `services/btcNumberDeclareService.js`.

### 4.5 Nifty Bracket (`niftybracket` / `niftyBracket`)
- **Window:** bids `09:15:29–15:29`; result `15:31` IST; `ticketPrice 1000`.
- **Bet:** `prediction BUY|SELL`, `amount`, `entryPrice` (current Nifty). Server builds a band around live spot:
  `upperTarget = centre + bracketGap`, `lowerTarget = centre − bracketGap` (centre = live spot if `bracketAnchorToSpot`).
- **Result rule (`bracketSessionCloseRule`):**
  - `directionVsEntry`: BUY wins if settlement LTP > entry; SELL wins if LTP < entry.
  - `breakPastBands`: BUY wins only if LTP > upperTarget; SELL only if LTP < lowerTarget.
- **Payout:** Model A, `winMultiplier 1.9` (₹1000 → ₹1900). Loss = full stake.
- **Settlement:** engine fetches active trades with `expiresAt ≤ now` (≤200/tick, ≥45s cadence), resolves each with
  `resolveNiftyBracketTrade(trade, currentPrice, opts)`; status → `won|lost`; wallet credited; hierarchy paid.
- **Files:** `services/niftyBracketResolve.js`, `utils/niftyBracketBiddingWindow.js`.

### 4.6 Nifty Jackpot (`niftyjackpot` / `niftyJackpot`)
- **Window:** bids `00:00–23:59` (24h); price **locked** at `resultTime 15:45`; `bidsPerDay 100`, `maxTicketsPerRequest 1`.
- **Bet:** `amount` (≈ one ticket), `predictedPrice` (`niftyPriceAtBid`, valid 1000–200000).
- **Result:** `tryAutoLockNiftyJackpotPrice()` writes `NiftyJackpotResult.lockedPrice` (Kite LTP → WS → resolver).
  Bids sorted by `|niftyPriceAtBid − lockedPrice|` ascending; ties broken by earliest `createdAt`.
- **Payout:** Model B, top `topWinners(20)` share the pool: `prize = pool × prizePercentages[rank]`. Hierarchy
  `grossPrize*` deducted from each winner's slice → net to user.
- **Settlement:** after lock, `declareNiftyJackpotResult()` ranks, assigns prizes, credits winners, updates bids
  (`status won|lost`, `rank`, `prize`), distributes hierarchy from pool.
- **Files:** `services/niftyJackpotDeclare.js`, `utils/niftyJackpotRank.js`, `utils/niftyJackpotPrize.js`. Leaderboard
  API handler: `controllers/gamingController.js → getNiftyJackpotLeaderboard`.

### 4.7 BTC Jackpot (`btcjackpot` / `btcJackpot`)
- **Window:** bids `00:00–23:29`; result/lock `23:30` IST; `ticketPrice 500`, `bidsPerDay 200`.
- **Bet:** `predictedBtc` (USD, 1–10,000,000). On placement: debit games wallet → **credit SA pool**
  (`creditSuperAdminForBtcJackpotStake`) → create `BtcJackpotBid` → bump `BtcJackpotBank.totalStake/bidsCount`
  → games ledger DEBIT. Rollback both wallet and pool if insert fails.
- **Result:** lock BTC spot into `BtcJackpotBank.lockedBtcPrice`; rank by distance to locked price; ties detected.
- **Payout:** top 20 share **Bank**: `prize = totalStake × prizePercentages[rank]`. **Tie handling:** tied ranks sum
  their percentages and split equally. Winner receives **full grossPrize**; hierarchy (`hierarchy.*Percent`) funded by
  SA, not deducted from the winner.
- **Settlement:** `btcJackpotAutoTick()` (1s cadence, single-flight) locks at resultTime and declares once bids exist;
  `declareBtcJackpotResult(date)` credits winners (`atomicGamesWalletUpdate`), writes ledgers, pays hierarchy from pool.
- **Files:** `jobs/btcJackpotScheduler.js`, `services/btcJackpotDeclareService.js`, `utils/btcJackpotRanking.js`, `utils/btcJackpotPool.js`, `routes/btcJackpotRoutes.js`, `routes/adminBtcJackpotRoutes.js`.

---

## 5. Backend Architecture & API Reference

### 5.1 Admin (SUPER_ADMIN only) — configure games
Base: `/api/admin/manage` (middleware `protectAdmin, superAdminOnly`).
```
GET   /game-settings                      → full GameSettings
GET   /game-settings/live-details         → settings + live diagnostics
GET   /game-settings/previous-ltps        → recent reference LTPs
PUT   /game-settings                      → replace/update global + games
PUT   /game-settings/game/:gameId         → update one game's config
PATCH /game-settings/game/:gameId/toggle  → enable/disable one game
PATCH /game-settings/toggle-all           → enable/disable all games
PATCH /game-settings/maintenance          → maintenance mode on/off
```
BTC Jackpot admin slice: base `/api/admin/btc-jackpot` (super-admin only) — update `games.btcJackpot`, declare/inspect.

### 5.2 User — play games
Base: `/api/user` (middleware `protectUser`) unless noted.

**Common / wallet**
```
GET  /wallet                              → { gamesWallet:{balance}, ... }
GET  /game-settings                       → read-only settings (+ hierarchyDeniedGameKeys)
GET  /games-wallet/ledger?gameId&limit&date
GET  /games-wallet/today-net              → { byGame, byGameGrossWins }
GET  /games/live-activity                 → per-game ticket/player counts
GET  /games/recent-winners?limit
```

**Up/Down (nifty + btc)**
```
POST /game-bet/place                      → { gameId, prediction:'UP'|'DOWN', amount, entryPrice, windowNumber }
GET  /game-bets/:gameId?limit             → user's past bets
GET  /game-results/:gameId?limit&day      → published window results
POST /game-bet/resolve                    → { gameId, settlementDay?, trades:[{amount,won,pnl,brokerage,prediction,windowNumber,entryPrice,exitPrice,...}] }
GET  /updown/active                       → active/pending windows
GET  /updown/results
POST /updown/manual-settle
GET  /btc-updown/window-ltps
GET  /btc-updown/canonical-open/:windowNumber
```

**Nifty Number / BTC Number** (same shape, different base `/nifty-number` vs `/btc-number`)
```
POST   /nifty-number/bet                  → { selectedNumbers:[..], amount, quantity }
PUT    /nifty-number/bet/:id              → { newAmount }
DELETE /nifty-number/bet/:id
GET    /nifty-number/today                → { bets, remaining, maxBetsPerDay, maxTicketsPerNumber }
GET    /nifty-number/history
GET    /nifty-number/daily-result         → { declared, closingPrice, resultTime }
GET    /nifty-number/last-5-days
// BTC extras:
GET    /btc-number/reference-price        → { locked, referencePrice }
GET    /btc-number/last-5-days-results
```

**Nifty Bracket**
```
POST /nifty-bracket/trade                 → { prediction:'BUY'|'SELL', amount, entryPrice }
GET  /nifty-bracket/active
GET  /nifty-bracket/history
POST /nifty-bracket/resolve               → { tradeId, currentPrice }
GET  /nifty-bracket/last-5-days
```

**Nifty Jackpot**
```
POST /nifty-jackpot/bid                   → { amount, predictedPrice }
PUT  /nifty-jackpot/bid/:id               → modify prediction
GET  /nifty-jackpot/today                 → { bids, ticketsToday, totalStakedToday }
GET  /nifty-jackpot/leaderboard?limit&spot → { leaderboard, referenceSpot, rankingMode, myRank, totalPool, anonymousPodium, podiumIsOfficial }
GET  /nifty-jackpot/locked-price
GET  /nifty-jackpot/history
GET  /nifty-jackpot/last-5-days-clearing
```

**BTC Jackpot** (base `/api/user/btc-jackpot`)
```
GET  /config                              → game config for client
GET  /bank                                → { lockedBtcPrice, resultDeclared, totalStake, lockedAt }
POST /bid                                 → { predictedBtc }
PUT  /bid/:id
GET  /today                               → { bids, ticketsUsed, totalStaked }
GET  /leaderboard?limit                   → { winners:[{rank,predictedBtc,distance,poolPercent,projectedPrize,tied,...}], spot, totalPool }
GET  /history?days=14
```

**Price helpers used by games UI**
```
GET /api/binance/price/BTCUSDT            → live BTC fallback (mobile WebView)
GET /api/zerodha/game-price/NIFTY?authoritative=1&closedMode=ltp|clearing
GET /api/market/nifty-history?interval=15minute
GET /api/market/btc-history?interval=15m
```

### 5.3 Auto-settlement engine (background)
Entry `runGamesAutoSettlementTick()` (`services/gamesAutoSettlement.js`), wired in `index.js`:
```
setInterval(runGamesAutoSettlementTick, 30_000)         // bracket, nifty up/down, jackpot, number
fastBtcTick(): autoSettleBtcUpDown(...) every 5_000     // BTC up/down publishing
btcJackpotAutoTick() every 1_000                        // BTC jackpot lock + declare
```
Internal per-game cadence gates: Up/Down & Bracket ≥45s, Number ≥120s. All declare paths are **single-flight**
guarded and idempotent (`UpDownWindowSettlement`, `resultDeclared` flags).

---

## 6. Frontend (React) — User-Side, Screen by Screen

Main page: `client/src/pages/UserGames.jsx` (very large). It renders one screen per game via a game selector.

### 6.1 Screen → component map
```
updown / btcupdown → <GameScreen>            (15m window, UP/DOWN, live chart)
niftynumber        → <NiftyNumberScreen>     (.00–.95 step 5)
btcnumber          → <NiftyNumberScreen allDecimals> (.00–.99)
niftybracket       → <NiftyBracketScreen>    (BUY/SELL band)
niftyjackpot       → <NiftyJackpotScreen>    (predict price + leaderboard)
btcjackpot         → <BtcJackpotScreen>      (predict BTC + leaderboard)
```
Shared components: `components/games/LiveChart.jsx` (lightweight-charts candles + price lines + IST HUD),
`components/games/GamesWalletGameLedgerPanel.jsx` (per-game ledger with date filter, ticket conversion via `tokenValue`).

### 6.2 Real-time wiring
- One Socket.IO connection (shared singleton). On connect, `emit('register_user', userId)`.
- **Nifty price:** `socket.on('market_tick', ticks)` → `resolveNiftyTickFromBatch(ticks)` → `{ ltp/last_price, bid, ask, change, changePercent }`.
- **BTC price:** `socket.on('crypto_tick', ticks)` → `resolveBtcTickFromBatch(ticks)` → `{ ltp, change, changePercent }`.
- `emit('get_zerodha_status')` / `on('zerodha_status', {connected})` for connection badge.
- **Mobile WebView fallback** (sockets blocked): poll `GET /api/binance/price/BTCUSDT` every 3s and `GET /api/zerodha/game-price/NIFTY` for Nifty.

### 6.3 Polling loops (client) — keep these cadences
```
game-settings           every 3s     (fast so admin toggles apply live)
today-net by game       every 60s
live-activity           every 10s
recent-winners          every 20s
BTC up/down results     every 4s
bracket active trades   every 1s
nifty jackpot leaderbd  every 8s     (throttled to 400ms on price change)
btc jackpot leaderbd    every 5s ; bank every 15s
window countdown        every 1s
btc number ref price    every 1s ; nifty number daily-result every 45s
```
A custom `AUTO_REFRESH_EVENT` is dispatched after any bet/resolution to force balance/ledger/settings refresh.

### 6.4 Window/countdown logic (Up/Down)
- `getTradingWindowInfo(openTime, closeTime, roundDurationSec)` (Nifty) / `getBTCWindowInfo(openTime, closeTime)` (BTC)
  → `{ windowNumber, windowStart/End, resultTime, status:'open'|'pre_market'|'post_market'|'cooldown', countdown, canTrade }`.
- Client tracks `pendingWindows[]` and, at each window boundary, captures the exact LTP at the prior window's end second
  (Nifty uses exact Kite 15m closes, not moving tick LTP). BTC results come entirely from the server DB.

### 6.5 Client-side validation before placing a bet (all games)
```
1. amount > 0 and a prediction/number/side selected
2. tokens: minTickets ≤ count ≤ maxTickets  (per game)
3. amount ≤ gamesWallet.balance
4. window/bidding open (canTrade / evaluateBtcJackpotBiddingWindowClient / isBtcNumberBettingClosed)
5. game enabled (settings.enabled !== false, not in hierarchyDeniedGameKeys)
6. per-game caps: maxTicketsPerNumber, remaining (daily), side caps, predicted-price range
   (Nifty jackpot 1000–200000; BTC jackpot 1–10,000,000)
```
Server re-validates everything — client checks are UX only.

### 6.6 Per-screen UI summary
- **GameScreen (Up/Down):** live chart with the user's active prediction as a price line, a big UP/DOWN toggle, amount
  input (tokens), countdown to window close & to result, a "pending windows" strip, and a results/history list. On
  place → `POST /game-bet/place`; on window close → results poll + `POST /game-bet/resolve` to book.
- **NiftyNumberScreen:** grid of numbers (.00–.95 or .00–.99), per-number ticket selector respecting
  `maxTicketsPerNumber` and daily `remaining`, today's bets list, daily result banner, last-5-days modal.
- **NiftyBracketScreen:** shows live spot + computed BUY/SELL band, BUY/SELL buttons, active trades (auto-resolve at
  expiry/result time), LTP tape (persisted per IST day in localStorage), history.
- **NiftyJackpotScreen:** predicted-price input, live leaderboard (rank, distance, pool %, projected prize), my rank,
  anonymous podium (official after lock), locked-price banner, last-5-days clearing.
- **BtcJackpotScreen:** predicted-BTC input, bidding-window countdown, leaderboard with tie grouping, bank/lock status,
  14-day history.
- **GamesWalletGameLedgerPanel:** every credit/debit with order time (IST), description (e.g. "Window #5 · UP · 2 T"),
  tickets, amount, running balance, and slip status for multi-leg payouts.

---

## 7. Naming / ID Mapping (critical — keep consistent)

```js
// UI id → GameSettings key
{ updown:'niftyUpDown', btcupdown:'btcUpDown', niftynumber:'niftyNumber',
  btcnumber:'btcNumber', niftybracket:'niftyBracket', niftyjackpot:'niftyJackpot', btcjackpot:'btcJackpot' }

// UI id → ledger game id
{ updown:'updown', btcupdown:'btcupdown', niftynumber:'niftyNumber', btcnumber:'btcNumber',
  niftybracket:'niftyBracket', niftyjackpot:'niftyJackpot', btcjackpot:'btcJackpot' }
```

---

## 8. Reimplementation Checklist (do these in order)

1. **User model:** add `gamesWallet` (balance/usedMargin/pnl/profitBlocked) + `referralStats.firstGameWinByGame` + `referredBy`/`hierarchyPath`.
2. **GameSettings singleton** with the global + 7 per-game blocks (§2) and a `getSettings()` that lazily creates and auto-heals.
3. **Wallet primitives:** `atomicGamesWalletDebit`, `atomicGamesWalletUpdate` (respect `profitBlocked`), `recordGamesWalletLedger`. Make debit atomic & non-negative.
4. **Bet/bid models** + `GameResult` + `UpDownWindowSettlement` (unique idempotency index) + `GamesWalletLedger`.
5. **Price sources:** a Nifty resolver (live tick → candle → REST → cache) and a BTC resolver (Binance WS/kline/REST). Expose "price at IST ref second" and "15m window OHLC".
6. **Settlement math:** `settleUpDownFromPrices`, `computeUpDownWinPayout`, number decimal/left-two-digit extractors, jackpot rank+prize with tie split.
7. **Settlement services** per game + the tick engine (30s general, 5s BTC up/down, 1s BTC jackpot) with single-flight guards.
8. **Hierarchy distribution** (`profit*Percent` / `grossPrize*Percent`) and **referral per-win** with threshold gate.
9. **Admin API** (`superAdminOnly`) for all `game-settings*` endpoints.
10. **User API** (§5.2) for each game.
11. **Frontend:** UserGames page with the 7 screens, shared LiveChart + ledger panel, socket wiring (`market_tick`/`crypto_tick`), the polling cadences (§6.3), countdown/window logic, and client validations (§6.5). Keep the ID mapping (§7).

---

## 9. Invariants & Gotchas (don't break these)

- **SuperAdmin is the counter-party.** All wins are funded from, and all losses flow to, the SA pool. Track it in `WalletLedger` with `meta.gameKey`.
- **Never double-credit.** Enforce with `UpDownWindowSettlement` unique index and `resultDeclared` flags; make declares single-flight.
- **Results must come from authoritative market data** (Kite/Binance candles), not moving tick LTP, especially at window boundaries. TIE (open==close) counts as a loss in Up/Down.
- **Two payout models coexist** — fixed-multiplier (user gets full gross, fee on profit from SA) vs gross-hierarchy (Nifty deducts from winner; BTC jackpot funds hierarchy from SA). Don't mix them up.
- **Atomic, non-negative wallet ops** to survive concurrent bets.
- **All timing is IST (Asia/Kolkata).** Windows, bidding, result times, day scoping — everything.
- **Client validation is UX only;** the server must independently re-validate limits, windows, balances, and hierarchy denial.
- **UI id ≠ settings key ≠ ledger id** — always map (§7).
- **`GameSettings.getSettings()` auto-heals** newly added game blocks so old singletons don't 404.

---

*Generated from the StockEx codebase as a reusable games spec. Backend: `server/services/gamesAutoSettlement.js`,
`server/models/GameSettings.js`, `server/controllers/gamingController.js`, `server/routes/{userRoutes,btcJackpotRoutes,adminManagementRoutes}.js`
and the per-game declare/resolve services. Frontend: `client/src/pages/UserGames.jsx` + `client/src/components/games/*`.*
