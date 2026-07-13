"""Account 2 — the FIXED-BROKERAGE accounting flow (report-only).

Completely separate from the existing % (pnl/brokerage-share) settlement — it
NEVER moves money and never touches the normal accounts dashboard. It answers
one question for a fixed-brokerage hierarchy, broken down PER SEGMENT:

    "How much FIXED brokerage does each node earn from each of its direct
     children, at the per-lot / per-crore rate the node FROZE for that child in
     each segment (NSE fut/opt, MCX, crypto, forex…)?"

The rate lives on the CHILD as `fixed_brokerage_rates` — a FROZEN per-segment
snapshot the PARENT set via the per-node segment editor. It is what the PARENT
collects from that child's WHOLE subtree volume in that segment — regardless of
what the child later charges its own users. So:

  • SUPER_ADMIN view  → each fixed-brokerage ADMIN  → SA's fixed take.
  • ADMIN view        → each fixed-brokerage BROKER  → admin's fixed take.
  • BROKER view       → each fixed-brokerage SUB-BROKER → broker's fixed take.

    per_crore : (Σ segment trade value / 1e7) × rate
    per_lot   : (Σ segment trade lots)        × rate   (lots = |qty| / lot_size)
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
from app.services.netting_service import _SEGMENT_NAME_MAP
from app.utils.decimal_utils import quantize_money, to_decimal

logger = logging.getLogger(__name__)
_CRORE = Decimal("10000000")  # 1 crore

# Friendly labels for the admin segment codes Account 2 buckets trades into.
SEGMENT_LABELS: dict[str, str] = {
    "NSE_EQ": "NSE Equity",
    "NSE_STK_FUT": "NSE Stock Fut",
    "NSE_IDX_FUT": "NSE Index Fut",
    "NSE_STK_OPT": "NSE Stock Opt",
    "NSE_IDX_OPT": "NSE Index Opt",
    "BSE_EQ": "BSE Equity",
    "BSE_FUT": "BSE Fut",
    "BSE_OPT": "BSE Opt",
    "MCX_FUT": "MCX Fut",
    "MCX_OPT": "MCX Opt",
    "FOREX": "Forex",
    "STOCKS": "Stocks (Intl)",
    "INDICES": "Indices (Intl)",
    "COMMODITIES": "Commodities (Intl)",
    "CRYPTO": "Crypto",
}


def _seg_label(code: str) -> str:
    return SEGMENT_LABELS.get(code, code)


def _effective_rate(entry: dict) -> tuple[Decimal, str]:
    """Resolve one frozen segment entry → (rate, unit). Prefer the segment
    `commission`; for option segments that carry only option buy/sell per-lot
    rates, fall back to the larger of the two (per_lot)."""
    ctype = entry.get("commissionType") or "per_crore"
    comm = entry.get("commission")
    comm_d = to_decimal(comm) if comm is not None else Decimal("0")
    if comm_d == 0:
        ob = to_decimal(entry.get("optionBuyCommission") or 0)
        os_ = to_decimal(entry.get("optionSellCommission") or 0)
        alt = max(ob, os_)
        if alt > 0:
            return alt, "per_lot"
    return comm_d, ctype


def _fixed_from(volume: Decimal, lots: Decimal, rate: Decimal, unit: str) -> Decimal:
    if unit == "per_lot":
        return quantize_money(lots * rate)
    return quantize_money((volume / _CRORE) * rate)  # per_crore


async def _subtree_stats_by_segment(
    user_ids: list[PydanticObjectId],
    start_utc: datetime | None,
    end_utc: datetime | None,
) -> dict[str, dict[str, Decimal]]:
    """Group the subtree's trades by ADMIN segment code → {volume, lots,
    user_brokerage}. Segment code via `_SEGMENT_NAME_MAP` (same mapping the
    settings resolver uses)."""
    out: dict[str, dict[str, Decimal]] = {}
    if not user_ids:
        return out
    q: dict[str, Any] = {"user_id": {"$in": user_ids}}
    if start_utc or end_utc:
        df: dict[str, Any] = {}
        if start_utc:
            df["$gte"] = start_utc
        if end_utc:
            df["$lte"] = end_utc
        q["executed_at"] = df
    trades = await Trade.find(q).to_list()
    for t in trades:
        raw_seg = getattr(t.instrument, "segment", None) or ""
        code = _SEGMENT_NAME_MAP.get(raw_seg, raw_seg) or "UNKNOWN"
        b = out.setdefault(code, {"volume": Decimal("0"), "lots": Decimal("0"), "user_brokerage": Decimal("0")})
        b["volume"] += to_decimal(t.value)
        b["user_brokerage"] += to_decimal(t.brokerage)
        lot_size = int(getattr(t.instrument, "lot_size", 0) or 0) or 1
        b["lots"] += abs(to_decimal(t.quantity)) / to_decimal(lot_size)
    return out


async def _direct_fixed_children(viewer: User) -> list[User]:
    """The viewer's DIRECT children that run in the fixed-brokerage flow."""
    coll = User.get_motor_collection()
    base = {"is_fixed_brokerage": True, "status": {"$ne": UserStatus.CLOSED.value}}
    if viewer.role == UserRole.SUPER_ADMIN:
        q = {**base, "role": UserRole.ADMIN.value}
    elif viewer.role == UserRole.ADMIN:
        q = {**base, "role": UserRole.BROKER.value, "assigned_admin_id": viewer.id,
             "$or": [{"broker_ancestry": {"$size": 0}}, {"broker_ancestry": {"$exists": False}}]}
    elif viewer.role == UserRole.BROKER:
        q = {**base, "role": UserRole.BROKER.value, "assigned_broker_id": viewer.id}
    else:
        return []
    docs = await coll.find(q).to_list(length=1000)
    return [User(**d) for d in docs]


def _child_segment_rows(child: User, stats: dict[str, dict[str, Decimal]]) -> tuple[list[dict], Decimal]:
    """Per-segment fixed take for one child. A segment shows up if the child has
    a FROZEN rate for it OR there was volume in it (rate 0 → take 0, but the
    operator still sees the volume)."""
    rates: dict[str, dict] = dict(getattr(child, "fixed_brokerage_rates", None) or {})
    seg_codes = set(rates.keys()) | set(stats.keys())
    rows: list[dict] = []
    child_total = Decimal("0")
    for code in seg_codes:
        st = stats.get(code) or {"volume": Decimal("0"), "lots": Decimal("0"), "user_brokerage": Decimal("0")}
        entry = rates.get(code) or {}
        rate, unit = _effective_rate(entry) if entry else (Decimal("0"), "per_crore")
        # Legacy fallback: no per-segment rate anywhere → old single rate/unit.
        if not entry and not rates and getattr(child, "fixed_brokerage_rate", None) is not None:
            rate = to_decimal(child.fixed_brokerage_rate)
            unit = child.fixed_brokerage_unit or "per_crore"
        take = _fixed_from(st["volume"], st["lots"], rate, unit)
        child_total += take
        rows.append({
            "segment": code,
            "segment_label": _seg_label(code),
            "unit": unit,
            "rate": str(quantize_money(rate)),
            "volume": str(quantize_money(st["volume"])),
            "lots": str(quantize_money(st["lots"])),
            "user_brokerage": str(quantize_money(st["user_brokerage"])),
            "fixed_brokerage": str(take),
        })
    # Biggest earner first; then by volume so 0-take segments still order sanely.
    rows.sort(key=lambda r: (to_decimal(r["fixed_brokerage"]), to_decimal(r["volume"])), reverse=True)
    return rows, child_total


async def compute_account2(
    viewer: User,
    start_utc: datetime | None,
    end_utc: datetime | None,
) -> dict[str, Any]:
    """Per-child, per-segment fixed-brokerage breakdown for the viewer, plus a
    per-segment grand total across all children and an overall total."""
    children = await _direct_fixed_children(viewer)
    rows: list[dict[str, Any]] = []
    total_fixed = Decimal("0")
    total_volume = Decimal("0")
    seg_totals: dict[str, dict[str, Decimal]] = {}
    for c in children:
        pool = await _entity_pool_ids(c.id, c.role.value)
        stats = await _subtree_stats_by_segment(pool, start_utc, end_utc)
        seg_rows, child_total = _child_segment_rows(c, stats)
        child_volume = sum((to_decimal(r["volume"]) for r in seg_rows), Decimal("0"))
        child_user_bkg = sum((to_decimal(r["user_brokerage"]) for r in seg_rows), Decimal("0"))
        total_fixed += child_total
        total_volume += child_volume
        for r in seg_rows:
            agg = seg_totals.setdefault(r["segment"], {"fixed": Decimal("0"), "volume": Decimal("0")})
            agg["fixed"] += to_decimal(r["fixed_brokerage"])
            agg["volume"] += to_decimal(r["volume"])
        rows.append({
            "id": str(c.id),
            "user_code": c.user_code,
            "name": c.full_name or c.user_code,
            "role": c.role.value,
            "volume": str(quantize_money(child_volume)),
            "user_brokerage": str(quantize_money(child_user_bkg)),
            "fixed_brokerage": str(quantize_money(child_total)),
            "user_count": len(pool),
            "segments": seg_rows,
        })
    rows.sort(key=lambda r: to_decimal(r["fixed_brokerage"]), reverse=True)
    segment_totals = [
        {
            "segment": code,
            "segment_label": _seg_label(code),
            "fixed_brokerage": str(quantize_money(v["fixed"])),
            "volume": str(quantize_money(v["volume"])),
        }
        for code, v in sorted(seg_totals.items(), key=lambda kv: kv[1]["fixed"], reverse=True)
    ]
    return {
        "viewer_role": viewer.role.value,
        "rows": rows,
        "segment_totals": segment_totals,
        "total_fixed_brokerage": str(quantize_money(total_fixed)),
        "total_volume": str(quantize_money(total_volume)),
        "child_count": len(rows),
    }
