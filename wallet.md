# StockEx — Multi-Wallet System: Complete Logic & Reimplementation Spec

> **Purpose of this document**
> Self-contained specification of the **multi-wallet system** of StockEx — the per-segment wallets (NSE/BSE, MCX,
> Crypto, Forex, Games) plus the Main wallet and Delivery-Pledge, how a user **trades directly from a segment wallet
> (never touching the Main wallet)**, how Admin/SuperAdmin control each wallet, the fund-transfer flows, and the
> per-wallet **stop-out / ledger-autosquare** risk logic. Written so an AI assistant or developer can re-implement the
> exact same behaviour in a new project.
>
> Stack it was built on: **Node.js + Express + MongoDB (Mongoose)** backend, **React (Vite) + TailwindCSS** frontend,
> Socket.IO for live wallet updates. Swap any layer as long as the contracts below hold.

---

## 0. TL;DR — Core Mental Model

- The user has **one main "cash" wallet** and **five independent segment wallets**, plus a delivery-pledge margin pool:

  | Wallet          | Card in UI   | Used for                                  | Object on `User` |
  |-----------------|--------------|-------------------------------------------|------------------|
  | Main / Cash     | (Main)       | deposit/withdraw entry point only         | `wallet`         |
  | NSE & BSE       | IND-xxxxx    | NSE/BSE equity + NFO derivatives          | `nseBseWallet`   |
  | MCX             | MCX-xxxxx    | MCX commodity futures/options             | `mcxWallet`      |
  | Crypto          | CRYPTO-xxxxx | Binance crypto                            | `cryptoWallet`   |
  | Forex           | FOREX-xxxxx  | Synthetic forex (Stockex coins)           | `forexWallet`    |
  | Games           | GAMES-xxxxx  | Fantasy/prediction games                  | `gamesWallet`    |
  | Delivery Pledge | (internal)   | pledge margin for NFO from CNC stock buys | `deliveryPledge` |

- **The golden rule:** a trade in a segment debits **only that segment's wallet**. The Main wallet is **never** used
  for trading — it only receives deposits and funds the segment wallets via transfer. The user clicks "Trade" on a
  wallet card → the trader room opens in that segment's mode → orders route to that wallet only.

- **Each segment wallet is fully independent**: its own `balance`, `usedMargin`, `equity`, `marginLevel`, P&L,
  `ledgerReferenceBalance`, `profitBlocked`, and its own stop-out / auto-square. NSE stop-out never touches MCX, etc.

- **Money in:** admin/parent deposits into a wallet (or user files a fund request) → lands in **Main** → user
  "transfers"/"moves" into the segment wallet they want to trade. Money out: reverse.

- **Admin/SuperAdmin** control every wallet: add/deduct funds (debiting their own wallet), block a wallet
  (`profitBlocked`), set the auto-square loss % and leverage per segment, and the hierarchical who-can-touch-whose-wallet
  permissions.

---

## 1. Wallet Data Models (`models/User.js`)

All wallets are embedded sub-documents on the `User`. Key fields per wallet type.

### 1.1 Main / Cash wallet — `wallet` (`User.js:157-265`)
```js
wallet: {
  cashBalance,          // PRIMARY: deposits/withdrawals land here; funds segment wallets via transfer
  balance,              // legacy mirror of cashBalance
  tradingBalance,       // LEGACY (migrated into nseBseWallet.balance) — keep 0
  equity, usedMargin, freeMargin, marginLevel, marginCallActive,
  collateralValue,
  totalUnrealizedPnL, totalRealizedPnL, totalCommissions,
  depositTotal, withdrawalTotal,
  realizedPnL, unrealizedPnL, todayRealizedPnL, todayUnrealizedPnL,   // legacy trackers
  blocked,                         // legacy == usedMargin
  mainWalletBlocked,               // legacy → use nseBseWallet.profitBlocked
  tradingWalletBlocked,            // legacy → use nseBseWallet.profitBlocked
  lastUpdatedAt,
  transactions: [ {type, amount, description, performedBy, createdAt} ]  // embedded mini-ledger
}
```
> The Main wallet does **not** carry trading margin in the current design; trading margin lives on the segment wallets.

### 1.2 Segment wallets — shared shape
`nseBseWallet` (`User.js:499-515`), `mcxWallet` (`410-497`), `cryptoWallet` (`267-349`), `forexWallet` (`351-373`):
```js
<segment>Wallet: {
  balance,              // free cash allocated to THIS segment
  usedMargin,           // margin locked by OPEN+PENDING trades in this segment
  equity,               // balance + totalUnrealizedPnL  (mcx/crypto/forex carry this explicitly)
  freeMargin,           // equity - usedMargin
  marginLevel,          // (equity / usedMargin) * 100 ; null when usedMargin==0 (show "–")
  marginCallActive,
  totalUnrealizedPnL, totalRealizedPnL, totalCommissions,
  realizedPnL, unrealizedPnL, todayRealizedPnL, todayUnrealizedPnL,   // (nseBse uses the plain ones)
  depositTotal, withdrawalTotal,
  ledgerReferenceBalance,   // baseline for ledger % autosquare (e.g. ₹1L → cut at 90% loss)
  ledgerAutosquareActive,   // true after an autosquare fired (re-entry guard)
  ledgerAutosquaredAt,
  profitBlocked,            // admin lever: if true, profits are NOT credited (losses still apply)
  lastUpdatedAt,
}
```
> `nseBseWallet` is the leaner variant (no explicit `equity`/`freeMargin`/`marginLevel` in schema — those are computed
> on read). `mcx/crypto/forex` store them.

### 1.3 Games wallet — `gamesWallet` (`User.js:517-550`)
```js
gamesWallet: { balance, usedMargin, realizedPnL, unrealizedPnL, todayRealizedPnL, todayUnrealizedPnL, profitBlocked }
```
No equity/marginLevel; "free" = `balance − usedMargin`. (Full games logic is in `gameslogic.md`.)

### 1.4 Delivery Pledge — `deliveryPledge` (`User.js:375-408`)
```js
deliveryPledge: { balance, usedMargin, holdingsValue, marginPercent(50), lastUpdated }
```
When a user buys CNC (delivery) stock, X% (default 50) of stock value becomes **pledge margin usable ONLY for
NFO/Futures margin — never to cover losses.**

### 1.5 Per-segment settings that drive wallet risk (`User.segmentPermissions` Map, `User.js:666-758`)
Each segment key holds (among many): `lotSettings.{intradayLeverage, carryForwardLeverage, notificationPercent, autosquarePercent}`,
`quantityModeSettings.{...}`, plus `user.settings.ledgerBalanceClosePercent` (global fallback, default 90). These are
**inherited from the parent admin at creation** and can be overridden. `notificationPercent` = low-margin warning;
`autosquarePercent` = loss % at which the wallet auto-squares.

---

## 2. Segment → Wallet Mapping (the golden rule)

This is the single most important part: **which wallet a trade hits**. It is decided purely from the instrument's
segment/exchange flags — the Main wallet is never selectable for trading.

### 2.1 Selection function (`utils/orderAvailableMargin.js:23-28`)
```js
function resolveWalletFieldFromFlags({ isCrypto, isForex, isMCX }) {
  if (isCrypto) return 'cryptoWallet';
  if (isForex)  return 'forexWallet';
  if (isMCX)    return 'mcxWallet';
  return 'nseBseWallet';        // DEFAULT for NSE/BSE/NFO — NOT the main wallet
}
```

### 2.2 By segment string (`services/walletService.js:23-62 → getWalletBySegment`)
| Segment / exchange                                   | Wallet field   |
|------------------------------------------------------|----------------|
| `BINANCE`, `CRYPTOFUT`, `CRYPTOOPT`, isCrypto        | `cryptoWallet` |
| `FOREX`, `FOREXFUT`, `FOREXOPT`, isForex             | `forexWallet`  |
| `MCX`, `MCXFUT`, `MCXOPT`, `COMMODITY`, exch=MCX     | `mcxWallet`    |
| everything else (NSE, BSE, NFO, NSEFUT/OPT, BSE-*)   | `nseBseWallet` |
| game bets (`gameType`/`isGame`)                      | `gamesWallet`  |

### 2.3 Per-wallet trade query (`services/walletService.js:219-259`, mirrored in `recalculateUsedMargin.js`)
Used to sum a wallet's margin and to auto-square only that wallet's positions:
```js
crypto : { $or:[{isCrypto:true},{exchange:'BINANCE'}] }
forex  : { $or:[{isForex:true},{exchange:'FOREX'},{segment:{$in:['FOREX','FOREXFUT','FOREXOPT']}}] }
mcx    : { $or:[{exchange:'MCX'},{segment:{$in:['MCX','MCXFUT','MCXOPT']}}] }
nseBse : { isCrypto:{$ne:true}, isForex:{$ne:true}, exchange:{$nin:['BINANCE','MCX','FOREX']},
           segment:{$nin:['FOREX','FOREXFUT','FOREXOPT','MCX','MCXFUT','MCXOPT']} }   // default bucket
```

### 2.4 How the frontend enforces it (Trade button)
The wallet card's **Trade** button opens the trader room in that segment's **mode**, so only that wallet's
instruments show and orders route to that wallet:
```
IND (NSE/BSE) → /user/trader-room                (no mode → nseBseWallet default)
MCX           → /user/trader-room?mode=mcx       → mcxWallet
Crypto        → /user/trader-room?mode=crypto    → cryptoWallet
Forex         → /user/trader-room?mode=forex     → forexWallet
Games         → /user/games
```
Trader room reads `searchParams.get('mode')` (`UserDashboard.jsx:921-923`) and filters instruments + routes orders
accordingly. **The Main wallet has no Trade button — it cannot place trades.**

---

## 3. Wallet Recalculation (equity / margin / free margin)

### 3.1 usedMargin — recomputed from open trades (`utils/recalculateUsedMargin.js:25-130`)
Runs on order place / cancel / partial-close / periodic sync. For each wallet, sum over `status ∈ {OPEN, PENDING}`
trades matching that wallet's query:
```
usedMargin = Σ (trade.marginUsed || trade.requiredMargin) + (trade.brokerageReservedInMargin ? trade.commission : 0)
```
Only writes to DB if the delta > 0.01 (avoids write storms). Also clears the legacy `wallet.usedMargin` once
`nseBseWallet.usedMargin` is set.

### 3.2 equity / marginLevel — recomputed on every price tick (`services/walletService.js:112-212 → recalculateWallet`)
```
equity        = balance + totalUnrealizedPnL
unrealizedLoss= max(0, -totalUnrealizedPnL)
availableMargin (freeMargin) = balance * leverage − usedMargin − unrealizedLoss
marginLevel   = usedMargin > 0 ? (equity / usedMargin) * 100 : null   // null shown as "–"
```

### 3.3 Available balance for a NEW order (`utils/orderAvailableMargin.js:73-94`)
```
available = (balance − usedMargin) + openMTM     // openMTM = mark-to-market of open positions (bid for BUY, ask for SELL)
```

### 3.4 Margin blocking on open / release on close
- **Open:** block `trade.marginUsed` into `<wallet>.usedMargin`; debit round-trip brokerage from `<wallet>.balance`
  (prepaid) — see `utils/subwalletCashWallet.js`. Brokerage can alternately be reserved in margin
  (`brokerageReservedInMargin`).
- **Close:** release `marginUsed` from `usedMargin`; add net P&L to `balance` (subject to `profitBlocked`); write a
  `WalletLedger` row.

---

## 4. Fund Flow — Deposits, Withdrawals, Transfers, "Move to Main"

### 4.1 Money in / out (Main wallet is the entry point)
- **User fund request:** `POST /api/user/funds/fund-request/deposit|withdraw` → creates `FundRequest`
  (`{type, amount, paymentMethod, bankAccount, referenceId, proofUrl, status:'PENDING'}`). Admin approves →
  credits/debits **Main** `wallet.cashBalance` and writes `WalletLedger`.
- **Admin direct add/deduct:** `POST /users/:id/add-funds` / `deduct-funds` (`adminManagementRoutes.js:5645-5912`):
  debits/credits the **admin's own wallet** and mirrors into the user's wallet, writing paired ledgers
  (reasons `FUND_ADD` / `FUND_DEDUCT`). Withdrawal is blocked if effective trading balance (balance+unrealizedPnL) is
  negative or outside the admin's min/max withdrawal limits.

### 4.2 Move funds between Main and a segment wallet
Each segment card has Deposit/Withdraw (Main↔segment) and "Move to Main":
```
Main ↔ NSE/BSE : POST /api/user/funds/internal-transfer  { amount, direction:'toAccount'|'toWallet' }
Main ↔ MCX     : POST /api/user/funds/mcx-transfer        { amount, direction:'toMcx'|'fromMcx' }
Main ↔ Games   : POST /api/user/funds/games-transfer      { amount, direction:'toGames'|'fromGames' }
Main ↔ Crypto  : POST /api/user/funds/crypto-transfer     { amount, direction:'toCrypto'|'fromCrypto' }
Main ↔ Forex   : POST /api/user/funds/forex-transfer      { amount, direction:'toForex'|'fromForex' }
```
Backend (`utils/nseBseWallet.js:141-204` for NSE, analogous for others): atomic `findOneAndUpdate` with a balance
guard — e.g. Main→NSE debits `wallet.cashBalance` and credits `nseBseWallet.balance` only if cashBalance ≥ amount.
"Move to Main" is just `direction:'toWallet'/'fromXxx'` (segment→Main), and can only move **free** balance.

### 4.3 Transfer between any two wallets (mesh)
```
POST /api/user/wallet-transfer
{ sourceWallet, targetWallet, amount, remarks }
   // wallets: wallet | nseBseWallet | mcxWallet | cryptoWallet | forexWallet | gamesWallet
GET  /api/user/wallet-transfer-limits   → per-wallet { totalBalance, usedMargin, transferable }
```
Service `services/walletTransferService.js:309-491`:
- **Transferable = `balance − usedMargin`** for segment/games wallets (locked margin can't move); Main = full
  `cashBalance` (`getTransferableBalanceDetails:64-123`).
- Debit uses **atomic** `atomicMarginSegmentDebitForTransfer` (`utils/segmentWalletDebit.js:22-60`) — a `$expr`
  guard so `(balance − usedMargin) ≥ amount`, race-safe.
- Writes **two paired ledger rows** with the same `meta.transferId`: DEBIT (`WALLET_TRANSFER_DEBIT`) on source,
  CREDIT (`WALLET_TRANSFER_CREDIT`) on target.
- Blocked if either wallet has `profitBlocked` (`assertTransferWalletsAllowed`).

### 4.4 Peer transfer (user → another client in the same hierarchy)
```
POST /api/user/peer-transfer            { recipientUserId, amount, remarks }
GET  /api/user/peer-transfer/clients?search=&limit=500
GET  /api/user/peer-transfer/history?limit=50
```

### 4.5 Ledgers & audit
- `WalletLedger` reasons: `FUND_ADD`, `FUND_DEDUCT`/`FUND_WITHDRAW`, `TRADING_FUND_ADD/WITHDRAW`,
  `WALLET_TRANSFER_DEBIT/CREDIT`, `TRADE_PNL`, `BROKERAGE`, `PROFIT_SHARE`, etc. Meta: `transferId`, `sourceWallet`,
  `targetWallet`, `tradeId`, `leg`, `sharePercent`.
- Per-wallet transfer ledger view: `GET /api/user/funds/subwallet-transfer-ledger?wallet=trading|mcx|games|crypto|forex&limit=50`.

---

## 5. Admin / SuperAdmin Control Over Wallets

### 5.1 Hierarchical permissions (`services/walletPermissionService.js:25-262`)
`checkPermission(requesterId, targetUserId, action)` → `{ allowed, reason, permissionLevel }`:
- **SUPERADMIN:** any action (view/deposit/withdraw) on any user.
- **ADMIN/BROKER/SUB_BROKER — direct parent** of the user (`targetUser.admin === requester`): view + deposit + withdraw.
- **Indirect ancestor** (in the user's `hierarchyPath`, not direct): **view only**.
- **Non-hierarchy (cross-broker):** **deposit only** (lending), never withdraw/view.
Helpers: `_isInHierarchy`, `_isDescendant` (adminCode match), `_isIndirectParent` (walk up, max 10 levels).

### 5.2 Add / deduct funds to a user's wallet
`adminManagementRoutes.js:5645-5912` (main), `6335-6489` (crypto). Adding funds **debits the admin's own wallet** and
credits the user; paired ledgers on both sides. SuperAdmin has effectively unlimited funds. Crypto add/deduct writes
directly without an admin debit in some paths (`CRYPTO_DEPOSIT`/`CRYPTO_DEBIT`).

### 5.3 Block a wallet — `profitBlocked` (`utils/walletBlock.js`)
```js
WALLET_BLOCK_TYPES = { nseBse:'nseBseWallet', mcx:'mcxWallet', games:'gamesWallet', crypto:'cryptoWallet', forex:'forexWallet' }
isWalletProfitBlocked(user, type)              // user[field].profitBlocked === true
profitAllowedForWallet(user, type, pnl)        // pnl<=0 → pnl (losses always apply); pnl>0 & blocked → 0 (profit withheld)
assertWalletOperationsAllowed(user, walletKey) // throws "<label> Wallet is disabled" on trade/transfer/deposit
```
Admin sets `user.<wallet>.profitBlocked = true`. Effect: user keeps taking losses but **cannot realize profit**, and
trades/transfers/deposits on that wallet are refused. Enforced in stop-out close (`stopOutService.js:265-267`),
transfers (`walletTransferService.js:320`), and the frontend (card greyed out, buttons disabled).

### 5.4 Per-segment risk knobs admin controls (inherited by user)
Via `Admin.segmentPermissions` → `User.segmentPermissions`: `intradayLeverage`, `carryForwardLeverage`,
`notificationPercent`, `autosquarePercent`, min/max lots/qty, and `ledgerReferenceBalance` seed. Merged as
system → admin → user overrides.

---

## 6. Per-Wallet Risk Engine — Stop-Out, Ledger-Autosquare, Margin Monitor

Every segment wallet runs its **own** risk logic, keyed by `walletField`, independent of the others.

### 6.1 Margin monitor — the heartbeat (`services/marginMonitorService.js`)
- `onPriceTick()` (`:107-151`): on each price tick, find open trades (2.5s cache to survive tick floods), group by
  user, `processUserPositions()`.
- `processUserPositions()` (`:160-299`): read segment settings (`notificationPercent`, `autosquarePercent`), bulk-update
  each position's `unrealizedPnL`, `WalletService.recalculateWallet(userId, segment)`, then decide
  `NONE | MARGIN_CALL | STOP_OUT`, run the ledger-autosquare check, and emit a wallet update over Socket.IO.

### 6.2 Stop-out (`services/stopOutService.js:43-167 → executeStopOut`)
Triggered when `marginLevel ≤ STOP_OUT_LEVEL` (default **50%**, from `RiskConfig.STOP_OUT_LEVEL`):
1. Cancel ALL pending orders for that wallet's segment (releases their margin).
2. Recalculate wallet; stop if margin restored.
3. Query open positions sorted by `unrealizedPnL asc` (**most-losing first**) and close them one by one
   (`closePosition:205-309`), **recalculating after each close**; stop as soon as `marginLevel > STOP_OUT_LEVEL`.
4. If after closing everything `balance < 0 && usedMargin == 0`: set `negativeBalanceFlag`, `tradingStatus='BLOCKED'`,
   notify admin (critical). Profit-block respected on each close (`profitAllowedForWallet`).

### 6.3 Ledger % auto-square (`services/ledgerAutosquareService.js`)
"Cut everything when the wallet's loss reaches X% of its reference balance" — **per wallet**:
- `ledgerReferenceBalance` (`:93-114`): baseline; seeded from current cash on first use, kept as `max(cash, existing)`.
- `computeLedgerRealBalance()` (`:285-367`): `realBalance = cash + Σ openMTM`; `lossPercent = (reference − real)/reference*100`;
  `autosquarePercent` from segment settings (default **90%**; Crypto often **70%**); `shouldTrigger = lossPercent ≥ autosquarePercent`
  (or realBalance≈0 & loss≥99).
- `executeLedgerAutosquareNil()` (`:391-503`): guard on `ledgerAutosquareActive`; close all open positions at mark
  price via `TradingService.squareOffPosition`; recalc; set `ledgerAutosquareActive=true`, `ledgerAutosquaredAt=now`;
  write ledger (meta: segment, lossPercent, autosquarePercent) + notify.
- `checkAndRunLedgerAutosquare()` (`:505-555`): clears the flag when no positions remain; 2.5s grace after a position
  opens before it can trigger.

### 6.4 Backup poll (`services/segmentLedgerAutosquarePoll.js`)
Independent 2s loop (1.5s per-user throttle) over NSE/BSE, MCX, Crypto users with open positions — catches loss cuts
missed when ticks are throttled or session gates skip the monitor.

### 6.5 Margin-call reduction engine (`services/autoSquareOffEngine.js`)
`calculateReduction` / `calculatePortfolioReduction` compute how much quantity to trim when
`balance + m2mPnL < requiredMargin` (`reductionExposure = totalExposure − maxAllowedExposure`), allocated **FIFO**
(`allocateReductionFifo`, oldest first).

### 6.6 Key thresholds & timings
| Knob | Default | Scope | Source |
|------|---------|-------|--------|
| STOP_OUT_LEVEL | 50% | per wallet (marginLevel) | `RiskConfig.STOP_OUT_LEVEL` |
| Ledger autosquare % | 90% (NSE/MCX), 70% (Crypto) | per wallet | segment `autosquarePercent` / `settings.ledgerBalanceClosePercent` |
| notificationPercent | segment-set | per wallet | segment settings |
| ledgerReferenceBalance | current cash on first use | per wallet | `user.<wallet>.ledgerReferenceBalance` |
| autosquare open grace | 2500 ms | global | `ledgerAutosquareService` |
| segment poll interval | 2000 ms | global | `segmentLedgerAutosquarePoll` |
| margin monitor cache TTL | 2500 ms | global | `marginMonitorService` |

---

## 7. Frontend — "My Accounts" page (`client/src/pages/UserAccounts.jsx`)

### 7.1 Data sources
- `GET /api/user/funds/nse-bse-wallet` → `{ balance, usedMargin, availableBalance, profitBlocked, mainBalance }` (IND card).
- `GET /api/user/wallet` → `{ cashBalance, mcxWallet, gamesWallet, cryptoWallet, forexWallet, walletBlocks, ... }` (all others + Main).
- Auto-refreshes on the `AUTO_REFRESH_EVENT` and via a manual refresh button.
- Display helpers: `utils/stockexCoins.js` (`formatCoins`, `◉` symbol), `utils/walletDisplaySanity.js`
  (caps corrupted balances), `utils/resolveMainWalletBalance.js`, `lib/walletProfitBlock.js`.

### 7.2 Per-card actions (endpoints in §4)
Each card shows balance, used margin (if >0), P&L (segment), and buttons:
- **Trade/Play** → navigates to trader room with the right `?mode=` (or `/user/games`).
- **Add funds/Deposit** & **Withdraw/Move to Main** → the Main↔segment transfer endpoints (§4.2).
- **Transfer** → dropdown → `POST /api/user/wallet-transfer` (mesh, §4.3), gated by `/wallet-transfer-limits`.
- **View transaction history** → orders / games ledger; **Transfer ledger** → `subwallet-transfer-ledger`.

### 7.3 Profit-block UX
If a wallet's `profitBlocked` (from `walletBlocks.<seg>` or `<wallet>.profitBlocked`), the card is greyed
(opacity/greyscale/red border), buttons disabled, and clicks show `WALLET_DISABLED_ALERT`.

### 7.4 Transfer-limit UX (`lib/walletTransferLimits.js`)
`validateTransferAmount(limits, sourceWallet, amount)` → shows the breakdown when margin is locked:
`(balance ₹X − used margin ₹Y = transferable ₹Z)` and blocks over-transfer.

---

## 8. API Reference (wallet-related)

**User**
```
GET  /api/user/wallet                              → all sub-wallets + main balance
GET  /api/user/funds/nse-bse-wallet                → NSE/BSE balance + margin + profitBlocked
GET  /api/user/wallet-transfer-limits              → per-wallet transferable
POST /api/user/wallet-transfer                     → { sourceWallet, targetWallet, amount, remarks }
POST /api/user/funds/internal-transfer             → { amount, direction:'toAccount'|'toWallet' }   (Main↔NSE/BSE)
POST /api/user/funds/mcx-transfer                  → { amount, direction:'toMcx'|'fromMcx' }
POST /api/user/funds/games-transfer                → { amount, direction:'toGames'|'fromGames' }
POST /api/user/funds/crypto-transfer               → { amount, direction:'toCrypto'|'fromCrypto' }
POST /api/user/funds/forex-transfer                → { amount, direction:'toForex'|'fromForex' }
GET  /api/user/funds/subwallet-transfer-ledger?wallet=trading|mcx|games|crypto|forex&limit=50
POST /api/user/funds/fund-request/deposit|withdraw → { amount, paymentMethod, bankAccount, referenceId, proofUrl }
POST /api/user/peer-transfer                        → { recipientUserId, amount, remarks }
GET  /api/user/peer-transfer/clients | /history
```
**Admin (hierarchical permission enforced)**
```
POST /api/admin/manage/users/:id/add-funds         → { amount, description }   (debits admin wallet)
POST /api/admin/manage/users/:id/deduct-funds       → { amount, description }
POST /api/admin/manage/users/:id/add-crypto-funds | deduct-crypto-funds
// plus profitBlocked toggles and per-segment settings updates on the user document
```

---

## 9. Reimplementation Checklist (do in order)

1. **User model:** add `wallet` (main/cash) + five segment sub-wallets with the shared shape (§1.2), `gamesWallet`,
   `deliveryPledge`, and `segmentPermissions` (leverage + `notificationPercent` + `autosquarePercent`).
2. **Segment→wallet resolver** (`resolveWalletFieldFromFlags` / `getWalletBySegment`) and the per-wallet trade queries (§2.3).
   This is what guarantees a trade hits only its segment wallet, never Main.
3. **Recalc functions:** `recalculateUsedMargin` (from OPEN+PENDING) and `recalculateWallet` (equity/freeMargin/marginLevel), delta-guarded writes.
4. **Order open/close** debits/credits the resolved wallet only; brokerage prepaid or reserved; ledger rows on close.
5. **Fund flow:** deposit/withdraw into Main; Main↔segment `*-transfer` endpoints (atomic, balance-guarded);
   mesh `wallet-transfer` (transferable = balance−usedMargin, paired transferId ledgers); peer transfer.
6. **Admin control:** `walletPermissionService` (superadmin/direct-parent/indirect/cross-broker rules); add/deduct funds
   that debit the admin's own wallet; `profitBlocked` per wallet with `profitAllowedForWallet` + operation asserts.
7. **Risk engine:** margin monitor on tick → recalc → stop-out (50% marginLevel, FIFO most-losing-first) + ledger
   autosquare (loss % ≥ segment autosquarePercent, per-wallet reference balance, re-entry guard) + backup poll.
8. **Frontend accounts page:** one card per wallet with Trade(mode)/Deposit/Withdraw/Transfer/Move-to-Main/ledgers,
   profit-block greying, transfer-limit breakdown, and the Trade→`?mode=` routing so the trader room binds the segment wallet.

---

## 10. Invariants & Gotchas (don't break these)

- **Main wallet is not a trading wallet.** It only receives deposits and funds segment wallets. No Trade button, no
  `usedMargin` from trades. All trading margin/P&L lives on the segment wallets.
- **A trade debits exactly one wallet** — the one resolved from its segment flags. Never fall back to Main for trading.
- **Only free balance transfers.** Transferable = `balance − usedMargin`; locked margin cannot move. Use atomic
  `$expr`-guarded updates to stay race-safe under concurrent transfers/trades.
- **Every wallet is independent** for balance, margin, stop-out, ledger-autosquare, `ledgerReferenceBalance`, and
  `profitBlocked`. NSE stop-out must not touch MCX, etc.
- **profitBlocked withholds profit but not loss.** Positive P&L → 0 when blocked; negative P&L always applies.
- **Stop-out order:** cancel pendings → recalc → close most-losing FIFO → recalc after each → stop when restored →
  flag negative balance + block trading if still underwater.
- **Ledger-autosquare is % of a reference balance**, seeded from cash and kept as the high-water mark; guard with
  `ledgerAutosquareActive` + a short grace after opening a position; a separate 2s poll is the safety net.
- **Admin funding debits the admin's own wallet** (except SuperAdmin/unlimited); always write paired ledgers.
- **Hierarchical wallet permission:** direct parent = full, indirect ancestor = view-only, cross-broker = deposit-only.
- **Legacy migration:** old `wallet.tradingBalance`/`wallet.usedMargin` migrate into `nseBseWallet` on read — handle to
  avoid double-counting.
- **All money math rounds to 2 dp; balances never go negative** (User `pre('save')` clamps each wallet to ≥ 0).

---

*Generated from the StockEx codebase as a reusable wallet spec. Backend: `server/models/User.js`,
`server/services/{walletService,walletTransferService,walletPermissionService,stopOutService,marginMonitorService,ledgerAutosquareService,segmentLedgerAutosquarePoll,autoSquareOffEngine}.js`,
`server/utils/{orderAvailableMargin,recalculateUsedMargin,nseBseWallet,segmentWalletDebit,subwalletCashWallet,walletBlock,buildUserWalletResponse}.js`,
`server/routes/{userFundRoutes,adminManagementRoutes}.js`. Frontend: `client/src/pages/UserAccounts.jsx`,
`client/src/pages/UserDashboard.jsx` (mode routing), `client/src/lib/{walletProfitBlock,walletTransferLimits}.js`,
`client/src/utils/{resolveMainWalletBalance,walletDisplaySanity,stockexCoins}.js`.*
