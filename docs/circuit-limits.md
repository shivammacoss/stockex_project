# Upper / Lower Circuit — implementation spec

Portable write-up of the price-band (circuit) logic, meant to be lifted into
another white-label. Written against the StockEx implementation
(`backend/app/services/order_validator.py` + `frontend-user/components/trading/OrderPanel.tsx`),
but the rules below are exchange behaviour, not StockEx behaviour — port the
rules, rewrite the code to fit your stack.

---

## 1. What a circuit actually is

Every stock/derivative on an Indian exchange has a **daily price band**: a
floor (lower circuit) and a ceiling (upper circuit), computed by the exchange
from the previous day's close. The band is typically ±2 / 5 / 10 / 20 %
depending on the scrip's surveillance category. Index F&O has no fixed band
in the same sense but the broker still publishes one; illiquid stocks get a
tight one.

Price physically cannot trade outside the band. When it reaches an edge, the
scrip is said to be **circuit-locked**, and this is the part most
implementations get wrong:

| State | Order book reality | What a trader can actually do |
|---|---|---|
| **At upper circuit** | Everyone wants to buy, nobody will sell. Huge pending BUY queue, zero sell-side depth. | **Only SELL executes.** A BUY can be placed but sits unfilled. |
| **At lower circuit** | Everyone wants to sell, nobody will buy. Huge pending SELL queue, zero buy-side depth. | **Only BUY executes.** A SELL can be placed but sits unfilled. |

So the lock is **directional**, not a full halt. A naive implementation that
blocks *all* trading on a circuit-locked scrip is wrong in the direction that
matters most — it traps people in positions.

> **The single most common bug.** Blocking the locked side *unconditionally*
> also blocks the exit. At the upper circuit a trader holding a SHORT needs to
> BUY to cover — that's the locked side. Block it and the short can never be
> closed. See §5.

---

## 2. Where the band comes from

Don't compute the band yourself from previous close × percentage — the
surveillance category isn't in your instrument master, and you'll be wrong on
exactly the scrips that matter. Take it from the broker feed.

Zerodha's `quote()` returns `lower_circuit_limit` and `upper_circuit_limit`
per instrument. Equivalent fields exist on other feeds (Angel One:
`lowerCircuit`/`upperCircuit`).

Three properties the fetch must have:

1. **Cached per instrument, per day.** The band only changes at the start of a
   session. Hitting the broker quote API on every order placement is both slow
   and rate-limit suicide. StockEx caches in Redis under `circuit:{token}`
   with a 12 h TTL.
2. **Scoped to exchanges that have bands.** Crypto, forex and metals fed from
   an international provider have no circuit at all. Return "no band" early
   for those — don't let a null read from an unrelated feed produce a bogus
   limit.
3. **Fail-open.** If the quote call throws, the cache is cold, or the feed
   session is dead, return *no band*. A missing circuit must **never** block
   trading. The alternative — fail-closed — means one broker-API hiccup halts
   your entire platform.

```python
_CIRCUIT_EXCHANGES = ("NSE", "BSE", "NFO", "BFO", "MCX", "CDS")

async def _circuit_limits(instrument) -> tuple[Decimal | None, Decimal | None]:
    """(lower, upper) daily band, cached per-day in Redis. Fail-open →
    (None, None) so a missing band NEVER blocks trading."""
    ex = str(getattr(instrument.exchange, "value", instrument.exchange) or "").upper()
    if ex not in _CIRCUIT_EXCHANGES:
        return (None, None)

    token = str(instrument.token)
    ck = f"circuit:{token}"
    try:
        cached = await cache_get(ck)
        if isinstance(cached, dict):
            lc = to_decimal(cached.get("lc") or 0)
            uc = to_decimal(cached.get("uc") or 0)
            return (lc if lc > 0 else None, uc if uc > 0 else None)
    except Exception:
        pass

    try:
        key = f"{ex}:{instrument.symbol}"
        q = await zerodha.get_quote([key])
        row = (q or {}).get(key, {}) if isinstance(q, dict) else {}
        lc = to_decimal(row.get("lower_circuit_limit") or 0)
        uc = to_decimal(row.get("upper_circuit_limit") or 0)
        try:
            await cache_set(ck, {"lc": str(lc), "uc": str(uc)}, ttl_sec=43200)
        except Exception:
            pass
        return (lc if lc > 0 else None, uc if uc > 0 else None)
    except Exception:
        return (None, None)
```

Note `0` is normalised to `None` throughout. Feeds return `0` for "unknown",
and `price >= 0` is true for every price — treating 0 as a real ceiling would
lock every instrument at the upper circuit.

---

## 3. The three rules

Given `lc` / `uc` (either may be `None`), the live market price `cur`, and the
order's reference price `ref_price` (the limit price for a LIMIT/SL order; the
side-appropriate bid/ask for a MARKET order):

**Rule 1 — directional lock.**
- `cur >= uc` and action is BUY → reject.
- `cur <= lc` and action is SELL → reject.

**Rule 2 — price outside the band.**
- `ref_price > uc` → reject.
- `ref_price < lc` → reject.

This catches a LIMIT order parked outside the band. The exchange would reject
it at entry; so should you, rather than letting it sit in your pending-order
poller forever waiting for a trigger that can't legally print.

**Rule 3 — exits are exempt from Rules 1 and 2.** See §5.

Every comparison must be guarded on `cur > 0` / `ref_price > 0` and on the
limit not being `None`. Outside market hours the LTP is frequently `0`, and
`0 <= lc` is true — an unguarded lower-circuit check blocks every order the
moment the feed goes quiet.

---

## 4. Backend enforcement

One gate, in the order validator, before margin is computed. This is the
authoritative check — the UI copy of it (§6) is a convenience, never the
enforcement.

```python
# ── Circuit gate — like the real exchange ──────────────────────────
# Only on NEW opening orders (closing/square-off must always be allowed
# so you can exit); fail-open when no band data.
if not is_reducing and not is_squareoff:
    lc, uc = await _circuit_limits(instrument)
    cur = ltp if (ltp and ltp > 0) else ref_price     # live market price

    if uc is not None and cur > 0 and cur >= uc and action == OrderAction.BUY:
        raise OrderRejectedError(
            f"{instrument.symbol} is at the UPPER CIRCUIT (₹{uc}). "
            f"Only SELL is allowed — you can't BUY at the upper circuit.",
            code="UPPER_CIRCUIT_BUY",
        )
    if lc is not None and cur > 0 and cur <= lc and action == OrderAction.SELL:
        raise OrderRejectedError(
            f"{instrument.symbol} is at the LOWER CIRCUIT (₹{lc}). "
            f"Only BUY is allowed — you can't SELL at the lower circuit.",
            code="LOWER_CIRCUIT_SELL",
        )

    if ref_price > 0:
        if uc is not None and ref_price > uc:
            raise OrderRejectedError(
                f"Price ₹{ref_price} is above the upper circuit ₹{uc}.",
                code="UPPER_CIRCUIT",
            )
        if lc is not None and ref_price < lc:
            raise OrderRejectedError(
                f"Price ₹{ref_price} is below the lower circuit ₹{lc}.",
                code="LOWER_CIRCUIT",
            )
```

Distinct error codes matter: the UI renders `UPPER_CIRCUIT_BUY` as a
directional hint ("only SELL allowed") and `UPPER_CIRCUIT` as a price
complaint ("your limit is above the ceiling"). Same band, different fix for
the user.

---

## 5. The exit exemption — the part to get right

**A trader must always be able to close a position.** The band exists to stop
you *opening* into a locked side; it must not become a trap.

Determine whether the order reduces exposure, and skip the whole gate if so:

```python
signed_held   = position.quantity / lot_size if position else 0.0   # + long, − short
delta         = +lots if action == BUY else -lots
projected_net = signed_held + delta
is_reducing   = abs(projected_net) < abs(signed_held)
```

`is_squareoff` is the separate flag for admin/risk-engine auto-flatten
(margin call, stop-out). That must bypass *every* gate, circuit included.

Resulting matrix:

| Holding | At | Close needs | Verdict |
|---|---|---|---|
| LONG | upper circuit | SELL | allowed (unlocked side anyway) |
| LONG | **lower circuit** | **SELL** | **allowed — via the exemption only** |
| SHORT | **upper circuit** | **BUY** | **allowed — via the exemption only** |
| SHORT | lower circuit | BUY | allowed (unlocked side anyway) |
| flat | either | — | opening into the locked side rejected |

The two bold rows are the ones a naive implementation breaks, and they're
silent — nobody reports them until a trader is stuck.

**Position lookup keys must match your matching engine's.** StockEx resolves
the open position by `(user_id, instrument_token, product_type, status=OPEN)`.
If the validator looks the position up by a different key than the engine
merges fills into, `signed_held` reads `0`, `is_reducing` is `False`, and the
exemption silently never fires. This has bitten this codebase before on
`segment_type` vs `product_type`.

### B-book note

On a B-book platform every order fills internally at LTP — there is no real
counterparty to be absent. So honouring the exit is both correct *and*
executable. On a genuine order-routing broker the exit order would be accepted
and simply queue unfilled; either way, **accept it**. Never reject it.

---

## 6. Frontend

The client-side copy exists so the user sees the lock *before* tapping, not as
a rejection toast afterwards. It must mirror the backend exactly — including
the exit exemption, or you rebuild the trap in the UI.

Expose the band on whatever per-instrument settings call the order ticket
already makes (StockEx: `GET /user/segment-settings/effective`), so this costs
no extra round-trip:

```python
"upper_circuit": float(uc) if uc else None,
"lower_circuit": float(lc) if lc else None,
```

```tsx
const upperCircuit = Number(effSettings?.upper_circuit ?? 0) || 0;
const lowerCircuit = Number(effSettings?.lower_circuit ?? 0) || 0;
const curPx = Number(ltp || 0);
const atUpperCircuit = upperCircuit > 0 && curPx > 0 && curPx >= upperCircuit;
const atLowerCircuit = lowerCircuit > 0 && curPx > 0 && curPx <= lowerCircuit;

// Mirror the backend's is_reducing: an order opposing the held quantity
// is an exit and is never circuit-blocked.
const wouldReduce = useMemo(() => {
  const existing = openPositions.find(
    (p) => p.instrument_token === instrument?.token && p.product_type === productType,
  );
  const heldQty = Number(existing?.quantity ?? 0);
  if (!heldQty) return false;
  return side === "BUY" ? heldQty < 0 : heldQty > 0;
}, [openPositions, instrument?.token, productType, side]);

const circuitBlocksSide =
  !wouldReduce &&
  ((side === "BUY" && atUpperCircuit) || (side === "SELL" && atLowerCircuit));
```

Then: disable the submit button on `circuitBlocksSide`, guard `submit()` with
the same condition, and show a banner naming the band and the allowed
direction. When `wouldReduce` is true, say so explicitly — "Closing your open
position is still allowed" — otherwise a user staring at a red banner won't
try.

If the order ticket reads positions from a cache another component already
polls, subscribe read-only (`staleTime: Infinity`, `refetchOnMount: false`) so
this check doesn't introduce its own refetch and disturb optimistic-update
handling.

---

## 7. Fail-open matrix

Every one of these must resolve to **trading allowed**:

| Condition | Result |
|---|---|
| Broker feed disconnected / quote throws | no band → no block |
| Redis down | no band → no block |
| Instrument on a non-band exchange (crypto, forex, metals) | no band → no block |
| Feed returns `0` for either limit | that limit → `None` |
| LTP `0` (market closed, stale feed) | `cur > 0` guard fails → no block |
| Order is reducing / square-off | exempt → no block |

The only states that block are: a real band, a real live price at or beyond
it, and a *new* order into the locked side.

---

## 8. Test cases

Minimum set before shipping. The exit cases are the ones that regress.

1. Flat, price at upper circuit, BUY → rejected `UPPER_CIRCUIT_BUY`.
2. Flat, price at upper circuit, SELL → accepted.
3. Flat, price at lower circuit, SELL → rejected `LOWER_CIRCUIT_SELL`.
4. Flat, price at lower circuit, BUY → accepted.
5. **Holding SHORT, price at upper circuit, BUY to cover → accepted.**
6. **Holding LONG, price at lower circuit, SELL to exit → accepted.**
7. Partial close of the above → accepted (`is_reducing` is true for partials).
8. Holding LONG at upper circuit, BUY *more* → rejected (adds, doesn't reduce).
9. LIMIT priced above `uc` → rejected `UPPER_CIRCUIT`.
10. Risk-engine stop-out at either circuit → executes (`is_squareoff`).
11. Band unavailable (kill the feed) → all orders pass.
12. Crypto/forex instrument → gate never engages.

Run 5, 6 and 8 through the **UI**, not just the API — the client-side mirror
is where the exemption gets forgotten.

---

## 9. Porting checklist

- [ ] Feed adapter returning `(lower, upper)` per instrument, `None` when unknown
- [ ] Per-day cache, keyed by instrument token
- [ ] Exchange allow-list (skip international/24×7 markets)
- [ ] Fail-open on every error path
- [ ] `is_reducing` + `is_squareoff` computed *before* the gate
- [ ] Position lookup keys identical to the matching engine's
- [ ] Gate placed before margin computation in the validator
- [ ] Four distinct error codes
- [ ] Band exposed on the order-ticket settings response
- [ ] UI mirror including the exit exemption
- [ ] Banner text names the band, the allowed side, and the exit exemption
- [ ] Test cases 5, 6, 8 verified through the UI
