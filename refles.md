# StockEx — Referral System + Money Distribution + Admin Commission Wallets: Complete Spec

> **Purpose of this document**
> The single, complete spec for **everything about who earns money on a user's activity** in StockEx:
> **(A) Hierarchy commission** — when a user wins a game (or trades), how much goes to their SUB_BROKER → BROKER →
> ADMIN → SUPER_ADMIN; **(B) Games referral** — when a *referred* user wins a game, how much goes to the *referrer*;
> **(C) Trading referral** — when a referred user *trades*, how the referrer earns; **(D) Admin commission wallet
> flow** — exactly *which wallet* each admin role is paid into and how it's released/withdrawn; and **(E) how
> SUPER_ADMIN configures every percentage**. Written so an AI/dev can re-implement it exactly in a new project.
> Companions: `gameslogic.md` (game mechanics), `wallet.md` (multi-wallet system).
>
> Stack: Node.js + Express + MongoDB (Mongoose), React (Vite). SUPER_ADMIN is the house / counter-party for BTC games.

---

## 0. TL;DR — Two separate money streams (never confuse them)

On any user win/trade, **two independent commissions** can fire:

| Stream | Who earns | On what | Where it lands |
|--------|-----------|---------|----------------|
| **Hierarchy commission** | the player's **SUB_BROKER, BROKER, ADMIN, SUPER_ADMIN** | every game win / every trade's brokerage | admin `wallet.balance` (trading & SA games) or `temporaryWallet.balance` (non-SA games) |
| **Referral reward** | the **referrer user** (a normal user who invited the player) | friend's game win (once) / friend's trade (every trade) | referrer's segment wallet (`gamesWallet` / `mcxWallet` / `cryptoWallet` / `forexWallet` / main) |

- **Hierarchy commission** = the franchise/MLM earning of the admins above the player. Fires on **every** win/trade.
- **Referral reward** = a user-to-user growth incentive. Games: **once** (first win per game). Trading: **every trade**.
- **SUPER_ADMIN sets all percentages** via game-settings; admins below only toggle referral on/off for their subtree.

The 7 games: `niftyUpDown`, `btcUpDown`, `niftyNumber`, `btcNumber`, `niftyBracket`, `niftyJackpot`, `btcJackpot`.

---

# PART A — HIERARCHY COMMISSION (SUB_BROKER / BROKER / ADMIN / SUPER_ADMIN)

When a user wins, the admins above them earn. Two payout models decide *how much*.

## A.1 The two payout models
```
sumGross = grossPrizeSubBrokerPercent + grossPrizeBrokerPercent + grossPrizeAdminPercent
if (sumGross > 0)  → Model B: Gross-Prize Hierarchy   (Number, Jackpot, Bracket)
else               → Model A: Profit-Only Brokerage    (Up/Down)
```

### Model A — Profit-Only Brokerage (fixed-multiplier games)
Used by **Nifty Up/Down** and **BTC Up/Down**.
```
grossWin      = stake × winMultiplier                    // user gets full grossWin
T (total fee) = brokeragePercent% × (grossWin − stake)   // fee on PROFIT only
subBroker = T × profitSubBrokerPercent%
broker    = T × profitBrokerPercent%
admin     = T × profitAdminPercent%
superAdmin= T − (above)                                  // remainder
```
Function: `distributeWinBrokerage(userId, user, T, gameName, gameKey, opts)` — `services/gameProfitDistribution.js:266-598`.
BTC Up/Down: `fundFromBtcPool:true` → T debited from the SUPER_ADMIN pool. Nifty Up/Down: **no pool** (fee from win flow).

### Model B — Gross-Prize Hierarchy (number / jackpot / bracket games)
Used by **Nifty Number, BTC Number, Nifty Jackpot, Nifty Bracket**.
```
G = winner gross slice
    Number : fixedProfit × quantity            (e.g. 4000 × qty)
    Jackpot: totalPool × prizePercent[rank]
    Bracket: stake × winMultiplier
subBroker = G × grossPrizeSubBrokerPercent%
broker    = G × grossPrizeBrokerPercent%
admin     = G × grossPrizeAdminPercent%
superAdmin= G × (100 − sumGross)%              // the big remainder slice
```
Functions: `computeNiftyJackpotGrossHierarchyBreakdown(user, G, gameConfig)` (`gameProfitDistribution.js:607-687`) +
`creditNiftyJackpotGrossHierarchyFromPool(...)` (`:695-851`). `totalHierarchy` is debited from the SUPER_ADMIN pool,
then each level credited.

### BTC Jackpot — direct hierarchy (special case)
`services/btcJackpotDeclareService.js` uses `GameSettings.games.btcJackpot.hierarchy.{subBrokerPercent, brokerPercent,
adminPercent}` directly and does a **separate pool debit per member**. Winner gets **full** grossPrize; hierarchy funded
by SA (never deducted from winner). Ledger `meta.profitKind='BTC_JACKPOT_HIERARCHY'`, all to main `wallet`.

## A.2 Cascade & eligibility (both models)
- **Cascade — missing roles bubble up:** no SUB_BROKER → its share to BROKER (if `subBrokerShareToBroker=true`, default)
  → else ADMIN → else SUPER_ADMIN. No BROKER → ADMIN → SA. No ADMIN → SA. SA always gets `100 − sumConfigured`.
- **Eligibility** (`utils/adminBrokerageEligibility.js:10 adminReceivesHierarchyBrokerage(admin,'games')`):
  `receivesHierarchyBrokerage !== false` **AND** `status==='ACTIVE'` **AND** not brokerage-restricted for the segment.
  Ineligible → that share **diverted to SUPER_ADMIN**.

## A.3 Per-game hierarchy defaults
| Game | Model | Pool? | Fields | Default SB / BR / AD |
|------|-------|-------|--------|----------------------|
| Nifty Up/Down | A (profit) | No | `brokeragePercent 5` + `profit*` | 10 / 20 / 30% of fee T |
| BTC Up/Down | A (profit) | Yes (SA pool) | `brokeragePercent 5` + `profit*` | 5 / 1 / 1% of fee T |
| Nifty Number | B (gross) | Yes | `grossPrize*` of G=4000×qty | 2 / 1 / 0.5% of G |
| BTC Number | B (gross) | Yes | `grossPrize*` of G=4000×qty | 2 / 1 / 0.5% of G |
| Nifty Jackpot | B (gross) | Yes | `grossPrize*` of G=pool×rank% | 2 / 1 / 0.5% of G |
| Nifty Bracket | B (gross) | Yes | `grossPrize*` of G=stake×1.9 | 2 / 1 / 1% of G |
| BTC Jackpot | direct | Yes (per-member) | `hierarchy.*Percent` of G=pool×rank% | 2 / 1 / 0.5% of G |

**Worked example (Nifty Number, chain SB→BR→AD→SA, qty 1):**
```
G = 4000;  sumGross = 3.5% > 0 → Model B
SB = 4000×2%   = 80    → SB temporaryWallet
BR = 4000×1%   = 40    → BR temporaryWallet
AD = 4000×0.5% = 20    → AD temporaryWallet
SA = 4000×96.5% = 3860 → SA main wallet
Pool debited 4000 for hierarchy; each gets a GAME_PROFIT ledger row.
```

## A.4 SUPER_ADMIN pool (BTC games)
On stake, the user's stake credits the SA pool (`btcUpDownSuperAdminPool.js`, `btcJackpotPool.js`, `ADJUSTMENT` ledger).
On win, the pool is debited for the gross payout **and** for the hierarchy shares. Pool can go **negative** (house owes)
— user is always paid. **Nifty Up/Down does NOT use a pool.**

## A.5 SuperAdminHierarchyEarnings
`models/SuperAdminHierarchyEarnings.js` — one doc per `(superAdminId, rootAdminId)` with
`earningsBySegment.{games,trading,mcx,crypto,forex}` + `totalEarnings`. Every credit bumps the segment total; this is
what the **referral threshold gate** (Parts B/C) checks.

---

# PART B — GAMES REFERRAL (referrer earns on the friend's first game win)

## B.1 What it is
Every user has a `referredBy` (who invited them). When that referred user wins a game for the **FIRST time in that
game**, the **referrer** is credited a %, **once per game per referred user**, into the referrer's **`gamesWallet`**.

## B.2 How much (base × winPercent)
`services/referralGameStakeCredit.js:172-198` — base depends on the game:
| Game | Referral base | Reward |
|------|---------------|--------|
| Nifty/BTC Up/Down | one ticket price (`ticketPrice` or `tokenValue`, default 300) | `base × winPercent%` |
| Nifty/BTC Number | one ticket price | `base × winPercent%` |
| Nifty/BTC Jackpot | the **pool/bank** (sum of all day's stakes) | `pool × winPercent%` |
| Nifty Bracket | user's **total session stake** for the day | `stake × winPercent%` |

`rewardAmount = round2(base × winPercent / 100)`. Defaults: Up/Down 10, Number 10, Bracket 5, Jackpot 5
(`topRanksOnly:true, topRanksCount:3`).

## B.3 Eligibility & idempotency (`referralGameStakeCredit.js:82-165`)
A referral credit fires only if ALL hold:
1. Referred user exists and has a `referredBy`.
2. Not a demo user.
3. Referral **enabled for `games`** for that user's hierarchy (`Admin.referralDistributionEnabled.games`).
4. Within **1 month** of the user's demo→real conversion.
5. `referralDistribution.winPercent > 0`.
6. **Top-rank gate** (jackpots): if `topRanksOnly`, reject when `rank > topRanksCount`; else non-jackpot rank ≤ 10.
7. **First-win-only per game:** no prior `REFERRAL_COMMISSION` ledger with `meta.kind='game_stake_referral'`, `meta.gameKey`, `meta.relatedUserId`.
8. **Session idempotency:** no existing credit for `(relatedUserId, gameKey, settlementDay, sessionScope)`.

Session scope = `w<windowNumber>` (Up/Down) or `'declare'` (Number/Bracket/Jackpot). First-win also tracked on
`User.referralStats.firstGameWinByGame[gameKey]`.

## B.4 Crediting the referrer (`referralGameStakeCredit.js:210-251`)
```
atomicGamesWalletUpdate(User, referrerId, { balance:+r, realizedPnL:+r, todayRealizedPnL:+r })
referrer.referralStats.totalReferralEarnings += r
recordGamesWalletLedger(referrerId, { entryType:'credit', amount:r, gameId:<game>,
  description:'Referral bonus: <pct>% of <base> — <referredUsername> in <gameLabel> · <day> · <scope>',
  meta:{ profitKind:'REFERRAL_COMMISSION', kind:'game_stake_referral', gameKey, relatedUserId,
         settlementDay, sessionScope, rewardPercent, referralBase, rank? } })
Referral.findOneAndUpdate({ referredUser }, { $inc:{ earnings:r } })
```

## B.5 Where it's triggered
- **Up/Down:** `gamesAutoSettlement.js:1156-1178` → `creditReferralPerWinFromGameSettings(userId, totalWinningStake, 'btcUpDown'|'niftyUpDown', {windowNumber, settlementDay})`.
- **Number:** `niftyNumberDeclareService.js:186` / `btcNumberDeclareService.js:186` → `creditReferralPercentOfTotalStake({... sessionScope:'declare', rank})`.
- **Bracket:** `niftyBracketResolve.js:285` → `creditReferralPercentOfTotalStake({... sessionScope:'declare'})`.
- **Jackpot:** `referralService.js:21 creditReferralGameReward()` per ranked winner → `creditReferralPercentOfTotalStake({... totalStake:pool, rank})`.

---

# PART C — TRADING REFERRAL (referrer earns on the friend's trades)

## C.1 What it is
When a referred user closes a trade that charged brokerage, the referrer earns a % of that brokerage — on **every
trade** (cumulative, not first-trade-only).

## C.2 Formula & trigger
```
commission = round2( brokerageAmount × referralPercent% )     // default referralPercent = 10%
```
Trigger: `services/tradingService.js:2614-2639` inside `closeTrade()`. It resolves the segment
(`exchange==='MCX'→'mcx'`, `isCrypto→'crypto'`, `isForex→'forex'`, else `'trading'`) and calls
`creditReferralTradingReward(userId, brokerageAmount, tradeId, segment)` (`services/referralService.js:52-128`).

## C.3 Which wallet the referrer gets it in (`referralPayoutService.js:148-242`)
| Trade segment | Referrer wallet credited |
|---------------|--------------------------|
| `trading` / `mcx` | `mcxWallet.balance` (+ realizedPnL, todayRealizedPnL) |
| `crypto` | `cryptoWallet.balance` |
| `forex` | `forexWallet.balance` |
| other | main `wallet.balance` |
Each writes a `WalletLedger` `reason:'REFERRAL_COMMISSION'`, `meta.kind:'referral_payout'`, `meta.segment`. The
`Referral` doc: `$inc earnings, tradingReferralCount; $push tradingReferrals{tradeId, amount, brokerageAmount, segment}`.

> ⚠️ Note: for `trading`/`mcx` segments the referral lands in **`mcxWallet`** (not the main wallet). Preserve or fix
> this deliberately when re-implementing.

## C.4 Idempotency
Unlike games there is **no explicit per-trade dedupe** — it relies on `closeTrade()` not re-closing a trade. Each credit
is logged in `tradingReferrals[]` with its `tradeId`. **When re-implementing, add a `tradeId` idempotency guard on the
ledger.**

## C.5 Shared eligibility + threshold gate (games & trading)
`processConditionalReferralPayout(referredUserId, amount, segment, meta)` (`referralPayoutService.js:28-97`):
1. **Segment enabled?** `isReferralEnabledForUser(userId, segment)` → `Admin.referralDistributionEnabled[segment]`.
   For `mcx`/`crypto`/`forex`, the master `trading` flag **and** the specific segment flag must both be true.
2. **Threshold gate:** `Admin.referralEligibility` (default `{enabled:true, thresholdAmount:1000, thresholdUnit:'PER_CRORE'}`).
   If enabled, find the hierarchy **root ADMIN** → `SuperAdminHierarchyEarnings.hasReachedThreshold(rootAdminId, amount, unit)`:
   ```
   PER_CRORE: totalEarnings/10_000_000 >= thresholdAmount
   ABSOLUTE : totalEarnings >= thresholdAmount
   ```
   Reached → pay now; not reached → **held** (logged; persistent hold is a TODO in code).

## C.6 Signup wiring & user-facing endpoints/UI
- Signup (`controllers/authController.js:29-114`): `referralCode` → user lookup (else admin) → new user gets
  `referredBy`, inherits referrer's `admin`, and an ACTIVE `Referral` doc is created.
- Code generation: `POST /api/referral/generate` → `User.referralCode` (idempotent).
- Endpoints:
  ```
  GET /api/referral/stats               → { totalReferrals, activeReferrals, completedReferrals, totalEarnings, referrals[] }
  GET /api/user/referral-amounts        → per-referral incl. earningsByGame, firstGameWin, firstTradingWin
  GET /api/user/referral-earnings?limit=200 → { total, totalLifetime, entries[] (source, segment, gameKey, amount) }
  ```
- UI: `client/src/pages/UserDashboardNew.jsx → ReferralPanel:1470-1662` — code + share link (`/signup?ref=<code>`),
  rules, and stats (total referrals, earnings, active).

## C.7 Games vs Trading referral
| Aspect | Games | Trading |
|--------|-------|---------|
| Frequency | once per game (first win) | every closed trade (cumulative) |
| Base | ticket / pool / session stake | brokerage charged |
| Default % | 10% (Up/Down, Number), 5% (Bracket, Jackpot) | 10% of brokerage |
| Referrer wallet | `gamesWallet` | `mcxWallet` (trading/mcx) / `cryptoWallet` / `forexWallet` / main |
| Ledger | `GamesWalletLedger` (`game_stake_referral`) | `WalletLedger` (`REFERRAL_COMMISSION`, `referral_payout`) |
| Idempotency | first-win-per-game + session scope | per-trade log (no hard dedupe) |

## C.8 `Referral` model (`models/Referral.js`)
```js
{ referrer, referredUser, referralCode, status:'PENDING'|'ACTIVE'|'COMPLETED',
  earnings,                                     // cumulative total to referrer
  firstGameWin:{ credited, amount, creditedAt, gameName },
  firstTradingWin:{ credited, amount, creditedAt },   // defined; per-trade path used instead
  tradingReferralCount,
  tradingReferrals:[{ tradeId, amount, brokerageAmount, segment, creditedAt }],
  createdAt, activatedAt }
```
User side: `User.referredBy`, `User.referralStats.{ totalReferralEarnings, firstGameWinByGame:{<gameKey>:Boolean} }`.

---

# PART D — ADMIN COMMISSION WALLET FLOW (which wallet the admin gets paid into)

## D.1 Admin wallet fields (`models/Admin.js:366-427`)
| Field | Purpose |
|-------|---------|
| `wallet.balance` | **Main operational wallet.** Withdrawable. Receives **all trading brokerage** (every role) + **SUPER_ADMIN games** shares. |
| `wallet.blocked` | funds held in pending transactions |
| `wallet.totalDeposited` / `totalWithdrawn` | audit counters |
| `temporaryWallet.balance` | **Held games earnings** for SUB_BROKER/BROKER/ADMIN until SA releases |
| `temporaryWallet.totalEarned` / `totalReleased` / `lastReleasedAt` | temp-wallet audit |
| `kuberWallet.balance` | **SUPER_ADMIN-only house pool** for patti/franchise payouts (max ₹100 cr) |
| `stats.totalBrokerage` | historical brokerage counter (source of truth for totals) |
| `totalBrokerageEarned`, `wallet.totalProfitShare` | **legacy/deprecated** |

## D.2 The core rule — where each commission lands
| Income | SUB_BROKER / BROKER / ADMIN | SUPER_ADMIN |
|--------|-----------------------------|-------------|
| **Trading brokerage** (NSE/BSE, MCX, Crypto, Forex) | `wallet.balance` | `wallet.balance` |
| **Games profit / win-brokerage** | `temporaryWallet.balance` | `wallet.balance` |

**Trading always pays straight into the main wallet (any role). Games pay non-SA roles into the *temporary* wallet
(held), and SUPER_ADMIN into the main wallet.** This is the single most important distinction.

### D.2.1 Trading brokerage credit (`services/tradeService.js:3235-3308 → creditBrokerageToAdmin`)
- **All roles → `wallet.balance`** (line 3254); `stats.totalBrokerage` bumped.
- `WalletLedger` reason `BROKERAGE` / `BROKERAGE_OPEN_LEG` / `BROKERAGE_CLOSE_LEG`, `meta.segment` =
  `NSE/BSE` | `MCX` | `CRYPTO` | `FOREX`. **All segments accrue to the same `wallet.balance`** — segment only in ledger meta.

### D.2.2 Games profit/brokerage credit (`services/gameProfitDistribution.js:189-194, 449-465`)
```js
if (role === 'SUPER_ADMIN') { admin.wallet.balance += share; admin.stats.totalBrokerage += share; }
else { admin.temporaryWallet.balance += share; admin.temporaryWallet.totalEarned += share; }  // SB/BR/AD
```
Reason `GAME_PROFIT`; non-SA description tagged "[Temporary Wallet]". Ineligible admins → share diverted to SA main wallet.

## D.3 Temporary wallet → main wallet release (games earnings)
**Manual, SUPER_ADMIN-only. No cron, no auto-release.**
```
POST /api/admin/manage/release-temporary-funds   (protectAdmin, superAdminOnly)   // adminManagementRoutes.js:17887
body: { adminId, amount }
```
Validate `temporaryWallet.balance ≥ amount` → `temporaryWallet.balance -= amount`, `totalReleased += amount`,
`lastReleasedAt = now` → `wallet.balance += amount` → two `TEMP_WALLET_RELEASE` ledgers (DEBIT temp, CREDIT main).
Until released, non-SA admins **cannot withdraw** games earnings.

## D.4 Kuber wallet (SUPER_ADMIN house pool) — `utils/kuberWallet.js`
Funds hierarchy patti/franchise payouts (not personal):
- `fundAdminShareFromSaWallets(amount, kuberPct, ...)` (`:108`) splits `{kuber, personal}`, debiting `kuberWallet` (kuber part) + main `wallet` (personal part).
- `bootstrapKuberWalletToMax()` (`:229`) tops kuber to ₹100 cr (idempotent).
- `transferKuberToMainWallet(amount)` (`:274`) kuber → main.
- `resolveFundingPlanForAdmin(admin)` (`:44`): SA → `{kuberPct:0}`; `isFranchiseRoot` → `{kuberPct:100,'franchise'}`; patti enabled → `{kuberPct:pattiPct,'patti'}`; else `{kuberPct:0,'normal'}`.

## D.5 How an admin withdraws commission
From `wallet.balance` via `AdminFundRequest`:
```
POST /api/admin/manage/fund-request              (non-SA)          → targets parent/SA; status PENDING
PUT  /api/admin/manage/admin-fund-requests/:id   (BROKER/ADMIN/SA) → approve:
     requestor.wallet.balance += amount (ADMIN_DEPOSIT); approver.wallet.balance -= amount (unless SA)
```
Balance check uses `wallet.balance` only (temporaryWallet not withdrawable until released).

## D.6 WalletLedger reason codes (admin commission)
| Reason | When | Wallet |
|--------|------|--------|
| `BROKERAGE` / `BROKERAGE_OPEN_LEG` / `BROKERAGE_CLOSE_LEG` | trading close | `wallet.balance` (all roles) |
| `GAME_PROFIT` | games profit / win-brokerage | `wallet.balance` (SA) / `temporaryWallet.balance` (non-SA) |
| `TEMP_WALLET_RELEASE` | temp → main release | both legs |
| `ADMIN_DEPOSIT` | admin fund request approved | `wallet.balance` |
| `REFERRAL_COMMISSION` | referral payout | referrer segment wallet |
| `ADJUSTMENT` / `KUBER_*` | kuber ops / SA adjustments | `kuberWallet` / `wallet` |

---

# PART E — SUPERADMIN'S 2 WALLETS, COIN SYSTEM, PATTI & BROKERAGE SHARING, INTER-ADMIN FUND FLOW

## E.1 Coin system (◉) — what "coins" actually are
- "Coins" is a **display/branding layer, NOT a separate currency or ledger.** `COIN_SYMBOL = '◉'` simply replaces `₹`
  in API messages and UI. Every wallet balance is a plain **INR number**; `formatCoins(amount)` renders `◉<amount>`
  (en-IN formatting). Files: `server/utils/stockexCoins.js`, `client/src/utils/stockexCoins.js`.
- Games separately use "tokens" (`tokenValue` = ₹300 = 1 token) as a **ticket-sizing** unit — that is not a wallet
  currency either. **So every balance/flow below is INR shown as ◉ coins.**

## E.2 SUPER_ADMIN has 2 wallets (why two)
`models/Admin.js:367-427`. For SUPER_ADMIN specifically:
1. **`wallet` (main / personal / games-house ledger)** — SA's own operational balance. Receives trading brokerage,
   SA games shares, SA's personal patti slice, and the brokerage-extra parent share. **Withdrawable.**
2. **`kuberWallet` (house pool — SA only)** — the pool SA **distributes** to downstream franchise/patti admins.
   Max cap **₹100 cr** (`KUBER_WALLET_MAX_BALANCE = 1_000_000_000`). It is *not* personal money — it is the
   distributable pool.
- (`temporaryWallet` exists on every admin too, but SA games go straight to the main wallet, so SA barely uses it.)

**Why two:** to separate SA's *own* money (`wallet`) from the *pool it hands out* to franchise/patti admins
(`kuberWallet`). When SA funds an admin's share, part is taken from `kuberWallet` (the pooled part) and part from
`wallet` (SA's personal part), per the funding plan (E.4).

## E.3 Admin / Broker / Sub-broker wallet system
Every **non-SA** admin has:
- **`wallet.balance`** — main operational wallet (withdrawable). Receives ALL trading brokerage (any role), patti P&L
  share, and fund transfers from the parent.
- **`temporaryWallet.balance`** — **HELD** games earnings (SB/BR/AD), released manually by SA (Part D.3).
- **No `kuberWallet`** (SA-only).
Fields: `wallet.{balance, blocked, totalDeposited, totalWithdrawn, totalProfitShare}`,
`temporaryWallet.{balance, totalEarned, totalReleased, lastReleasedAt}`, `stats.{totalBrokerage, totalPnL}`.

## E.4 Patti sharing (P&L / brokerage share) — coin flow
"Patti" = a user's trading **P&L (and brokerage)** shared between the book admin and their ancestors up to the
patti-root ADMIN and SUPER_ADMIN.
- **Config** (`Admin.pattiSharing`, `Admin.js:868`): `enabled`, `appliedTo:'ALL_TRADES'|'SPECIFIC_CLIENTS'`,
  `segments[segKey].{adminPercentage, brokerPercentage}`.
- **Find patti root:** `findPattiSubtreeRootAdmin(startAdmin)` (`pattiSubtree.js:96`) walks up to the first ADMIN with
  `pattiSharing.enabled`.
- **Split:** `splitByChildPercent(total, childPct)` (`pattiTradeSettlement.js:20`) → child gets `childPct%`, parent the
  remainder. Multi-level: each level's **net%** = its gross% − (child-below gross%); SA gets `100 − rootGross`.
- **Child % clamp:** a child's % can never exceed the parent's own % (`getMaxChildPctForParent`, `pattiHierarchy.js:43`); SA cap = 100%.
- **Credit destination:** `resolvePattiCascadeCredits()` (`pattiTradeSettlement.js:116`) → each level credited to its
  **`wallet.balance`** via `recordPattiSaParentShare()` (`tradeService.js:1949`): `wallet.balance += signedAmount`,
  ledger `TRADE_PNL` (`meta.pattiSharing:true`). Brokerage variant: `creditPattiCascadeBrokerage()` (`tradeService.js:2199`) → `BROKERAGE` ledger.
- **Where SA funds it from (kuber vs main):** `resolveFundingPlanForAdmin(admin)` (`kuberWallet.js:44`):
  - `isFranchiseRoot` → **100% from `kuberWallet`**
  - patti enabled → `pattiChildPct%` from `kuberWallet`, rest from main `wallet`
  - normal → 100% from main `wallet`
  `fundAdminShareFromSaWallets(amount, kuberPct, ...)` (`kuberWallet.js:108`) splits the debit:
  `kuberWallet.balance -= kuber`, `wallet.balance -= personal`; `ADJUSTMENT` ledgers with `walletSource:'KUBER'|'MAIN'`.
  Kuber top-up: `bootstrapKuberWalletToMax()` (→ ₹100 cr). Kuber→main: `transferKuberToMainWallet()`.

## E.5 Brokerage sharing (SUPER_ADMIN ↔ ADMIN extra)
`brokerageHierarchySharingService.js:16 calculateExtraBrokerage(admin, actualBrokerage)` — **only ADMIN role**, on
brokerage **above the parent cap**:
```
if actualBrokerage > parentCap (admin.brokerageCaps.perCrore.max):
  extra       = actualBrokerage − parentCap
  parentShare = extra × parentSharePercentage%    (default 5%)
  adminShare  = extra − parentShare
```
`distributeSharedAmount()` (:60): `superAdmin.wallet.balance += parentShare`, `admin.wallet.balance += adminShare` —
both `BROKERAGE` ledgers. General brokerage cascade + restrictions:
`brokerageDistributionService.distributeBrokerage()` credits each eligible admin; **restricted** levels
(`shouldRedirectBrokerageToSuperAdmin*`) send their brokerage to SUPER_ADMIN. Inheritance modes:
`FULL_INHERITANCE` (child inherits parent's restriction) vs `SELECTIVE_INHERITANCE`.

## E.6 Admin → Broker → Sub-broker DEPOSIT / WITHDRAW (requests UP, funds DOWN)
**(a) Direct fund transfer (parent pushes/pulls a child admin):**
```
POST /api/admin/manage/admins/:id/add-funds     { amount, description }
   parent NOT SA: parent.wallet.balance −= amount (ADMIN_TRANSFER); child.wallet.balance += amount (ADMIN_DEPOSIT)
   parent IS SA : resolveFundingPlanForAdmin → fundAdminShareFromSaWallets (kuber+main split) → child credited
POST /api/admin/manage/admins/:id/deduct-funds  { amount, description }
   child.wallet.balance −= amount (ADMIN_WITHDRAW); parent.wallet.balance += amount (ADMIN_TRANSFER)
   SA parent: fundAdminShareFromSaWallets(−amount) refunds kuber+main
```
**(b) Fund-request chain (child asks parent):**
```
POST /api/admin/manage/fund-request             { amount, reason }   // targetAdmin = req.admin.parentId || SUPER_ADMIN; status PENDING
PUT  /api/admin/manage/admin-fund-requests/:id  { status:'APPROVED'|'REJECTED', remarks }
   on APPROVE: requestor.wallet.balance += amount (ADMIN_DEPOSIT); approver.wallet.balance −= amount (ADMIN_TRANSFER) unless SA
GET  /admin-fund-requests (parent sees children's) ; GET /my-fund-requests (own)
```
Direction: **requests flow UP, funds/approvals flow DOWN.**

**(c) Admin ↔ User funds:**
```
POST /users/:id/add-funds    → managing admin.wallet.balance −= amount (FUND_ADD); user.wallet.cashBalance += amount
POST /users/:id/deduct-funds → user.wallet.cashBalance −= amount (FUND_WITHDRAW); managing admin.wallet.balance += amount
   (if the requester is SA, the USER'S managing admin is debited/credited — NOT SA's own wallet)
```

**(d) SUPER_ADMIN "unlimited" nuance:** SA **skips the balance check when approving fund requests** (can approve any
amount). But SA's *direct* add-funds still validates SA's own kuber+main balances, and SA adding funds to a *user*
debits that user's **managing admin** (not SA). So "unlimited" = no approval-balance gate, not an infinite pool.

## E.7 Coin/money flow summary (who → whom → which wallet)
| Flow | From wallet | To wallet | Ledger reason |
|------|-------------|-----------|---------------|
| Admin add-funds to child | parent `wallet` (or SA kuber+main) | child `wallet` | ADMIN_TRANSFER / ADMIN_DEPOSIT |
| Admin deduct from child | child `wallet` | parent `wallet` (or SA kuber+main refund) | ADMIN_WITHDRAW / ADMIN_TRANSFER |
| Fund request approved | approver `wallet` (SA: none) | requestor `wallet` | ADMIN_DEPOSIT |
| Admin add-funds to user | managing admin `wallet` | user `wallet.cashBalance` | FUND_ADD |
| Patti P&L / brokerage share | pool (user P&L); SA funds via kuber+main | each level `wallet.balance` | TRADE_PNL / BROKERAGE |
| Brokerage extra share | admin's extra earning | SA `wallet` (5%) + admin `wallet` (95%) | BROKERAGE |
| Games hierarchy (non-SA) | pool | admin `temporaryWallet` (held) | GAME_PROFIT |
| Temp release | admin `temporaryWallet` | admin `wallet` | TEMP_WALLET_RELEASE |

---

# PART F — HOW SUPER_ADMIN CONFIGURES EVERYTHING

## E.1 What SUPER_ADMIN sets (and where stored)
| Setting | Field | Stored on |
|---------|-------|-----------|
| Hierarchy % (profit model) | `profitSubBrokerPercent`, `profitBrokerPercent`, `profitAdminPercent` | `GameSettings.games.<g>` |
| Hierarchy % (gross model) | `grossPrizeSubBrokerPercent`, `grossPrizeBrokerPercent`, `grossPrizeAdminPercent` | `GameSettings.games.<g>` |
| Win fee | `brokeragePercent` | `GameSettings.games.<g>` |
| BTC jackpot hierarchy | `hierarchy.{subBrokerPercent,brokerPercent,adminPercent}` | `GameSettings.games.btcJackpot` |
| Sub-broker cascade | `subBrokerShareToBroker` (default true) | `GameSettings.games.<g>` |
| Referral % | `referralDistribution.winPercent` (+ `topRanksOnly`, `topRanksCount`) | `GameSettings.games.<g>` |
| Global fallback split | `profitDistribution.{superAdmin,admin,broker,subBroker}Percent` | `GameSettings` (root) |
| Trading referral % | `referralPercent` (default 10) | referral config / GameSettings |
| Referral segment toggles | `referralDistributionEnabled.{games,trading,mcx,crypto,forex}` | each `Admin` node |
| Referral payout threshold | `referralEligibility.{enabled,thresholdAmount,thresholdUnit}` | `Admin` (super admin) |

## E.2 API endpoints (all `protectAdmin, superAdminOnly` unless noted)
**Game settings (percentages + referral %)** — base `/api/admin/manage`:
```
GET /game-settings                       → full GameSettings
PUT /game-settings                       → { games:{ <g>:{ profit*Percent, grossPrize*Percent, brokeragePercent,
                                              referralDistribution:{winPercent, topRanksOnly, topRanksCount} } } }
PUT /game-settings/game/:gameId          → single game's config
```
Both deep-merge via `mergeGameConfigForAdmin()` so partial saves don't wipe nested `referralDistribution` fields.

**Per-subtree referral enable toggles:**
```
GET /admins/:id/patti-sharing            → { ..., referralDistributionEnabled:{games,trading,mcx,crypto,forex} }
PUT /admins/:id/patti-sharing            → { referralDistributionEnabled:{...} }
PUT /admins/:id/franchise-root           → also carries referralDistributionEnabled
```

**Referral payout threshold** — base `/api/referral-eligibility`:
```
GET /settings                            → { enabled, thresholdAmount, thresholdUnit }
PUT /settings                            → { enabled?, thresholdAmount?(>0), thresholdUnit?('PER_CRORE'|'ABSOLUTE') }
```

## E.3 Frontend config UI
- Per-game referral fields: `client/src/components/admin/GameReferralDistributionFields.jsx` — `winPercent`
  (label adapts per game) + jackpot `topRanksOnly`/`topRanksCount`.
- Hierarchy % + game economics: game-settings admin panel (e.g. `BtcJackpotAdminPanel.jsx`).
- Segment enable toggles: `dashboard/modals/ReferralGamesTradingToggles.jsx`, `settings/ReferralDistributionSettings.jsx`.

## E.4 End-to-end flow
```
1) SUPER_ADMIN configures:
   PUT /game-settings/game/niftyNumber { grossPrizeSubBrokerPercent:2, grossPrizeBrokerPercent:1,
                                          grossPrizeAdminPercent:0.5, referralDistribution:{winPercent:10} }
   PUT /admins/<adminId>/patti-sharing { referralDistributionEnabled:{ games:true, trading:true } }
   PUT /referral-eligibility/settings  { enabled:true, thresholdAmount:1000, thresholdUnit:'PER_CRORE' }

2) A user wins a game (or closes a trade):
   (A) HIERARCHY commission → SB/BR/AD to temporaryWallet (games) or wallet.balance (trading), SA to wallet
        → GAME_PROFIT / BROKERAGE ledgers → bump SuperAdminHierarchyEarnings.
   (B) REFERRAL → games: first-win base×winPercent → gamesWallet; trading: 10%×brokerage → segment wallet
        → both pass the threshold gate (SA hierarchy earnings ≥ 1000/crore?) → pay or hold.

3) Idempotency guards prevent double credit; SUPER_ADMIN later releases temporaryWallet → main via /release-temporary-funds.
```

---

## G. Data Models (quick reference)
```js
// GameSettings.games.<g>  (SUPER_ADMIN-owned)
{ winMultiplier, brokeragePercent, subBrokerShareToBroker,
  profitSubBrokerPercent, profitBrokerPercent, profitAdminPercent,               // Model A split of fee T
  grossPrizeSubBrokerPercent, grossPrizeBrokerPercent, grossPrizeAdminPercent,   // Model B % of gross G
  hierarchy:{subBrokerPercent,brokerPercent,adminPercent},                       // btcJackpot only
  referralDistribution:{ winPercent, topRanksOnly, topRanksCount } }
// GameSettings.profitDistribution  { superAdminPercent:40, adminPercent:30, brokerPercent:20, subBrokerPercent:10 }

// Admin
{ wallet:{balance,blocked,totalDeposited,totalWithdrawn}, temporaryWallet:{balance,totalEarned,totalReleased,lastReleasedAt},
  kuberWallet:{balance}, stats:{totalBrokerage},
  referralDistributionEnabled:{games,trading,mcx,crypto,forex},
  referralEligibility:{enabled,thresholdAmount,thresholdUnit}, receivesHierarchyBrokerage, status }

// User   { referredBy, referralStats:{ totalReferralEarnings, firstGameWinByGame:{<gameKey>:Boolean} } }
// Referral { referrer, referredUser, earnings, status, firstGameWin, tradingReferralCount, tradingReferrals[] }
// SuperAdminHierarchyEarnings { totalEarnings, earningsBySegment:{games,trading,mcx,crypto,forex} }  // unique per superAdminId+rootAdminId
```

---

## H. Reimplementation Checklist
1. `GameSettings.games.<g>` with `profit*`, `grossPrize*`, `brokeragePercent`, `subBrokerShareToBroker`, `referralDistribution`, `btcJackpot.hierarchy`; global `profitDistribution`.
2. Hierarchy resolver: walk `user.admin → parentId … → SUPER_ADMIN`, build `[{admin, role}]`.
3. `computeGrossHierarchyBreakdown(user, G, cfg)` (Model B) + `distributeWinBrokerage(user, T, cfg)` (Model A) with **cascade** + **eligibility** (else divert to SA).
4. SA pool credit-on-stake / debit-on-payout+hierarchy for BTC games; Nifty Up/Down no pool.
5. **Commission destinations:** trading brokerage → `wallet.balance` (all roles); games → `temporaryWallet` (non-SA) / `wallet` (SA). Ledgers with `profitKind`/`sharePercent`/`baseAmount`/`relatedUserId`.
6. Bump `SuperAdminHierarchyEarnings.earningsBySegment`.
7. **Games referral:** first-win-per-game, base×winPercent → referrer `gamesWallet`, idempotent by first-win + session scope.
8. **Trading referral:** on close, `10%×brokerage` → referrer segment wallet (mcx/crypto/forex/main) → log in `tradingReferrals[]`; add a `tradeId` idempotency guard.
9. **Shared gate:** `referralDistributionEnabled[segment]` (mcx/crypto/forex require master `trading`) + `referralEligibility` PER_CRORE/ABSOLUTE threshold via `SuperAdminHierarchyEarnings`.
10. **Temp release:** SA-only `/release-temporary-funds` (temp → main, paired `TEMP_WALLET_RELEASE`). **Kuber pool** for patti/franchise. **Withdrawal:** `AdminFundRequest` against `wallet.balance`.
11. SUPER_ADMIN config endpoints (`/game-settings*`, `/admins/:id/patti-sharing`, `/referral-eligibility/settings`) with deep-merge; frontend fields + toggles. User referral UI (code/link, stats, earnings).

---

## I. Invariants & Gotchas
- **"Coins" (◉) = INR display only** — no separate currency/ledger. Every balance is INR. Games "tokens" (₹300) are a ticket unit, not a wallet currency.
- **SUPER_ADMIN has 2 wallets:** `wallet` (personal/games-house, withdrawable) + `kuberWallet` (house pool for patti/franchise payouts, ₹100 cr cap). Non-SA admins have `wallet` + `temporaryWallet` only.
- **Patti share lands in `wallet.balance` at every level**; SA funds it from `kuberWallet` (franchise 100% / patti pattiPct%) + main `wallet` (rest). Child % can never exceed the parent's %.
- **Brokerage-extra sharing is ADMIN-only**, 5% of the amount above the parent cap → SA `wallet`.
- **Inter-admin funds: requests flow UP, funds flow DOWN.** Direct transfer debits parent `wallet` (or SA kuber+main); fund-request approval debits approver `wallet` (SA skips the balance gate).
- **SA "unlimited" = no approval-balance gate**, not an infinite pool; SA funding a user debits the user's *managing admin*, not SA.
- **Two independent streams:** hierarchy commission (every win/trade, to the player's admins) vs referral (to the referrer user). Never merge them.
- **Model choice is automatic:** `sumGross > 0` → gross model (Number/Jackpot/Bracket); else profit-only (Up/Down).
- **SUPER_ADMIN gets the remainder** after configured SB/BR/AD, plus diverted (ineligible) shares.
- **Cascade up** when a role is missing; **divert to SA** when an admin is ineligible/restricted/inactive.
- **Trading brokerage → admin `wallet.balance` for every role.** Only **games** use `temporaryWallet` for non-SA roles.
- **temporaryWallet is not withdrawable** until SUPER_ADMIN manually releases it → main wallet. No cron does this.
- **kuberWallet is SUPER_ADMIN-only** — a house pool to fund patti/franchise, not personal earnings.
- **All trading segments accrue to one admin `wallet.balance`** — segment only in ledger meta.
- **Trading referral is per-trade & cumulative** (referrer gets 10% of brokerage into a *segment* wallet); **games referral is once-per-game** (first win, into `gamesWallet`).
- **Referral is gated** by segment enable toggle, 1-month window, top-rank (jackpots), and the hierarchy-earnings threshold (default 1000/crore); held if not reached.
- **Games referral is idempotent** (first-win-per-game + session scope). **Trading referral has no hard dedupe** — add one.
- **Deep-merge game settings** on save so nested `referralDistribution` fields survive partial updates.
- **All money rounds to 2 dp.**

---

*Generated from the StockEx codebase. Referral: `server/services/{referralService,referralPayoutService,referralEligibilityService,referralGameStakeCredit,referralPerWin}.js`,
`server/models/Referral.js`, `server/routes/referralRoutes.js`, `server/controllers/{referralController,authController}.js`,
`client/src/pages/UserDashboardNew.jsx (ReferralPanel)`. Hierarchy distribution: `server/services/{gameProfitDistribution,upDownSettlementService,niftyNumberDeclareService,btcNumberDeclareService,niftyJackpotDeclare,niftyBracketResolve,btcJackpotDeclareService}.js`,
`server/utils/{adminBrokerageEligibility,referralDistributionHelper,btcUpDownSuperAdminPool,btcJackpotPool,kuberWallet}.js`.
Admin commission wallets: `server/models/Admin.js`, `server/services/{tradeService,gameProfitDistribution}.js`,
`server/routes/adminManagementRoutes.js` (release-temporary-funds, fund requests), `server/models/{WalletLedger,SuperAdminHierarchyEarnings}.js`.
See `gameslogic.md` (game mechanics) and `wallet.md` (multi-wallet system).*
