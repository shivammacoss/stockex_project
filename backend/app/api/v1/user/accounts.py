"""User multi-wallet "My Accounts" API — list wallets, set primary, transfer."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.dependencies import CurrentUser
from app.schemas.common import APIResponse
from app.services import segment_wallet_service, wallet_kinds

router = APIRouter(prefix="/accounts", tags=["user-accounts"])


class SetPrimary(BaseModel):
    kind: str


class TransferReq(BaseModel):
    from_kind: str
    to_kind: str
    amount: float


@router.get("", response_model=APIResponse[dict])
async def my_accounts(user: CurrentUser):
    wallets = await segment_wallet_service.list_all(user.id)
    primary = getattr(user, "primary_wallet_kind", wallet_kinds.DEFAULT_PRIMARY) or wallet_kinds.DEFAULT_PRIMARY
    return APIResponse(
        data={
            "primary_wallet_kind": primary,
            "primary_segments": wallet_kinds.segments_for_kind(primary),
            "wallets": wallets,
            "segment_kinds": list(wallet_kinds.SEGMENT_KINDS),
            "labels": wallet_kinds.LABELS,
        }
    )


@router.post("/primary", response_model=APIResponse[dict])
async def set_primary(payload: SetPrimary, user: CurrentUser):
    if not wallet_kinds.is_segment_kind(payload.kind):
        raise HTTPException(status_code=400, detail="Pick a trading wallet (not Main)")
    user.primary_wallet_kind = payload.kind
    await user.save()
    return APIResponse(
        data={"primary_wallet_kind": payload.kind, "primary_segments": wallet_kinds.segments_for_kind(payload.kind)},
        message=f"{wallet_kinds.LABELS.get(payload.kind, payload.kind)} is now your primary account",
    )


@router.post("/transfer", response_model=APIResponse[dict])
async def transfer(payload: TransferReq, user: CurrentUser):
    res = await segment_wallet_service.transfer(user.id, payload.from_kind, payload.to_kind, payload.amount)
    return APIResponse(data=res, message="Transfer complete")
