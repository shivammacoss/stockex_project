"""Referral document — one row per (referrer → referred user).

Tracks the user-to-user growth incentive (distinct from admin hierarchy
commission). Created at signup when a user joins via another user's referral
code. Games referral credits `first_game_win` once per game; trading referral
appends to `trading_referrals[]` per closed trade (idempotent by trade_id).

Mirrors `refles.md` Part C.8. Additive — no existing behaviour depends on it.
"""

from __future__ import annotations

from datetime import datetime

from beanie import Indexed, PydanticObjectId
from bson import Decimal128
from pydantic import BaseModel, Field
from pymongo import ASCENDING, IndexModel

from app.models._base import StrEnum, TimestampMixin
from app.models._types import Money


def _zero() -> Decimal128:
    return Decimal128("0")


class ReferralStatus(StrEnum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"


class FirstGameWin(BaseModel):
    credited: bool = False
    amount: Money = Field(default_factory=_zero)
    game: str | None = None
    credited_at: datetime | None = None


class TradingReferralEntry(BaseModel):
    trade_id: str
    amount: Money = Field(default_factory=_zero)
    brokerage: Money = Field(default_factory=_zero)
    segment: str
    credited_at: datetime | None = None


class Referral(TimestampMixin):
    referrer: PydanticObjectId
    referred_user: Indexed(PydanticObjectId, unique=True)  # type: ignore[valid-type]
    referral_code: str  # the referrer's user_code used at signup
    status: ReferralStatus = ReferralStatus.ACTIVE

    # Cumulative reward paid to the referrer from this referred user.
    earnings: Money = Field(default_factory=_zero)

    # Games: at most one credit per game (see referral service first-win gate).
    first_game_win: FirstGameWin = Field(default_factory=FirstGameWin)

    # Trading: one entry per closed trade that charged brokerage. `trade_id`
    # is the per-trade idempotency key. (History kept for the ledger; the
    # THRESHOLD model below is what actually gates the one-time payout.)
    trading_referral_count: int = 0
    trading_referrals: list[TradingReferralEntry] = Field(default_factory=list)

    # ── Trading referral THRESHOLD model (super-admin configurable) ──────
    # The referrer earns a ONE-TIME reward once the SUPER-ADMIN's NET brokerage
    # income from this referred user (accumulated across all their closed
    # trades) reaches the configured threshold. `sa_brokerage_accrued` is that
    # running total; the UI shows it as a progress bar toward the threshold.
    sa_brokerage_accrued: Money = Field(default_factory=_zero)
    trading_reward_paid: bool = False
    trading_reward_paid_at: datetime | None = None
    trading_reward_amount: Money = Field(default_factory=_zero)  # what was paid

    # ── Per-segment threshold model (4x) ────────────────────────────────
    # Each trading segment earns its OWN one-time reward: NSE(=trading), MCX,
    # Crypto and Forex accrue the SUPER-ADMIN's NET brokerage SEPARATELY and
    # each pays the reward once when that segment's own accrual crosses the
    # threshold. So a single referred user can trigger up to 4 rewards (one
    # per segment) instead of one pooled reward. Keys are the referral segment
    # keys: "trading" / "mcx" / "crypto" / "forex".
    sa_brokerage_accrued_by_segment: dict[str, Money] = Field(default_factory=dict)
    trading_reward_paid_segments: list[str] = Field(default_factory=list)

    activated_at: datetime | None = None

    class Settings:
        name = "referrals"
        indexes = [
            IndexModel([("referred_user", ASCENDING)], unique=True),
            IndexModel([("referrer", ASCENDING)]),
        ]
