"""Nifty + BTC Number — bet placement and daily result settlement.

Result = two digits of the closing price at `result_time`:
  • Nifty: the fractional (decimal) two digits — 23,123.65 → 65.
  • BTC:   the integer part's last two digits — 75,242.89 → 42.
Win when selected_number == result_number. Model B gross (full to user in v1).
"""

from __future__ import annotations

import logging
from datetime import timedelta
from decimal import Decimal

from beanie import PydanticObjectId

from app.core.exceptions import (
    GameDisabledError,
    GameLimitExceededError,
    GameWindowClosedError,
)
from app.core.redis_client import publish
from app.models.games.bets import GameBetStatus, GameResult, NumberBet
from app.models.games.settings import GameSettings
from app.services.games import price_resolver, wallet_service
from app.services.games.common import ist_datetime_for_day, parse_hms
from app.services.games.payout_math import compute_number_payout
from app.utils.decimal_utils import quantize_money, to_decimal, to_decimal128
from app.utils.time_utils import now_ist, now_utc

logger = logging.getLogger(__name__)
_RESULT_GRACE_SEC = 20


async def _distribute_win(user_id, profit, game_key: str, cfg) -> None:
    """4-level %-of-win-profit split (hierarchy HELD + referrer games wallet),
    funded from the house. profit = payout − stake (per winning bet)."""
    try:
        from app.models.user import User
        from app.services.games import hierarchy, referral

        user = await User.get(user_id)
        if user is None:
            return
        if to_decimal(profit) <= 0:
            return
        await hierarchy.distribute_profit_split(user, profit, game_key, cfg)
        await referral.credit_referral_on_win(user, profit, cfg, game_key=game_key)
    except Exception:  # noqa: BLE001
        logger.exception("number_distribute_win_failed user=%s game=%s", user_id, game_key)


async def place_bet(
    user_id: PydanticObjectId, *, game_key: str, selected_number: int, quantity: int
) -> NumberBet:
    settings = await GameSettings.load_singleton()
    if not settings.games_enabled or settings.maintenance_mode:
        raise GameDisabledError("Games are currently unavailable")
    cfg = settings.games.get(game_key)
    if cfg is None or not cfg.enabled:
        raise GameDisabledError()

    hi = 99 if cfg.all_decimals else 95
    if selected_number < 0 or selected_number > hi:
        raise GameLimitExceededError(f"Number must be between 0 and {hi}")
    if not cfg.all_decimals and selected_number % 5 != 0:
        raise GameLimitExceededError("Number must be a multiple of 5")
    if quantity < 1 or quantity > cfg.max_tickets_per_number:
        raise GameLimitExceededError(
            f"Max {cfg.max_tickets_per_number} tickets per number"
        )

    now = now_ist()
    start_t = parse_hms(cfg.bidding_start_time)
    end_t = parse_hms(cfg.bidding_end_time)
    if not (start_t <= now.time() <= end_t):
        raise GameWindowClosedError("Bidding is closed for this game")

    day = now.strftime("%Y-%m-%d")
    # Daily bet-count + per-number caps.
    todays = await NumberBet.find(
        NumberBet.user_id == user_id, NumberBet.game_key == game_key, NumberBet.bet_date == day
    ).to_list()
    if len(todays) >= cfg.bets_per_day:
        raise GameLimitExceededError(f"Daily limit of {cfg.bets_per_day} bets reached")
    same_number_qty = sum(b.quantity for b in todays if b.selected_number == selected_number)
    if same_number_qty + quantity > cfg.max_tickets_per_number:
        raise GameLimitExceededError(
            f"Max {cfg.max_tickets_per_number} tickets on number {selected_number}"
        )

    tp = to_decimal(cfg.ticket_price)
    amt = quantize_money(tp * to_decimal(quantity))

    await wallet_service.atomic_games_wallet_debit(
        user_id, amt, game_key=game_key,
        description=f"Bet · {game_key} · #{selected_number} × {quantity}",
        meta={"kind": "BET", "number": selected_number, "qty": quantity},
    )
    await wallet_service.house_settle(amt, game_key=game_key, narration=f"Games stake in · {game_key} number")

    bet = NumberBet(
        user_id=user_id, game_key=game_key, selected_number=selected_number,
        quantity=quantity, amount=to_decimal128(amt), ticket_price=to_decimal128(tp),
        bet_date=day, status=GameBetStatus.PENDING,
    )
    await bet.insert()
    try:
        await publish(f"user:{user_id}:games", {"type": "bet_placed", "payload": {"game": game_key}})
    except Exception:
        pass
    return bet


async def declare_and_settle(game_key: str) -> int:
    settings = await GameSettings.load_singleton()
    cfg = settings.games.get(game_key)
    if cfg is None or not cfg.enabled:
        return 0

    pending = await NumberBet.find(
        NumberBet.game_key == game_key, NumberBet.status == GameBetStatus.PENDING
    ).to_list()
    if not pending:
        return 0

    now = now_ist()
    result_t = parse_hms(cfg.result_time)
    by_day: dict[str, list[NumberBet]] = {}
    for b in pending:
        by_day.setdefault(b.bet_date, []).append(b)

    settled = 0
    for day, bets in by_day.items():
        result_dt = ist_datetime_for_day(day).replace(
            hour=result_t.hour, minute=result_t.minute, second=result_t.second
        )
        if now < result_dt + timedelta(seconds=_RESULT_GRACE_SEC):
            continue

        if game_key == "btcNumber":
            close = await price_resolver.resolve_btc_price_at(result_dt)
            result_number = price_resolver.btc_number_from_close(close) if close else None
        else:
            close = await price_resolver.resolve_nifty_price_at(result_dt)
            result_number = price_resolver.nifty_number_from_close(close) if close else None
        if close is None or result_number is None:
            continue  # retry next tick

        # Declared-guard row (unique on game_key/day/window=None).
        existing = await GameResult.find_one(
            GameResult.game_key == game_key, GameResult.day == day,
            GameResult.window_number == None,  # noqa: E711
        )
        if existing is None:
            try:
                await GameResult(
                    game_key=game_key, day=day, window_number=None,
                    close_price=to_decimal128(close), result=str(result_number),
                    result_number=result_number, price_source="result_time",
                ).insert()
            except Exception:
                pass

        for bet in bets:
            won = bet.selected_number == result_number
            if won:
                payout = compute_number_payout(
                    fixed_profit=cfg.fixed_profit, ticket_price=cfg.ticket_price,
                    win_multiplier=cfg.win_multiplier, quantity=bet.quantity,
                )
                await wallet_service.atomic_games_wallet_credit(
                    bet.user_id, payout, game_key=game_key,
                    description=f"Win · {game_key} · #{result_number}",
                    meta={"kind": "WIN", "number": result_number}, is_win=True,
                )
                await wallet_service.house_settle(-payout, game_key=game_key, narration=f"Games payout · {game_key} number")
                bet.status = GameBetStatus.WON
                bet.payout = to_decimal128(payout)
                # 4-level %-of-win-profit split. profit = payout − this bet's
                # total stake (bet.amount = ticket_price × quantity).
                profit = to_decimal(payout) - to_decimal(bet.amount)
                await _distribute_win(bet.user_id, profit, game_key, cfg)
            else:
                bet.status = GameBetStatus.LOST
                bet.payout = to_decimal128(Decimal("0"))
            bet.result_number = result_number
            bet.updated_at = now_utc()
            await bet.save()
            settled += 1
            try:
                await publish(
                    f"user:{bet.user_id}:games",
                    {"type": "bet_result", "payload": {
                        "game": game_key, "result": result_number, "won": won,
                        "payout": str(bet.payout)}},
                )
            except Exception:
                pass
    return settled
