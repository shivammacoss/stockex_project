"""User Nifty Bracket endpoints."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.dependencies import CurrentUser
from app.models.games.bets import BracketTrade, GameBetStatus
from app.schemas.common import APIResponse
from app.services.games import bracket_service

router = APIRouter(prefix="/bracket", tags=["user-games-bracket"])


class BracketReq(BaseModel):
    prediction: str  # BUY | SELL
    amount: float
    entryPrice: float


def _ser(t: BracketTrade) -> dict:
    return {
        "id": str(t.id), "prediction": t.prediction.value, "amount": str(t.amount),
        "entry_price": str(t.entry_price), "upper_target": str(t.upper_target),
        "lower_target": str(t.lower_target), "expires_at": t.expires_at,
        "status": t.status.value, "payout": str(t.payout),
        "result_price": str(t.result_price) if t.result_price else None,
        "created_at": t.created_at,
    }


@router.post("/trade", response_model=APIResponse[dict])
async def trade(payload: BracketReq, user: CurrentUser):
    t = await bracket_service.place_bet(
        user.id, prediction=payload.prediction, amount=payload.amount, entry_price=payload.entryPrice
    )
    return APIResponse(data=_ser(t), message="Bracket placed")


@router.get("/active", response_model=APIResponse[list])
async def active(user: CurrentUser):
    rows = await BracketTrade.find(
        BracketTrade.user_id == user.id, BracketTrade.status == GameBetStatus.PENDING
    ).sort("-created_at").to_list()
    return APIResponse(data=[_ser(t) for t in rows])


@router.get("/history", response_model=APIResponse[list])
async def history(user: CurrentUser, limit: int = 50):
    rows = await BracketTrade.find(BracketTrade.user_id == user.id).sort("-created_at").limit(limit).to_list()
    return APIResponse(data=[_ser(t) for t in rows])
