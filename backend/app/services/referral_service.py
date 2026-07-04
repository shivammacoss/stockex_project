"""Referral service — user-to-user growth incentive.

Three responsibilities (built across plan phases):
  • Phase 1: signup resolution (referral_code → referrer user) + Referral doc.
  • Phase 2: shared eligibility gate (segment toggle + 1-month window + house
    hierarchy-earnings threshold).
  • Phase 3/4: pay the referrer on the referred user's game win / trade.

Distinct from `app/services/games/hierarchy.py` (admin franchise commission).
All functions are defensive: a referral failure must NEVER break signup, a
game settlement, or a trade close — callers wrap in try/except and log.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from decimal import Decimal

from beanie import PydanticObjectId
from bson import Decimal128

from app.models.games.hierarchy_earnings import SuperAdminHierarchyEarnings
from app.models.referral import Referral, ReferralStatus
from app.models.user import User, UserRole, ReferralStats
from app.utils.decimal_utils import quantize_money, to_decimal
from app.utils.time_utils import now_utc

logger = logging.getLogger(__name__)

# Referral is only paid within this window after the referred user signed up.
_REFERRAL_WINDOW_DAYS = 30
# Default trading-referral rate (% of the referred user's trade brokerage).
DEFAULT_TRADING_REFERRAL_PERCENT = 10.0


# ── Phase 1: signup resolution ─────────────────────────────────────────
async def resolve_referrer(referral_code: str | None) -> User | None:
    """Return the CLIENT user whose `user_code` matches `referral_code`, else
    None. Only ordinary users (not admins/brokers) act as referrers — an admin
    code stays with the existing white-label attribution path."""
    if not referral_code:
        return None
    code = referral_code.strip()
    if not code:
        return None
    ref = await User.find_one(User.user_code == code)
    if ref is None or ref.role != UserRole.CLIENT:
        return None
    return ref


async def create_referral_on_signup(referrer: User, new_user: User) -> None:
    """Create the ACTIVE Referral doc linking referrer → new_user and bump the
    referrer's rollup counters. Idempotent on `referred_user` (unique index)."""
    from app.utils.time_utils import now_utc

    existing = await Referral.find_one(Referral.referred_user == new_user.id)
    if existing is not None:
        return
    try:
        await Referral(
            referrer=referrer.id,  # type: ignore[arg-type]
            referred_user=new_user.id,  # type: ignore[arg-type]
            referral_code=referrer.user_code,
            status=ReferralStatus.ACTIVE,
            activated_at=now_utc(),
        ).insert()
    except Exception:
        logger.exception("referral_signup_doc_failed referrer=%s new=%s", referrer.id, new_user.id)
        return
    # Bump the referrer's counters (best-effort).
    try:
        stats = referrer.referral_stats or ReferralStats()
        stats.total_referrals += 1
        stats.active_referrals += 1
        referrer.referral_stats = stats
        await referrer.save()
    except Exception:
        logger.exception("referral_stats_bump_failed referrer=%s", referrer.id)


# ── Hierarchy earnings rollup (feeds the threshold gate) ───────────────
async def _super_admin_id() -> PydanticObjectId | None:
    from app.services import netting_service

    return await netting_service._resolve_super_admin_id()


def _root_admin_id(user: User, sa_id: PydanticObjectId | None) -> PydanticObjectId | None:
    """The ADMIN that roots this user's subtree (for the earnings rollup)."""
    return getattr(user, "assigned_admin_id", None) or sa_id


async def bump_hierarchy_earnings(root_admin_id, segment: str, amount) -> None:
    """Add `amount` to the (super_admin, root_admin) rollup for `segment`.
    Called whenever a hierarchy commission is earned. Best-effort."""
    amt = quantize_money(to_decimal(amount))
    if amt <= 0:
        return
    seg = segment if segment in ("games", "trading", "mcx", "crypto", "forex") else "trading"
    try:
        sa_id = await _super_admin_id()
        if sa_id is None:
            return
        if root_admin_id is None:
            root_admin_id = sa_id  # user hangs directly off the platform
        coll = SuperAdminHierarchyEarnings.get_motor_collection()
        await coll.update_one(
            {"super_admin_id": sa_id, "root_admin_id": root_admin_id},
            {
                "$inc": {
                    f"earnings_by_segment.{seg}": Decimal128(str(amt)),
                    "total_earnings": Decimal128(str(amt)),
                },
                "$setOnInsert": {"created_at": now_utc()},
                "$set": {"updated_at": now_utc()},
            },
            upsert=True,
        )
    except Exception:
        logger.exception("bump_hierarchy_earnings_failed root=%s seg=%s", root_admin_id, segment)


# ── Record a paid referral reward (Referral doc + referrer rollup) ─────
async def record_referral_earning(
    referrer_id, referred_user_id, amount, *, game: str | None = None, trade: dict | None = None
) -> None:
    """Bump the Referral doc's earnings (+ first_game_win / trading_referrals)
    and the referrer's `referral_stats.total_referral_earnings`. Best-effort."""
    amt = quantize_money(to_decimal(amount))
    if amt <= 0:
        return
    try:
        ref = await Referral.find_one(Referral.referred_user == referred_user_id)
        if ref is not None:
            ref.earnings = Decimal128(str(to_decimal(ref.earnings) + amt))
            if game is not None and not ref.first_game_win.credited:
                ref.first_game_win.credited = True
                ref.first_game_win.amount = Decimal128(str(amt))
                ref.first_game_win.game = game
                ref.first_game_win.credited_at = now_utc()
            if trade is not None:
                from app.models.referral import TradingReferralEntry

                ref.trading_referrals.append(
                    TradingReferralEntry(
                        trade_id=str(trade.get("trade_id")),
                        amount=Decimal128(str(amt)),
                        brokerage=Decimal128(str(to_decimal(trade.get("brokerage", 0)))),
                        segment=str(trade.get("segment", "trading")),
                        credited_at=now_utc(),
                    )
                )
                ref.trading_referral_count += 1
            await ref.save()
        # Referrer rollup.
        referrer = await User.get(referrer_id)
        if referrer is not None:
            stats = referrer.referral_stats or ReferralStats()
            stats.total_referral_earnings = Decimal128(
                str(to_decimal(stats.total_referral_earnings) + amt)
            )
            referrer.referral_stats = stats
            await referrer.save()
    except Exception:
        logger.exception("record_referral_earning_failed referrer=%s", referrer_id)


# ── Phase 2: shared eligibility gate ───────────────────────────────────
def _segment_enabled(rde, segment: str) -> bool:
    """rde = admin.referral_distribution_enabled (or None → all enabled).
    mcx/crypto/forex additionally require the master `trading` flag."""
    if rde is None:
        return True
    if segment == "games":
        return bool(rde.games)
    if segment == "trading":
        return bool(rde.trading)
    if segment in ("mcx", "crypto", "forex"):
        return bool(rde.trading) and bool(getattr(rde, segment))
    return True


def _segment_of_instrument(segment: str | None) -> str:
    """Instrument segment → referral segment key (trading/mcx/crypto/forex)."""
    from app.services import wallet_kinds

    kind = wallet_kinds.wallet_kind_for_segment(segment)
    return {"MCX": "mcx", "CRYPTO": "crypto", "FOREX": "forex"}.get(kind, "trading")


# ── Phase 4: trading referral (every closed trade) ─────────────────────
async def credit_referral_trading_reward(
    user_id, brokerage, trade_id: str, instrument_segment: str | None
) -> None:
    """Pay the referrer `DEFAULT_TRADING_REFERRAL_PERCENT%` of the referred
    user's trade brokerage. Credited to the referrer's segment wallet
    (mcx/crypto/forex) or Main (NSE/BSE). Idempotent by `trade_id`. Routed
    through the shared gate. Never raises (caller wraps too)."""
    try:
        brok = to_decimal(brokerage)
        if brok <= 0:
            return
        referred = await User.get(user_id)
        if referred is None or getattr(referred, "referred_by", None) is None:
            return
        referrer_id = referred.referred_by
        seg = _segment_of_instrument(instrument_segment)
        commission = quantize_money(brok * to_decimal(DEFAULT_TRADING_REFERRAL_PERCENT) / to_decimal(100))
        if commission <= 0:
            return

        # Idempotency: skip if this trade already credited a referral.
        ref = await Referral.find_one(Referral.referred_user == referred.id)
        if ref is not None and any(
            e.trade_id == str(trade_id) for e in (ref.trading_referrals or [])
        ):
            return

        # Shared eligibility gate.
        if not await process_conditional_referral_payout(referred, commission, seg):
            return

        # Credit the referrer's wallet by segment.
        from app.models.transaction import TransactionType
        from app.services import segment_wallet_service, wallet_kinds, wallet_service

        narration = f"Referral commission — {referred.user_code} trade brokerage"
        kind = wallet_kinds.wallet_kind_for_segment(instrument_segment)
        if kind in ("MCX", "CRYPTO", "FOREX"):
            await segment_wallet_service.adjust(
                referrer_id, kind, commission,
                transaction_type=TransactionType.REFERRAL_COMMISSION,
                narration=narration, reference_type="TRADE", reference_id=str(trade_id),
            )
        else:
            await wallet_service.adjust(
                referrer_id, commission,
                transaction_type=TransactionType.REFERRAL_COMMISSION,
                narration=narration, reference_type="TRADE", reference_id=str(trade_id),
            )

        await record_referral_earning(
            referrer_id, referred.id, commission,
            trade={"trade_id": str(trade_id), "brokerage": brok, "segment": seg},
        )
        # Trading brokerage feeds the house-earnings rollup for the threshold.
        await bump_hierarchy_earnings(_root_admin_id(referred, await _super_admin_id()), seg, brok)
    except Exception:
        logger.exception("trading_referral_failed user=%s trade=%s", user_id, trade_id)


async def process_conditional_referral_payout(
    referred_user: User, amount, segment: str, meta: dict | None = None
) -> bool:
    """Return True if a referral reward for `referred_user` in `segment` should
    be PAID now, False if it must be HELD/skipped. Checks: (1) has a referrer,
    (2) within the 1-month window, (3) segment enabled for the subtree,
    (4) house hierarchy-earnings threshold reached. Never raises."""
    try:
        if getattr(referred_user, "referred_by", None) is None:
            return False
        # 1-month window from signup.
        created = getattr(referred_user, "created_at", None)
        if created is not None and (now_utc() - created) > timedelta(days=_REFERRAL_WINDOW_DAYS):
            return False
        sa_id = await _super_admin_id()
        # Segment enable toggle (on the user's ADMIN, else the super-admin).
        admin_uid = getattr(referred_user, "assigned_admin_id", None) or sa_id
        admin = await User.get(admin_uid) if admin_uid else None
        rde = getattr(admin, "referral_distribution_enabled", None) if admin else None
        if not _segment_enabled(rde, segment):
            return False
        # Threshold gate (config on the super-admin).
        sa = await User.get(sa_id) if sa_id else None
        elig = getattr(sa, "referral_eligibility", None) if sa else None
        if elig is not None and elig.enabled:
            root_admin = _root_admin_id(referred_user, sa_id)
            row = await SuperAdminHierarchyEarnings.find_one(
                SuperAdminHierarchyEarnings.super_admin_id == sa_id,
                SuperAdminHierarchyEarnings.root_admin_id == root_admin,
            )
            total = to_decimal(row.total_earnings) if row else Decimal("0")
            if not SuperAdminHierarchyEarnings.threshold_reached(
                total, elig.threshold_amount, elig.threshold_unit
            ):
                logger.info(
                    "referral_held_below_threshold user=%s seg=%s total=%s",
                    referred_user.id, segment, total,
                )
                return False
        return True
    except Exception:
        logger.exception("referral_gate_failed user=%s seg=%s", getattr(referred_user, "id", None), segment)
        return False
