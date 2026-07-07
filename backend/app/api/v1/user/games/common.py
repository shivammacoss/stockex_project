"""User games — cross-game read endpoints (live activity, recent winners)."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.dependencies import CurrentUser
from app.models.games.bets import (
    BracketTrade,
    GameBetStatus,
    JackpotBid,
    NumberBet,
    UpDownBet,
)
from app.schemas.common import APIResponse
from app.services.games.common import ist_day

router = APIRouter(tags=["user-games-common"])


@router.get("/live-activity", response_model=APIResponse[dict])
async def live_activity(_: CurrentUser):
    day = ist_day()
    out: dict[str, dict] = {}
    for gk in ("niftyUpDown", "btcUpDown"):
        n = await UpDownBet.find(
            UpDownBet.game_key == gk, UpDownBet.settlement_day == day
        ).count()
        out[gk] = {"tickets": n}
    for gk in ("niftyNumber", "btcNumber"):
        n = await NumberBet.find(NumberBet.game_key == gk, NumberBet.bet_date == day).count()
        out[gk] = {"tickets": n}
    out["niftyBracket"] = {
        "tickets": await BracketTrade.find(BracketTrade.bet_date == day).count()
    }
    for gk in ("niftyJackpot", "btcJackpot"):
        n = await JackpotBid.find(JackpotBid.game_key == gk, JackpotBid.bet_date == day).count()
        out[gk] = {"tickets": n}
    return APIResponse(data=out)


_BINANCE_IV = {"5m": "5m", "15m": "15m", "30m": "30m", "1h": "1h"}
_KITE_IV = {"5m": "5minute", "15m": "15minute", "30m": "30minute", "1h": "60minute"}
_IV_MIN = {"5m": 5, "15m": 15, "30m": 30, "1h": 60}


@router.get("/klines", response_model=APIResponse[dict])
async def klines(_: CurrentUser, asset: str = "btc", interval: str = "5m", limit: int = 200):
    """Candle history for the games chart. BTC → Binance; NIFTY → Kite."""
    import httpx

    from app.services.games.price_resolver import NIFTY_TOKEN

    iv = interval if interval in _IV_MIN else "5m"
    limit = max(20, min(500, limit))
    asset = asset.lower()
    out: list[dict] = []
    source = ""

    if asset == "btc":
        source = "binance"
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.get(
                    "https://api.binance.com/api/v3/klines",
                    params={"symbol": "BTCUSDT", "interval": _BINANCE_IV[iv], "limit": limit},
                )
                if r.status_code == 200:
                    for k in r.json() or []:
                        out.append({
                            "time": int(k[0]) // 1000,
                            "open": float(k[1]), "high": float(k[2]),
                            "low": float(k[3]), "close": float(k[4]),
                            "volume": float(k[5]),
                        })
        except Exception:
            pass
    else:
        source = "kite"
        try:
            from datetime import timedelta

            from app.services.zerodha_service import zerodha
            from app.utils.time_utils import now_utc

            span_min = _IV_MIN[iv] * (limit + 5)
            frm = now_utc() - timedelta(minutes=span_min)
            candles = await zerodha.get_historical(NIFTY_TOKEN, frm, now_utc(), _KITE_IV[iv])
            for c in candles[-limit:]:
                out.append({
                    "time": int(c["time"]), "open": float(c["open"]), "high": float(c["high"]),
                    "low": float(c["low"]), "close": float(c["close"]), "volume": float(c.get("volume") or 0),
                })
        except Exception:
            pass

    return APIResponse(data={"candles": out, "source": source, "interval": iv})


@router.get("/price", response_model=APIResponse[dict])
async def live_price(_: CurrentUser):
    """Live NIFTY + BTC price for the games UI (cheap; client polls ~3s)."""
    from app.services.games import price_resolver

    # Display resolvers keep the last-known price on screen even after market
    # close / feed drop — the UI should never blank to "Waiting for feed".
    nifty = await price_resolver.nifty_ltp_display()
    btc = await price_resolver.btc_ltp()
    return APIResponse(
        data={
            "nifty": str(nifty) if nifty else None,
            "btc": str(btc) if btc else None,
        }
    )


@router.get("/recent-winners", response_model=APIResponse[list])
async def recent_winners(_: CurrentUser, limit: int = 20):
    winners: list[dict] = []
    ups = await UpDownBet.find(UpDownBet.status == GameBetStatus.WON).sort("-updated_at").limit(limit).to_list()
    for b in ups:
        winners.append({"game": b.game_key, "payout": str(b.payout), "at": b.updated_at})
    jps = await JackpotBid.find(JackpotBid.status == GameBetStatus.WON).sort("-updated_at").limit(limit).to_list()
    for b in jps:
        winners.append({"game": b.game_key, "payout": str(b.prize), "at": b.updated_at, "rank": b.rank})
    winners.sort(key=lambda w: w["at"], reverse=True)
    return APIResponse(data=winners[:limit])
