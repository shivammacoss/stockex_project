"""Nifty Bracket — BUY/SELL band trade placement + expiry resolution.

Server builds a band around live spot at placement:
  upper = centre + gap, lower = centre − gap   (centre = live spot if anchored)
Resolution rule (`bracket_session_close_rule`):
  • directionVsEntry: BUY wins if LTP > entry; SELL wins if LTP < entry.
  • breakPastBands:   BUY wins if LTP > upper; SELL wins if LTP < lower.
Model A payout (win_multiplier, default 1.9×). Loss = full stake.
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
from app.models.games.bets import BracketPrediction, BracketTrade, GameBetStatus
from app.models.games.settings import GameSettings
from app.services.games import price_resolver, wallet_service
from app.services.games.common import parse_hms
from app.utils.decimal_utils import quantize_money, to_decimal, to_decimal128
from app.utils.time_utils import now_ist, now_utc

logger = logging.getLogger(__name__)
GAME_KEY = "niftyBracket"
_MAX_PER_TICK = 200


async def place_bet(
    user_id: PydanticObjectId, *, prediction: str, amount, entry_price
) -> BracketTrade:
    settings = await GameSettings.load_singleton()
    if not settings.games_enabled or settings.maintenance_mode:
        raise GameDisabledError("Games are currently unavailable")
    cfg = settings.games.get(GAME_KEY)
    if cfg is None or not cfg.enabled:
        raise GameDisabledError()

    now = now_ist()
    start_t = parse_hms(cfg.bidding_start_time)
    end_t = parse_hms(cfg.bidding_end_time)
    if not (start_t <= now.time() <= end_t):
        raise GameWindowClosedError("Bidding is closed")

    amt = quantize_money(to_decimal(amount))
    tp = to_decimal(cfg.ticket_price)
    if tp <= 0:
        raise GameLimitExceededError("Invalid ticket price")
    tickets = int((amt / tp).to_integral_value())
    if tickets < cfg.min_tickets or tickets > cfg.max_tickets:
        raise GameLimitExceededError(
            f"Tickets must be between {cfg.min_tickets} and {cfg.max_tickets}"
        )

    pred = BracketPrediction(prediction.upper())

    # Band around the live spot.
    spot = await price_resolver.nifty_ltp()
    centre = spot if (spot and cfg.bracket_anchor_to_spot) else to_decimal(entry_price)
    if centre is None or centre <= 0:
        raise GameWindowClosedError("Live price unavailable")
    if cfg.bracket_gap_type == "percentage":
        gap = centre * to_decimal(cfg.bracket_gap_percent) / to_decimal(100)
    else:
        gap = to_decimal(cfg.bracket_gap)
    upper = quantize_money(centre + gap)
    lower = quantize_money(centre - gap)
    expires_at = now_utc() + timedelta(minutes=cfg.expiry_minutes)

    await wallet_service.atomic_games_wallet_debit(
        user_id, amt, game_key=GAME_KEY,
        description=f"Bracket · {pred.value} · ₹{amt}",
        meta={"kind": "BET", "prediction": pred.value},
    )
    await wallet_service.house_settle(amt, game_key=GAME_KEY, narration="Games stake in · bracket")

    trade = BracketTrade(
        user_id=user_id, game_key=GAME_KEY, prediction=pred,
        amount=to_decimal128(amt), entry_price=to_decimal128(to_decimal(entry_price)),
        spot_at_order=to_decimal128(centre), upper_target=to_decimal128(upper),
        lower_target=to_decimal128(lower), expires_at=expires_at,
        bet_date=now.strftime("%Y-%m-%d"), status=GameBetStatus.PENDING,
    )
    await trade.insert()
    try:
        await publish(f"user:{user_id}:games", {"type": "bet_placed", "payload": {"game": GAME_KEY}})
    except Exception:
        pass
    return trade


def _won(trade: BracketTrade, ltp, rule: str) -> bool:
    ltp = to_decimal(ltp)
    entry = to_decimal(trade.entry_price)
    if rule == "breakPastBands":
        if trade.prediction == BracketPrediction.BUY:
            return ltp > to_decimal(trade.upper_target)
        return ltp < to_decimal(trade.lower_target)
    # directionVsEntry (default)
    if trade.prediction == BracketPrediction.BUY:
        return ltp > entry
    return ltp < entry


async def declare_and_settle() -> int:
    settings = await GameSettings.load_singleton()
    cfg = settings.games.get(GAME_KEY)
    if cfg is None or not cfg.enabled:
        return 0

    due = await BracketTrade.find(
        BracketTrade.status == GameBetStatus.PENDING,
        BracketTrade.expires_at <= now_utc(),
    ).limit(_MAX_PER_TICK).to_list()
    if not due:
        return 0

    ltp = await price_resolver.nifty_ltp()
    if ltp is None or ltp <= 0:
        return 0

    settled = 0
    for trade in due:
        # Atomic status claim so a re-entrant tick can't double-settle.
        claimed = await BracketTrade.get_motor_collection().find_one_and_update(
            {"_id": trade.id, "status": GameBetStatus.PENDING.value},
            {"$set": {"status": "SETTLING", "updated_at": now_utc()}},
        )
        if claimed is None:
            continue
        won = _won(trade, ltp, cfg.bracket_session_close_rule)
        if won:
            payout = quantize_money(to_decimal(trade.amount) * to_decimal(cfg.win_multiplier))
            await wallet_service.atomic_games_wallet_credit(
                trade.user_id, payout, game_key=GAME_KEY,
                description=f"Bracket win · {trade.prediction.value}",
                meta={"kind": "WIN"}, is_win=True,
            )
            await wallet_service.house_settle(-payout, game_key=GAME_KEY, narration="Games payout · bracket")
            trade.status = GameBetStatus.WON
            trade.payout = to_decimal128(payout)
            # 4-level %-of-WINNING split (hierarchy HELD + referrer games
            # wallet), funded from the house. Base = gross winning (full payout).
            try:
                from app.models.user import User
                from app.services.games import hierarchy, referral

                u = await User.get(trade.user_id)
                if u is not None:
                    win_amount = to_decimal(payout)
                    if win_amount > 0:
                        await hierarchy.distribute_profit_split(u, win_amount, GAME_KEY, cfg)
                        await referral.credit_referral_on_win(u, win_amount, cfg, game_key=GAME_KEY)
            except Exception:  # noqa: BLE001
                logger.exception("bracket_distribute_win_failed trade=%s", trade.id)
        else:
            trade.status = GameBetStatus.LOST
            trade.payout = to_decimal128(Decimal("0"))
        trade.result_price = to_decimal128(ltp)
        trade.updated_at = now_utc()
        await trade.save()
        settled += 1
        try:
            await publish(
                f"user:{trade.user_id}:games",
                {"type": "bet_result", "payload": {
                    "game": GAME_KEY, "won": won, "payout": str(trade.payout)}},
            )
        except Exception:
            pass
    return settled
