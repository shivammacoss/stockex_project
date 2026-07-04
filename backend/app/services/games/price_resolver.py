"""Authoritative market-price resolvers for games settlement.

NIFTY  → Kite 15m historical candle (open/close) with live-LTP fallback.
BTC    → Binance public 15m klines (private copy of the kline fetch to avoid a
         service→router import) with Infoway live-tick fallback.

Number-result digit extractors also live here.
"""

from __future__ import annotations

import logging
from datetime import datetime
from decimal import ROUND_FLOOR, Decimal

import httpx

from app.utils.decimal_utils import quantize_money, to_decimal

logger = logging.getLogger(__name__)

# Standard Kite instrument token for the NIFTY 50 index.
NIFTY_TOKEN = 256265
BINANCE_KLINES = "https://api.binance.com/api/v3/klines"


# ── NIFTY ────────────────────────────────────────────────────────────
async def nifty_ltp() -> Decimal | None:
    from app.services import market_data_service

    v = market_data_service.get_ltp_instant(str(NIFTY_TOKEN))
    if v and v > 0:
        return v
    try:
        q = await market_data_service.get_quote(str(NIFTY_TOKEN))
        ltp = to_decimal(q.get("ltp") or 0)
        if ltp > 0:
            return ltp
    except Exception:
        logger.debug("nifty_ltp_quote_failed", exc_info=True)
    return None


async def resolve_nifty_window(
    open_dt: datetime, close_dt: datetime
) -> tuple[Decimal, Decimal, str] | None:
    """Return (open_price, close_price, source) for the 15m NIFTY candle that
    covers [open_dt, close_dt) IST. Returns None if unresolvable (settlement
    is then skipped and retried next tick — never settled at a bogus price)."""
    from app.services.zerodha_service import zerodha

    try:
        candles = await zerodha.get_historical(
            NIFTY_TOKEN, open_dt, close_dt, "15minute"
        )
    except Exception:
        logger.debug("nifty_historical_failed", exc_info=True)
        candles = []
    if candles:
        c = candles[0]
        o = to_decimal(c["open"])
        cl = to_decimal(c["close"])
        if o > 0 and cl > 0:
            return quantize_money(o), quantize_money(cl), "kite_15m"
    return None


# ── BTC ──────────────────────────────────────────────────────────────
async def btc_ltp() -> Decimal | None:
    try:
        from app.services.infoway_service import infoway

        tick = infoway.get_tick("BTCUSDT")
        if tick:
            v = to_decimal(tick.get("ltp") or 0)
            if v > 0:
                return v
    except Exception:
        logger.debug("btc_ltp_infoway_failed", exc_info=True)
    # REST fallback — Binance spot price.
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                "https://api.binance.com/api/v3/ticker/price",
                params={"symbol": "BTCUSDT"},
            )
            if r.status_code == 200:
                v = to_decimal(r.json().get("price") or 0)
                if v > 0:
                    return v
    except Exception:
        logger.debug("btc_ltp_binance_failed", exc_info=True)
    return None


async def _binance_klines(start_ms: int, end_ms: int) -> list[list]:
    """Private copy of the 15m Binance kline fetch (public, no auth)."""
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.get(
                BINANCE_KLINES,
                params={
                    "symbol": "BTCUSDT",
                    "interval": "15m",
                    "startTime": start_ms,
                    "endTime": end_ms,
                    "limit": 2,
                },
            )
            if r.status_code == 200:
                return r.json() or []
    except Exception:
        logger.debug("binance_klines_failed", exc_info=True)
    return []


async def resolve_btc_window(
    open_dt: datetime, close_dt: datetime
) -> tuple[Decimal, Decimal, str] | None:
    """Return (open, close, source) for the 15m BTC candle covering the
    window. Binance kline [openTime, open, high, low, close, ...]."""
    start_ms = int(open_dt.timestamp() * 1000)
    end_ms = int(close_dt.timestamp() * 1000) - 1
    klines = await _binance_klines(start_ms, end_ms)
    if klines:
        k = klines[0]
        o = to_decimal(k[1])
        cl = to_decimal(k[4])
        if o > 0 and cl > 0:
            return quantize_money(o), quantize_money(cl), "binance_15m"
    return None


async def resolve_nifty_price_at(dt: datetime) -> Decimal | None:
    """NIFTY close at a specific IST minute (1-min Kite candle), with a
    live-LTP fallback for the current minute."""
    from datetime import timedelta

    from app.services.zerodha_service import zerodha

    try:
        candles = await zerodha.get_historical(
            NIFTY_TOKEN, dt - timedelta(minutes=2), dt + timedelta(minutes=1), "minute"
        )
        if candles:
            cl = to_decimal(candles[-1]["close"])
            if cl > 0:
                return quantize_money(cl)
    except Exception:
        logger.debug("nifty_price_at_failed", exc_info=True)
    return await nifty_ltp()


async def resolve_btc_price_at(dt: datetime) -> Decimal | None:
    """BTC close at a specific IST minute (Binance 1m kline), live fallback."""
    start_ms = int((dt.timestamp() - 120) * 1000)
    end_ms = int((dt.timestamp() + 60) * 1000)
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.get(
                BINANCE_KLINES,
                params={"symbol": "BTCUSDT", "interval": "1m",
                        "startTime": start_ms, "endTime": end_ms, "limit": 3},
            )
            if r.status_code == 200:
                data = r.json() or []
                if data:
                    cl = to_decimal(data[-1][4])
                    if cl > 0:
                        return quantize_money(cl)
    except Exception:
        logger.debug("btc_price_at_failed", exc_info=True)
    return await btc_ltp()


# ── Number-result digit extractors ───────────────────────────────────
def nifty_number_from_close(close) -> int:
    """Fractional two digits of the close, e.g. 23123.65 → 65."""
    c = to_decimal(close)
    frac = c - c.to_integral_value(rounding=ROUND_FLOOR)
    return int((frac * to_decimal(100)).to_integral_value(rounding=ROUND_FLOOR)) % 100


def btc_number_from_close(close) -> int:
    """Last two digits of the integer part, e.g. 75242.89 → 42."""
    c = to_decimal(close)
    return int(c.to_integral_value(rounding=ROUND_FLOOR)) % 100
