"""Kuber pool management — SUPER_ADMIN only.

The kuber wallet is the SA's distributable house pool (₹100 cr cap), separate
from their personal main wallet. Here the SA can view it, bootstrap/refill it to
the cap, and move funds between kuber ↔ main.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.dependencies import SuperAdmin
from app.schemas.common import APIResponse
from app.services import kuber_service

router = APIRouter(prefix="/kuber", tags=["admin-kuber"])


class TransferReq(BaseModel):
    direction: str  # "to_kuber" | "to_main"
    amount: float


@router.get("", response_model=APIResponse[dict])
async def get_kuber(admin: SuperAdmin):
    return APIResponse(data=await kuber_service.summary(admin.id))


@router.post("/bootstrap", response_model=APIResponse[dict])
async def bootstrap(admin: SuperAdmin):
    """Top the kuber pool up to the ₹100 cr cap (idempotent)."""
    return APIResponse(
        data=await kuber_service.bootstrap_kuber_to_max(admin.id, actor_id=admin.id),
        message="Kuber pool topped up",
    )


@router.post("/transfer", response_model=APIResponse[dict])
async def transfer(payload: TransferReq, admin: SuperAdmin):
    try:
        if payload.direction == "to_kuber":
            data = await kuber_service.transfer_main_to_kuber(admin.id, payload.amount, actor_id=admin.id)
        elif payload.direction == "to_main":
            data = await kuber_service.transfer_kuber_to_main(admin.id, payload.amount, actor_id=admin.id)
        else:
            raise HTTPException(status_code=400, detail="direction must be to_kuber|to_main")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:  # InsufficientFundsError etc.
        raise HTTPException(status_code=400, detail=getattr(e, "message", str(e)))
    return APIResponse(data=data, message="Transfer complete")
