"""Unit tests for the pure games payout/result math (no I/O)."""

from decimal import Decimal

from app.services.games import payout_math as pm
from app.services.games import price_resolver as pr


def test_updown_result_direction():
    assert pm.settle_updown_from_prices(100, 101) == "UP"
    assert pm.settle_updown_from_prices(101, 100) == "DOWN"
    assert pm.settle_updown_from_prices(100, 100) == "TIE"


def test_updown_bet_won_tie_is_loss():
    assert pm.updown_bet_won("UP", "UP") is True
    assert pm.updown_bet_won("DOWN", "UP") is False
    # TIE always loses
    assert pm.updown_bet_won("UP", "TIE") is False
    assert pm.updown_bet_won("DOWN", "TIE") is False


def test_updown_payout_full_gross():
    assert pm.compute_updown_win_payout(Decimal("300"), 1.95) == Decimal("585.00")


def test_number_payout_fixed_vs_multiplier():
    # fixed_profit takes precedence when > 0
    assert pm.compute_number_payout(
        fixed_profit=4000, ticket_price=300, win_multiplier=9, quantity=2
    ) == Decimal("8000.00")
    # falls back to ticket_price × mult × qty when fixed_profit == 0
    assert pm.compute_number_payout(
        fixed_profit=0, ticket_price=300, win_multiplier=9, quantity=2
    ) == Decimal("5400.00")


def test_number_extractors():
    assert pr.nifty_number_from_close(Decimal("23123.65")) == 65
    assert pr.btc_number_from_close(Decimal("75242.89")) == 42
    assert pr.nifty_number_from_close(Decimal("100.00")) == 0


def test_jackpot_rank_and_tie_split():
    # a & b are equidistant (dist 1) → tie group occupies ranks 1-2, their
    # percentages (45 + 10 = 55) split equally → 27.5% each of a 1000 pool.
    res = pm.jackpot_rank_and_prize(
        [
            {"id": "a", "predicted": 100, "created_at": 1},
            {"id": "b", "predicted": 102, "created_at": 2},
            {"id": "c", "predicted": 90, "created_at": 3},
        ],
        locked_price=101,
        prize_percentages={"1": 45.0, "2": 10.0},
        top_winners=20,
        pool=Decimal("1000"),
    )
    assert res["a"]["prize"] == Decimal("275.00")
    assert res["b"]["prize"] == Decimal("275.00")
    assert res["c"]["prize"] == Decimal("0.00")
    # c is farther (dist 11) → rank 3, no prize.
    assert res["c"]["rank"] == 3
