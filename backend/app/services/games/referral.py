"""Referral-per-win reward (mirrors D:\\Stockex referralPerWin).

On the referred user's FIRST win in a given game, the referrer earns
`referral_win_percent%` of ONE ticket price, funded from the house and
credited to the referrer's games wallet. Gated once per (user, game) via
`User.game_referral.first_win_by_game`.
"""

from __future__ import annotations

import logging

from app.models.games.settings import GameConfig
from app.models.user import User
from app.services.games import wallet_service
from app.utils.decimal_utils import ZERO, quantize_money, to_decimal

logger = logging.getLogger(__name__)


async def credit_referral_on_win(user: User, profit, cfg: GameConfig, *, game_key: str) -> None:
    """4-level %-of-win-profit model (ACTIVE) — referrer leg.

    The CLIENT who referred the player (`player.referred_by`) earns
    `referrer_profit_pct%` of the win `profit`, funded from the house and
    credited to the referrer's GAMES wallet — on EVERY win. NO first-win gate,
    NO top-ranks gate, NO earnings-threshold gate (those belonged to the OLD
    model). Best-effort: wrapped so it can never break settlement."""
    try:
        from app.services import referral_service

        referred_by = getattr(user, "referred_by", None)
        if not referred_by:
            return
        pct = float(cfg.referrer_profit_pct or 0)
        if pct <= 0:
            return
        reward = quantize_money(to_decimal(profit) * to_decimal(pct) / to_decimal(100))
        if reward <= ZERO:
            return

        # Funded from the house → referrer's games wallet.
        await wallet_service.house_settle(
            -reward, game_key=game_key,
            narration=f"Referral reward (referrer of {user.user_code})",
        )
        await wallet_service.atomic_games_wallet_credit(
            referred_by, reward, game_key=game_key,
            description=f"Referral reward — {user.user_code}'s {game_key} win",
            meta={"kind": "REFERRAL", "referred_user": str(user.id)},
        )

        # Rollup on the Referral doc + referrer stats (Refer&Earn page).
        await referral_service.record_referral_earning(
            referred_by, user.id, reward, game=game_key
        )
    except Exception:  # noqa: BLE001 — referral must never break settlement
        logger.exception(
            "games_referral_on_win_failed user=%s game=%s",
            getattr(user, "id", None), game_key,
        )


async def credit_referral_on_first_win(
    user: User, game_key: str, cfg: GameConfig, *, is_top_rank: bool = True,
    referral_base: float | int | str | None = None,
) -> None:
    """Credit the referrer once for `user`'s first win in `game_key`.

    `referral_base` (the % base) differs per game (refles.md B.2):
      • Up/Down, Number → one ticket price (default when base not passed)
      • Jackpot         → the pool/bank (caller passes it)
      • Bracket         → the user's session stake (caller passes it)
    """
    try:
        from app.services import referral_service

        win_pct = float(cfg.referral_win_percent or 0)
        if win_pct <= 0:
            return
        referred_by = getattr(user, "referred_by", None)
        if not referred_by:
            return
        # Jackpot games may gate the reward to top ranks only.
        if cfg.referral_top_ranks_only and not is_top_rank:
            return

        # First-win-per-game gate.
        stats = getattr(user, "game_referral", None)
        if bool(stats and stats.first_win_by_game.get(game_key)):
            return

        base = to_decimal(referral_base) if referral_base is not None else to_decimal(cfg.ticket_price)
        reward = quantize_money(base * to_decimal(win_pct) / to_decimal(100))
        if reward <= ZERO:
            return

        # Shared eligibility gate (segment enabled + 1-month window + house
        # earnings threshold). Held → skip WITHOUT consuming the first-win gate
        # so it can pay on a later eligible win.
        if not await referral_service.process_conditional_referral_payout(user, reward, "games"):
            return

        # Funded from the house → referrer's games wallet.
        await wallet_service.house_settle(
            -reward, game_key=game_key, narration=f"Referral reward (referrer of {user.user_code})"
        )
        await wallet_service.atomic_games_wallet_credit(
            referred_by, reward, game_key=game_key,
            description=f"Referral reward — {user.user_code}'s first {game_key} win",
            meta={"kind": "REFERRAL", "referred_user": str(user.id)},
        )

        # Mark the first-win gate (at most once per game per referred user).
        from app.models.user import GameReferralStats

        if stats is None:
            user.game_referral = GameReferralStats(first_win_by_game={game_key: True})
        else:
            stats.first_win_by_game[game_key] = True
            user.game_referral = stats
        await user.save()

        # Rollup on the Referral doc + referrer stats.
        await referral_service.record_referral_earning(
            referred_by, user.id, reward, game=game_key
        )
    except Exception:  # noqa: BLE001 — referral must never break settlement
        logger.exception("games_referral_failed user=%s game=%s", getattr(user, "id", None), game_key)
