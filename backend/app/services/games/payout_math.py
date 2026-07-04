"""Pure payout / result math for the games subsystem. No I/O — unit-testable.

v1 economics: SUPER_ADMIN is the sole house. Users receive the FULL gross
payout; there is NO hierarchy/brokerage deduction (deferred). The house edge
is structural (multiplier < break-even; jackpot prize% sums < 100).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.utils.decimal_utils import quantize_money, to_decimal


# ── Up/Down ──────────────────────────────────────────────────────────
def settle_updown_from_prices(open_price, close_price) -> str:
    """Return the window result: 'UP' (close>open), 'DOWN' (close<open),
    or 'TIE' (equal). TIE counts as a loss for every bet."""
    o = to_decimal(open_price)
    c = to_decimal(close_price)
    if c > o:
        return "UP"
    if c < o:
        return "DOWN"
    return "TIE"


def updown_bet_won(prediction: str, result: str) -> bool:
    return result != "TIE" and prediction.upper() == result


def compute_updown_win_payout(amount, win_multiplier: float) -> Decimal:
    """Model A — user receives the full gross = stake × multiplier."""
    return quantize_money(to_decimal(amount) * to_decimal(win_multiplier))


# ── Number ───────────────────────────────────────────────────────────
def compute_number_payout(
    *, fixed_profit: float, ticket_price, win_multiplier: float, quantity: int
) -> Decimal:
    """Gross credited to a winning number bet (full to user in v1).
    fixed_profit × qty when fixed_profit > 0, else ticket_price × mult × qty."""
    q = to_decimal(quantity)
    fp = to_decimal(fixed_profit)
    if fp > 0:
        return quantize_money(fp * q)
    return quantize_money(to_decimal(ticket_price) * to_decimal(win_multiplier) * q)


# ── Jackpot ranking + prize (tie split) ──────────────────────────────
def jackpot_rank_and_prize(
    bids: list[dict[str, Any]],
    *,
    locked_price,
    prize_percentages: dict[str, float],
    top_winners: int,
    pool,
) -> dict[str, dict[str, Any]]:
    """Rank bids by |predicted − locked| ascending (tie-break earliest
    created_at) and assign prizes.

    Tie handling (equal distance): the tied bids occupy a contiguous block of
    ranks; the prize percentages for those ranks are summed and split equally
    among them. Only the top `top_winners` ranks earn a prize.

    `bids` items: {"id": str, "predicted": number, "created_at": datetime}.
    Returns {id: {"rank": int, "prize": Decimal}} for ALL ranked bids (prize 0
    for out-of-money ranks).
    """
    lp = to_decimal(locked_price)
    pool_dec = to_decimal(pool)

    ordered = sorted(
        bids,
        key=lambda b: (abs(to_decimal(b["predicted"]) - lp), b["created_at"]),
    )

    out: dict[str, dict[str, Any]] = {}
    i = 0
    n = len(ordered)
    while i < n:
        # Group of equal distance.
        dist = abs(to_decimal(ordered[i]["predicted"]) - lp)
        j = i
        while j < n and abs(to_decimal(ordered[j]["predicted"]) - lp) == dist:
            j += 1
        group = ordered[i:j]
        first_rank = i + 1  # 1-based
        # Sum the prize percentages for the ranks this group occupies.
        pct_sum = Decimal("0")
        for r in range(first_rank, first_rank + len(group)):
            if r <= top_winners:
                pct_sum += to_decimal(prize_percentages.get(str(r), 0))
        share_pct = (pct_sum / to_decimal(len(group))) if group else Decimal("0")
        share_prize = quantize_money(pool_dec * share_pct / to_decimal(100))
        for k, b in enumerate(group):
            rank = first_rank + k
            prize = share_prize if first_rank <= top_winners else quantize_money(Decimal("0"))
            out[b["id"]] = {"rank": rank, "prize": prize}
        i = j
    return out
