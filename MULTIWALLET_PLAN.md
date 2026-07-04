# Multi-Wallet (per-segment trading wallets) — Implementation Plan

> Goal (from `wallet.md`): Main wallet = **sirf cash / funding** (trade nahi hota). Trading **per-segment wallet** se
> ho — NSE/BSE, MCX, Crypto, Forex (Games already alag). Har wallet ka **apna balance, margin, stop-out, aur apni
> segment + risk settings** ho. **Purana logic (segment settings, risk management, trading) na tootey** — sab kuchh
> ADDITIVE + FEATURE-FLAGGED, phased rollout se.

---

## 0. Aaj kaise hai (current coupling — verified)

- **1 `Wallet` per user** (`wallet.py`, `user_id` unique): `available_balance`, `used_margin`, `credit_limit`,
  `settlement_outstanding`, `version`. Saara paisa yahin.
- **Trading isi ek wallet pe:**
  - `order_validator.validate(user, segment_type, …)` → `wallet_service.get_or_create(user.id)` se
    `available = available_balance + credit_limit`. Segment settings **already per-segment**:
    `netting_service.get_effective_settings(user.id, segment_type)`. Risk `_fetch_risk()` **per-user**.
  - `matching_engine`/`order_service` → `wallet_service.block_margin(user.id)` / `release_margin` / `adjust`.
  - `risk_enforcer._enforce_for_user(user)` → **poore user** ki saari open positions ek saath, **ek** wallet ki
    balance pe floating-loss %, margin-call/stop-out. (Yaani stop-out per-ACCOUNT hai, per-segment nahi.)
- **Segment settings** cascade: `GLOBAL → SUPER_ADMIN → ADMIN → BROKER → USER` (per segment). **Risk** cascade:
  `RiskSettings` tiers (per user, global stop-out %).
- Games wallet already alag hai (`games_wallets` + `games/wallet_service.py`), house = super-admin.

**Gap vs wallet.md:** (1) ek hi wallet hai, per-segment nahi; (2) trading main wallet pe; (3) stop-out per-account,
per-wallet nahi; (4) risk per-user, per-wallet/segment nahi (leverage/autosquare% per segment chahiye).

---

## 1. Wallet buckets — 20 segments → 5 trading wallets (+ Main + Games)

Ek pure function `wallet_kind_for_segment(segment_type) -> WalletKind`:

| WalletKind | SegmentType (New folder) |
|------------|--------------------------|
| `MAIN` (cash) | — (koi trade nahi; sirf deposit/withdraw + funding) |
| `NSE_BSE` (default) | NSE_EQUITY, NSE_FUTURE, NSE_INDEX_FUTURE, NSE_*OPTION*_*, BSE_EQUITY, BSE_FUTURE, BSE_INDEX_FUTURE, BSE_OPTION_* |
| `MCX` | MCX_FUTURE, MCX_OPTION_BUY, MCX_OPTION_SELL |
| `CRYPTO` | CRYPTO_SPOT, CRYPTO_FUTURE |
| `FOREX` | CDS_FUTURE, CDS_OPTION_BUY, CDS_OPTION_SELL |
| `GAMES` | (already separate — untouched) |

> Golden rule (wallet.md): ek trade **sirf uske segment ke wallet** ko debit kare; Main kabhi nahi.

---

## 2. Data model (additive)

- **`Wallet` stays = MAIN cash wallet.** Role shift: deposits/withdrawals yahin; going-forward `used_margin` = 0.
  Kuchh delete nahi — isliye purana kuchh nahi tootta.
- **New `segment_wallets` collection** — 1 row per `(user_id, kind)` for NSE_BSE/MCX/CRYPTO/FOREX. Fields = `Wallet`
  ke mirror (`available_balance`, `used_margin`, `realized_pnl`, `unrealized_pnl`, `credit_limit`,
  `settlement_outstanding`, `version`) + per-wallet risk state (`ledger_reference_balance`, `ledger_autosquare_active`,
  `ledger_autosquared_at`, `profit_blocked`). Unique index `(user_id, kind)`.
- Games wallet = existing `games_wallets` (as-is).

**Migration (one-shot, idempotent, flag-gated):** har user ke liye 4 segment wallets banao; existing
`Wallet.available_balance` → **NSE_BSE** segment wallet me move (kyunki zyaadatar trading NSE/BSE); har bucket ka
`used_margin` open positions se recompute (reuse `recompute_used_margin` logic, per bucket). Main balance 0 (ab cash
funding source). Bina flag ke migration nahi chalega → purane users safe.

---

## 3. `segment_wallet_service.py` (new) + resolver — non-breaking core

- Naya `app/services/segment_wallet_service.py`: `get_or_create(user_id, kind)`, `block_margin`, `release_margin`,
  `adjust`, `force_debit`, `summary` — **bilkul `wallet_service` jaise** (same version-guarded atomic `$expr`
  patterns), bas `(user_id, kind)` pe.
- **Resolver** `wallet_router.resolve(user_id, segment_type)`:
  - Flag **OFF** → return existing `wallet_service` + main `Wallet` (aaj jaisa **byte-identical**).
  - Flag **ON** → return `segment_wallet_service` + resolved segment wallet.
- **Feature flag** `MULTI_WALLET_ENABLED` (config + PlatformSetting, default OFF). Isi se "purana logic na tootey"
  guarantee hoti hai — jab tak ON na karo, kuchh nahi badalta.

---

## 4. Trading path rerouting (flag-gated — sab jagah resolver)

Sirf 3 files me `wallet_service.<fn>(user.id)` ko `resolver.resolve(user.id, segment_type)` se replace (flag ON pe):

1. `order_validator.validate` — `available` resolved segment wallet se (+ us wallet ka `credit_limit`). Segment
   settings/risk ab us wallet ke liye resolve honge (§6).
2. `order_service`/`matching_engine` — margin block/release + close P&L credit/debit + brokerage → resolved segment
   wallet pe. Ledger row me `wallet_kind` tag.
3. Close/squareoff P&L → segment wallet; `profit_blocked` respect (profit rok, loss lagao).

Flag OFF → sab kuchh aaj jaisa (main wallet).

---

## 5. Risk engine per-wallet (flag-gated)

`risk_enforcer._enforce_for_user(user)`: flag ON pe user ki open positions ko **`wallet_kind` se group** karo; har
group ke liye **us segment wallet** ki balance pe floating-loss %, margin-call, **stop-out** aur **ledger-autosquare**
independently (NSE stop-out MCX ko na chhue). Reuse: existing per-segment netting settings + per-wallet risk (§6).
Flag OFF → aaj wala whole-account behaviour.

- Stop-out order (wallet.md): pending cancel → recalc → most-losing FIFO close → recalc after each → restore pe ruk
  jao → still negative to wallet block.
- Ledger-autosquare: loss % ≥ `autosquare_percent` (per wallet), `ledger_reference_balance` high-water se, re-entry
  guard + grace.

---

## 6. Per-wallet settings — "har wallet ka alag" (yeh sabse important)

- **Segment settings: pehle se per-segment hain** (`netting_service`, GLOBAL→…→USER). **Koi change nahi** — ab ye
  naturally us segment ke wallet pe apply honge. Admin pehle se har segment alag set karta hai.
- **Risk settings ko per-wallet banao:** aaj `RiskSettings` per-user hai. Isme `stop_out_level`,
  `autosquare_percent`, `notification_percent`, `leverage` ko **per-wallet-kind** dimension do — **wahi cascade**
  (`GLOBAL→SUPER_ADMIN→ADMIN→BROKER→USER`) me `kind` bhi key ban jaye. Resolver per-wallet risk return karega.
- **Admin UI (tere screenshot wali Risk Management page):** upar ek **wallet/segment selector** (NSE_BSE / MCX /
  Crypto / Forex) add — "Global default" + "Per-user override" ka poora block **us wallet ke liye** set hoga. Yaani
  jaise abhi ek hi (main) wallet ke liye stop-out/warning/exit-only set hota hai, ab **har wallet ke liye alag alag**
  same UI se. Cascade + save-flow same rahega, bas `kind` add hoga.
- **Ye backward-compatible:** flag OFF pe risk per-user (aaj jaisa); flag ON pe wallet chosen → per-wallet.

---

## 7. Fund flow (Games wallet jaisa hi pattern — already built reference)

- Deposit/withdraw → **Main** (existing, unchanged).
- **New:** Main↔segment transfer + mesh transfer (`source_wallet`, `target_wallet`, `amount`), **transferable =
  `balance − used_margin`**, atomic `$expr` guard, **paired ledger rows** (DEBIT source + CREDIT target, same
  `transfer_id`). `profit_blocked` wallets pe block. (Games ka `transfer_main_to_games` + admin-approve exact isi
  ka reference hai.)
- Admin add/deduct → specific wallet target kar sake.

---

## 8. Frontend

- **"My Accounts" page:** har wallet ka card (Main + NSE/BSE + MCX + Crypto + Forex + Games) — balance, used margin,
  P&L + buttons: **Trade(mode)** / Add / Withdraw / Transfer / Move-to-Main. Trade button trader-room ko us segment
  **mode** me kholega → orders us wallet pe bind. Main pe **Trade button nahi**.
- **Admin Risk Management + Segment Settings** pages me wallet/segment selector (§6).

---

## 9. Phasing (non-breaking — flag OFF tak sab same)

| Phase | Kaam | Flag |
|-------|------|------|
| P1 | `segment_wallets` model + `segment_wallet_service` + fund-transfer endpoints + migration script + admin per-wallet risk settings (UI selector). **Trading reroute nahi.** | OFF |
| P2 | Resolver `order_validator` + margin block/release + close P&L segment wallet pe (flag-gated). Ek test user pe verify. | ON (staging) |
| P3 | `risk_enforcer` per-wallet stop-out/autosquare. | ON (staging) |
| P4 | Frontend My-Accounts page + admin selectors. Per-tenant flag flip. | ON (prod) |

Har phase ke baad: `pytest` (margin/stop-out/transfer), boot check, aur flag OFF pe purana behaviour byte-identical
verify.

---

## 10. Invariants (wallet.md — na todo)

- **Main trade nahi karta** — sirf cash + funding. Trade exactly **ek** segment wallet debit kare.
- **Sirf free balance transfer** (`balance − used_margin`); locked margin move nahi. Atomic `$expr` guards.
- **Har wallet independent:** balance, margin, stop-out, ledger-autosquare, reference-balance, `profit_blocked`.
- **profit_blocked** profit rokta hai, loss nahi.
- **Feature flag OFF = aaj jaisa exact** — yeh hi purane logic ki suraksha hai.
- Migration double-count na kare → `used_margin` per bucket open positions se recompute.

---

## 11. Files (jab implement karein — reference)

- New: `app/models/segment_wallet.py`, `app/services/segment_wallet_service.py`, `app/services/wallet_router.py`,
  `app/services/segment_wallet_risk.py` (per-wallet stop-out helpers), `app/api/v1/user/wallet_transfer.py`,
  `app/scripts/migrate_to_segment_wallets.py`.
- Additive edits (flag-gated): `order_validator.py`, `order_service.py`, `matching_engine.py`, `risk_enforcer.py`,
  `netting_service.py`/risk models (per-wallet dimension), `core/config.py` (flag), `core/database.py` (register model),
  admin risk/segment settings routers + frontend Risk Management / Segment Settings / My-Accounts pages.
