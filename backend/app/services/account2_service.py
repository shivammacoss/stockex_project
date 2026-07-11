"""Account 2 — the FIXED-BROKERAGE accounting flow (report-only).

Completely separate from the existing % (pnl/brokerage-share) settlement — it
NEVER moves money and never touches the normal accounts dashboard. It answers
one question for a fixed-brokerage hierarchy:

    "How much FIXED brokerage does each node earn from each of its direct
     children, at the per-lot / per-crore rate the node set for that child?"

The rate lives on the CHILD (`fixed_brokerage_rate` + `fixed_brokerage_unit`) and
is what the PARENT collects from that child's WHOLE subtree volume — regardless
of what the child charges its own users. So:

  • SUPER_ADMIN view  → each fixed-brokerage ADMIN  → SA's fixed take.
  • ADMIN view        → each fixed-brokerage BROKER  → admin's fixed take.
  • BROKER view       → each fixed-brokerage SUB-BROKER → broker's fixed take.

    per_crore : (Σ trade value / 1e7) × rate
    per_lot   : (Σ trade lots)        × rate      (lots = |qty| / lot_size)
"""

from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal
from typing import Any

from beanie import PydanticObjectId

from app.models.trade import Trade
from app.models.user import User, UserRole, UserStatus
from app.services.accounts_dashboard_service import _entity_pool_ids
from app.utils.decimal_utils import quantize_money, to_decimal

logger = logging.getLogger(__name__)
_CRORE = Decimal("10000000")  # 1 crore


def _fixed_from(volume: Decimal, lots: Decimal, rate: Decimal, unit: str | None) -> Decimal:
    if unit == "per_lot":
        return quantize_money(lots * rate)
    # default / per_crore
    return quantize_money((volume / _CRORE) * rate)


async def _subtree_stats(
    user_ids: list[PydanticObjectId],
    start_utc: datetime | None,
    end_utc: datetime | None,
) -> tuple[Decimal, Decimal, Decimal]:
    """Return (volume, lots, user_brokerage) over the subtree's trades in the
    date window. `user_brokerage` is what the child actually charged its users
    (shown for context — the fixed take is computed from volume/lots, not this)."""
    if not user_ids:
        return Decimal("0"), Decimal("0"), Decimal("0")
    q: dict[str, Any] = {"user_id": {"$in": user_ids}}
    if start_utc or end_utc:
        df: dict[str, Any] = {}
        if start_utc:
            df["$gte"] = start_utc
        if end_utc:
            df["$lte"] = end_utc
        q["executed_at"] = df
    trades = await Trade.find(q).to_list()
    volume = Decimal("0")
    lots = Decimal("0")
    user_brokerage = Decimal("0")
    for t in trades:
        volume += to_decimal(t.value)
        user_brokerage += to_decimal(t.brokerage)
        lot_size = int(getattr(t.instrument, "lot_size", 0) or 0) or 1
        lots += abs(to_decimal(t.quantity)) / to_decimal(lot_size)
    return volume, lots, user_brokerage


async def _direct_fixed_children(viewer: User) -> list[User]:
    """The viewer's DIRECT children that run in the fixed-brokerage flow."""
    coll = User.get_motor_collection()
    base = {"is_fixed_brokerage": True, "status": {"$ne": UserStatus.CLOSED.value}}
    if viewer.role == UserRole.SUPER_ADMIN:
        q = {**base, "role": UserRole.ADMIN.value}
    elif viewer.role == UserRole.ADMIN:
        # top-level fixed brokers directly under this admin
        q = {**base, "role": UserRole.BROKER.value, "assigned_admin_id": viewer.id,
             "$or": [{"broker_ancestry": {"$size": 0}}, {"broker_ancestry": {"$exists": False}}]}
    elif viewer.role == UserRole.BROKER:
        q = {**base, "role": UserRole.BROKER.value, "assigned_broker_id": viewer.id}
    else:
        return []
    docs = await coll.find(q).to_list(length=1000)
    return [User(**d) for d in docs]


async def compute_account2(
    viewer: User,
    start_utc: datetime | None,
    end_utc: datetime | None,
) -> dict[str, Any]:
    """Per-child fixed-brokerage breakdown for the viewer + a grand total."""
    children = await _direct_fixed_children(viewer)
    rows: list[dict[str, Any]] = []
    total_fixed = Decimal("0")
    total_volume = Decimal("0")
    for c in children:
        pool = await _entity_pool_ids(c.id, c.role.value)
        volume, lots, user_bkg = await _subtree_stats(pool, start_utc, end_utc)
        rate = to_decimal(c.fixed_brokerage_rate) if c.fixed_brokerage_rate is not None else Decimal("0")
        unit = c.fixed_brokerage_unit or "per_crore"
        fixed = _fixed_from(volume, lots, rate, unit)
        total_fixed += fixed
        total_volume += volume
        rows.append({
            "id": str(c.id),
            "user_code": c.user_code,
            "name": c.full_name or c.user_code,
            "role": c.role.value,
            "unit": unit,
            "rate": str(quantize_money(rate)),
            "volume": str(quantize_money(volume)),
            "lots": str(quantize_money(lots)),
            "user_brokerage": str(quantize_money(user_bkg)),  # what the child charged its users
            "fixed_brokerage": str(fixed),                    # what the VIEWER earns from this child
            "user_count": len(pool),
        })
    rows.sort(key=lambda r: to_decimal(r["fixed_brokerage"]), reverse=True)
    return {
        "viewer_role": viewer.role.value,
        "rows": rows,
        "total_fixed_brokerage": str(quantize_money(total_fixed)),
        "total_volume": str(quantize_money(total_volume)),
        "child_count": len(rows),
    }
