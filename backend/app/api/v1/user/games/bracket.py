"""User Nifty Bracket endpoints."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.dependencies import CurrentUser
from app.models.games.bets import BracketTrade, GameBetStatus
from app.schemas.common import APIResponse
from app.services.games import bracket_service
from app.services.games.common import ist_day

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


@router.get("/recent-results", response_model=APIResponse[list])
async def recent_results(user: CurrentUser, limit: int = 5):
    """Last N SESSION results for the Nifty Bracket — GLOBAL, so every player sees
    the recent outcomes even before their own trades settle.

    All same-day brackets resolve together at the one official session-close price,
    so we collapse the resolved trades to a single close per IST day. `direction`
    is that close vs the previous session's close (UP/DOWN/FLAT) for colouring.
    """
    # Resolved (settled) brackets only, newest first. 1500 rows comfortably spans
    # many sessions even on a busy day.
    rows = (
        await BracketTrade.find({"status": {"$ne": GameBetStatus.PENDING.value}})
        .sort("-created_at")
        .limit(1500)
        .to_list()
    )
    # Collapse to one close per IST day (first — i.e. newest — non-null we see).
    by_day: dict[str, str] = {}
    for t in rows:
        if t.result_price is None:
            continue
        d = ist_day(t.created_at)
        if d not in by_day:
            by_day[d] = str(t.result_price)
    days = sorted(by_day.keys(), reverse=True)  # newest day first
    out: list[dict] = []
    for i, d in enumerate(days[:limit]):
        close = float(by_day[d])
        direction = None
        if i + 1 < len(days):  # the next entry is the chronologically-previous day
            prev_close = float(by_day[days[i + 1]])
            direction = "UP" if close > prev_close else ("DOWN" if close < prev_close else "FLAT")
        out.append({"day": d, "close_price": by_day[d], "direction": direction})
    return APIResponse(data=out)
