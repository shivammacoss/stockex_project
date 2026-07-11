"""Admin referral config — SUPER_ADMIN sets the payout threshold + per-admin
segment toggles that gate whether referral rewards pay for a subtree."""

from __future__ import annotations

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException

from app.core.dependencies import SuperAdmin
from app.models.user import (
    ReferralDistributionEnabled,
    ReferralEligibility,
    User,
    UserRole,
)
from app.schemas.common import APIResponse

router = APIRouter(prefix="/referral", tags=["admin-referral"])


@router.get("/eligibility", response_model=APIResponse[dict])
async def get_eligibility(admin: SuperAdmin):
    """The super-admin's referral payout threshold gate (defaults if unset)."""
    elig = admin.referral_eligibility or ReferralEligibility()
    return APIResponse(
        data={
            "enabled": elig.enabled,
            "threshold_amount": elig.threshold_amount,
            "threshold_unit": elig.threshold_unit,
            # Trading referral threshold model (per-referred-user SA net brokerage).
            "trading_threshold_amount": getattr(elig, "trading_threshold_amount", 1000.0),
            "trading_reward_amount": getattr(elig, "trading_reward_amount", 1000.0),
        }
    )


@router.put("/eligibility", response_model=APIResponse[dict])
async def put_eligibility(payload: dict, admin: SuperAdmin):
    cur = admin.referral_eligibility or ReferralEligibility()
    if "enabled" in payload:
        cur.enabled = bool(payload["enabled"])
    if payload.get("threshold_amount") is not None:
        amt = float(payload["threshold_amount"])
        if amt <= 0:
            raise HTTPException(status_code=400, detail="threshold_amount must be > 0")
        cur.threshold_amount = amt
    if payload.get("threshold_unit") is not None:
        unit = str(payload["threshold_unit"]).upper()
        if unit not in ("PER_CRORE", "ABSOLUTE"):
            raise HTTPException(status_code=400, detail="threshold_unit must be PER_CRORE|ABSOLUTE")
        cur.threshold_unit = unit
    # Trading referral threshold model.
    if payload.get("trading_threshold_amount") is not None:
        t = float(payload["trading_threshold_amount"])
        if t <= 0:
            raise HTTPException(status_code=400, detail="trading_threshold_amount must be > 0")
        cur.trading_threshold_amount = t
    if payload.get("trading_reward_amount") is not None:
        rw = float(payload["trading_reward_amount"])
        if rw < 0:
            raise HTTPException(status_code=400, detail="trading_reward_amount must be >= 0")
        cur.trading_reward_amount = rw
    admin.referral_eligibility = cur
    await admin.save()
    return APIResponse(
        data={
            "enabled": cur.enabled,
            "threshold_amount": cur.threshold_amount,
            "threshold_unit": cur.threshold_unit,
            "trading_threshold_amount": getattr(cur, "trading_threshold_amount", 1000.0),
            "trading_reward_amount": getattr(cur, "trading_reward_amount", 1000.0),
        },
        message="Referral eligibility updated",
    )


@router.put("/users/{user_id}/toggles", response_model=APIResponse[dict])
async def put_user_toggles(user_id: str, payload: dict, admin: SuperAdmin):
    """Enable/disable referral payouts per segment for an ADMIN's subtree.
    Only meaningful on ADMIN / SUPER_ADMIN users."""
    target = await User.get(PydanticObjectId(user_id))
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.BROKER):
        raise HTTPException(status_code=400, detail="Toggles apply to admin-tier users only")
    rde = target.referral_distribution_enabled or ReferralDistributionEnabled()
    for seg in ("games", "trading", "mcx", "crypto", "forex"):
        if seg in payload:
            setattr(rde, seg, bool(payload[seg]))
    target.referral_distribution_enabled = rde
    await target.save()
    return APIResponse(
        data={
            "user_id": str(target.id),
            "referral_distribution_enabled": rde.model_dump(),
        },
        message="Referral toggles updated",
    )
