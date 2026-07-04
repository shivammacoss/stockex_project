"""SuperAdminHierarchyEarnings — per (super_admin, root_admin) earnings rollup.

Tracks how much the house/hierarchy has earned from a given admin subtree,
split by segment. This is the number the referral **threshold gate** checks
(refles.md Part C.5): a referral is only paid once the subtree's earnings
reach the configured threshold (PER_CRORE or ABSOLUTE). Additive.
"""

from __future__ import annotations

from decimal import Decimal

from beanie import PydanticObjectId
from bson import Decimal128
from pydantic import BaseModel, Field
from pymongo import ASCENDING, IndexModel

from app.models._base import TimestampMixin
from app.models._types import Money


def _zero() -> Decimal128:
    return Decimal128("0")


class EarningsBySegment(BaseModel):
    games: Money = Field(default_factory=_zero)
    trading: Money = Field(default_factory=_zero)
    mcx: Money = Field(default_factory=_zero)
    crypto: Money = Field(default_factory=_zero)
    forex: Money = Field(default_factory=_zero)


class SuperAdminHierarchyEarnings(TimestampMixin):
    super_admin_id: PydanticObjectId
    # The root ADMIN of the subtree this rollup belongs to (may equal the
    # super_admin when the user hangs directly off the platform).
    root_admin_id: PydanticObjectId
    earnings_by_segment: EarningsBySegment = Field(default_factory=EarningsBySegment)
    total_earnings: Money = Field(default_factory=_zero)

    class Settings:
        name = "super_admin_hierarchy_earnings"
        indexes = [
            IndexModel(
                [("super_admin_id", ASCENDING), ("root_admin_id", ASCENDING)],
                unique=True,
            ),
        ]

    @staticmethod
    def threshold_reached(total: Decimal, threshold_amount: float, unit: str) -> bool:
        """PER_CRORE: total / 1e7 >= threshold; ABSOLUTE: total >= threshold."""
        if unit == "PER_CRORE":
            return (total / Decimal("10000000")) >= Decimal(str(threshold_amount))
        return total >= Decimal(str(threshold_amount))
