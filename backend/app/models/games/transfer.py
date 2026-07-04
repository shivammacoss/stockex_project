"""Games → main wallet transfer request (admin-approved).

Main → games is instant (no request). Games → main is admin-approved to
mirror the deposit/withdrawal money controls: the user raises a request, an
admin approves, and only then is the games wallet debited + main wallet
credited. Per-user invariant: at most ONE pending row (partial unique index).
"""

from __future__ import annotations

from datetime import datetime

from beanie import PydanticObjectId
from bson import Decimal128
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel

from app.models._base import StrEnum, TimestampMixin
from app.models._types import Money


def _zero() -> Decimal128:
    return Decimal128("0")


class GamesWithdrawalStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class GamesWithdrawalRequest(TimestampMixin):
    user_id: PydanticObjectId
    amount: Money = Field(default_factory=_zero)
    status: GamesWithdrawalStatus = GamesWithdrawalStatus.PENDING
    user_remark: str | None = None
    admin_remark: str | None = None
    processed_by: PydanticObjectId | None = None
    processed_at: datetime | None = None

    class Settings:
        name = "games_withdrawal_requests"
        indexes = [
            IndexModel([("status", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel(
                [("user_id", ASCENDING)],
                unique=True,
                partialFilterExpression={"status": "PENDING"},
                name="games_withdrawal_one_pending_per_user",
            ),
        ]
