"""Patti sharing config — SUPER_ADMIN sets an admin-tier member's trading
P&L cascade share (enabled + per-segment pnl%/brokerage%)."""

from __future__ import annotations

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException

from app.core.dependencies import SuperAdmin
from app.models.user import PattiSegmentShare, PattiSharing, User, UserRole
from app.schemas.common import APIResponse

router = APIRouter(prefix="/patti", tags=["admin-patti"])

_SEG_KEYS = ("ALL", "trading", "mcx", "crypto", "forex")


def _serialize(ps: PattiSharing | None) -> dict:
    ps = ps or PattiSharing()
    return {
        "enabled": ps.enabled,
        "applied_to": ps.applied_to,
        "segments": {k: {"pnl_pct": v.pnl_pct, "brokerage_pct": v.brokerage_pct} for k, v in ps.segments.items()},
    }


@router.get("/{user_id}", response_model=APIResponse[dict])
async def get_patti(user_id: str, admin: SuperAdmin):
    u = await User.get(PydanticObjectId(user_id))
    if u is None:
        raise HTTPException(status_code=404, detail="Member not found")
    return APIResponse(data={"user_code": u.user_code, "role": u.role.value, **_serialize(u.patti_sharing)})


@router.put("/{user_id}", response_model=APIResponse[dict])
async def set_patti(user_id: str, payload: dict, admin: SuperAdmin):
    u = await User.get(PydanticObjectId(user_id))
    if u is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if u.role not in (UserRole.ADMIN, UserRole.BROKER, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=400, detail="Patti applies to admin-tier members only")

    ps = u.patti_sharing or PattiSharing()
    if "enabled" in payload:
        ps.enabled = bool(payload["enabled"])
    seg_in = payload.get("segments") or {}
    if not isinstance(seg_in, dict):
        raise HTTPException(status_code=400, detail="segments must be an object")
    for k, v in seg_in.items():
        if k not in _SEG_KEYS or not isinstance(v, dict):
            continue
        pnl = float(v.get("pnl_pct", 0) or 0)
        brok = float(v.get("brokerage_pct", 0) or 0)
        if not (0 <= pnl <= 100 and 0 <= brok <= 100):
            raise HTTPException(status_code=400, detail="percentages must be 0..100")
        ps.segments[k] = PattiSegmentShare(pnl_pct=pnl, brokerage_pct=brok)
    u.patti_sharing = ps
    await u.save()
    return APIResponse(data={"user_code": u.user_code, **_serialize(ps)}, message="Patti updated")
