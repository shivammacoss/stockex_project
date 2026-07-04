"""AdminFundRequest — a child admin/broker asks a parent (or SUPER_ADMIN) for
funds. Requests flow UP, funds/approvals flow DOWN (mirrors D:\\Stockex).

Direct parent→child add/deduct transfers do NOT use this model (they settle
immediately); this is only the request→approve chain. Additive.
"""

from __future__ import annotations

from datetime import datetime

from beanie import Indexed, PydanticObjectId
from bson import Decimal128
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel

from app.models._base import StrEnum, TimestampMixin
from app.models._types import Money


class AdminFundStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class AdminFundRequest(TimestampMixin):
    requester_id: Indexed(PydanticObjectId)  # type: ignore[valid-type]
    target_admin_id: Indexed(PydanticObjectId)  # type: ignore[valid-type]  # the parent/SA who approves
    amount: Money = Field(default_factory=lambda: Decimal128("0"))
    reason: str = ""
    status: AdminFundStatus = AdminFundStatus.PENDING
    remarks: str | None = None
    resolved_by: PydanticObjectId | None = None
    resolved_at: datetime | None = None

    class Settings:
        name = "admin_fund_requests"
        indexes = [
            IndexModel([("target_admin_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("requester_id", ASCENDING), ("created_at", DESCENDING)]),
        ]
