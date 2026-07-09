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
_NIFTY_LAST_KEY = "games:nifty:last"
_NIFTY_LAST_TTL = 259200  # 3 days — survives a weekend gap


async def nifty_ltp() -> Decimal | None:
    """LIVE NIFTY LTP (None when no live price). Used by SETTLEMENT — must
    never return a stale price, or a game could settle at a wrong number."""
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


async def nifty_ltp_display() -> Decimal | None:
    """DISPLAY NIFTY price for the games UI — ALWAYS returns a number once one
    has ever been seen. On a live tick it refreshes a persistent last-known
    cache; when the feed is down / market closed / this is a cold non-leader
    worker, it returns that last-known price so the price never blanks to
    "Waiting for feed". NOT for settlement (see `nifty_ltp`)."""
    from app.core.redis_client import cache_get, cache_set

    live = await nifty_ltp()
    if live and live > 0:
        try:
            await cache_set(_NIFTY_LAST_KEY, str(live), ttl_sec=_NIFTY_LAST_TTL)
        except Exception:
            logger.debug("nifty_ltp_cache_set_failed", exc_info=True)
        return live

    # Fallback 1 — our own persistent last-known (refreshed on every live tick).
    try:
        last = await cache_get(_NIFTY_LAST_KEY)
        if last:
            lv = to_decimal(last)
            if lv > 0:
                return lv
    except Exception:
        logger.debug("nifty_ltp_last_cache_failed", exc_info=True)

    # Fallback 2 — the market-data service's own persistent last-quote
    # (`mdlast:{token}`), which holds the last session's close even when the
    # live feed serves ltp=0 (market closed / feed down). This is what keeps a
    # price on screen all day.
    try:
        md = await cache_get(f"mdlast:{NIFTY_TOKEN}")
        if isinstance(md, dict):
            lv = to_decimal(md.get("ltp") or 0)
            if lv > 0:
                await cache_set(_NIFTY_LAST_KEY, str(lv), ttl_sec=_NIFTY_LAST_TTL)
                return lv
    except Exception:
        logger.debug("nifty_ltp_mdlast_failed", exc_info=True)
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
    """NIFTY close at a specific IST minute (1-min Kite candle), with fallbacks
    that keep settlement UNSTUCK when the result minute lands after market close.

    Bug this fixes: niftyNumber / niftyJackpot use result_time 15:45 while NSE
    shuts at 15:30. The exact 15:43–15:46 window has NO candle and there's no
    live LTP after close, so the old `dt-2m … dt+1m` lookup + `nifty_ltp()`
    fallback both returned None and the settler skipped FOREVER — the result
    never came. We now (1) widen the lookback so the session's LAST candle
    (the 15:30 close) is still found, and (2) fall back to the persisted
    last-known close (`nifty_ltp_display`) so a market-closed result always
    resolves. The last session close IS the correct settlement price once the
    market is shut."""
    from datetime import timedelta

    from app.services.zerodha_service import zerodha
    from app.utils.time_utils import now_ist

    # 1) Live LTP during market hours — the exact price right now.
    live = await nifty_ltp()
    if live and live > 0:
        return live

    # 2) SAME-DAY result AFTER close: the platform's OWN persisted last tick
    #    (mdlast, via nifty_ltp_display) IS the official close and matches the
    #    NIFTY widget the user sees on screen. Prefer it over Zerodha historical
    #    minute data — right after close that historical can be provisional /
    #    lag and return a stale intraday candle. Observed 2026-07-09: historical
    #    tail was 23981.9 while the TRUE close was 23962.8, so the winning
    #    number settled at .90 instead of the correct .80. The last live tick
    #    is authoritative once the market is shut.
    try:
        is_today = dt.date() == now_ist().date()
    except Exception:
        is_today = False
    if is_today:
        disp = await nifty_ltp_display()
        if disp and disp > 0:
            return disp

    # 3) Historical minute candle — authoritative for an OLDER day (backfill),
    #    and a last resort today when no persisted tick exists. 6-hour lookback
    #    so a post-close result still finds the session's last candle.
    try:
        candles = await zerodha.get_historical(
            NIFTY_TOKEN, dt - timedelta(hours=6), dt + timedelta(minutes=1), "minute"
        )
        if candles:
            cl = to_decimal(candles[-1]["close"])
            if cl > 0:
                return quantize_money(cl)
    except Exception:
        logger.debug("nifty_price_at_failed", exc_info=True)

    # 4) Final fallback — persisted last-known close so settlement never stalls.
    return await nifty_ltp_display()


async def resolve_btc_price_at(dt: datetime) -> Decimal | None:
    """BTC price AT the exact IST minute `dt` — the CLOSE of the 1-minute
    Binance candle that ENDS at `dt` (i.e. the last trade just before `dt`).

    This is the number Binance itself shows as the candle close at `dt`
    (e.g. the 15m 22:45 candle closes at 23:00 with the same value), so the
    game result matches Binance exactly. The old code took the candle that
    OPENS at `dt` (closing at dt+1m), which read the price a minute LATE and
    drifted ~10-40 pts on a fast tick. Live fallback for the current minute.
    """
    dt_ms = int(dt.timestamp() * 1000)
    target_open = dt_ms - 60_000  # the 1m candle whose close time == dt
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.get(
                BINANCE_KLINES,
                params={"symbol": "BTCUSDT", "interval": "1m",
                        "startTime": dt_ms - 180_000, "endTime": dt_ms + 60_000, "limit": 5},
            )
            if r.status_code == 200:
                data = r.json() or []
                # Exact candle closing at dt (openTime == dt − 1 min).
                for k in data:
                    if int(k[0]) == target_open:
                        cl = to_decimal(k[4])
                        if cl > 0:
                            return quantize_money(cl)
                # Fallback — the most recent candle that closed at/before dt.
                closed = [k for k in data if int(k[0]) <= target_open]
                if closed:
                    cl = to_decimal(closed[-1][4])
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
