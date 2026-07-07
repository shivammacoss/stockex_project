"""Binance public market-data feed — CRYPTO only, free and keyless.

Replaces the Infoway `crypto` channel. Connects to Binance's public combined
`@ticker` WebSocket stream (`wss://stream.binance.com:9443`, no API key) and
writes each crypto tick into the SAME shared tick cache (`infoway.ticks`) and
the SAME Redis channel (`infoway:tick:{sym}`) that `market_data_service`,
`core.ws_hub` and the games BTC resolver already read — so NO consumer
changes. Forex / metals / energy remain on Infoway (idle unless
`INFOWAY_API_KEY` is set; with the key removed the whole Infoway feed is off).

The `@ticker` stream (24h rolling window) carries last price, best bid/ask,
24h open/high/low and change% — everything the downstream tick dict needs.
Every value exposed downstream is a plain `float` (Decimal coercion only
happens at the order/wallet boundary), mirroring the Infoway tick shape.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

import websockets

from app.core.config import settings
from app.core.redis_client import publish

logger = logging.getLogger(__name__)

# No inbound frame for this long → the socket is wedged; force a reconnect.
# The @ticker stream pushes ~1 Hz per symbol, so 30 s of silence is dead.
STALE_RX_TIMEOUT_SEC = 30
RECONNECT_BACKOFF_CAP_SEC = 30


def _f(v: Any, default: float = 0.0) -> float:
    """Coerce any incoming numeric (str/int/float/None) to a finite float."""
    if v is None:
        return default
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    if f != f or f in (float("inf"), float("-inf")):  # NaN / inf
        return default
    return f


def symbols() -> list[str]:
    """Configured Binance crypto symbols (upper, deduped) — e.g. BTCUSDT."""
    out: list[str] = []
    seen: set[str] = set()
    for s in (settings.BINANCE_SYMBOLS or "").split(","):
        t = s.strip().upper()
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


class BinanceService:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop: bool = False
        self._connected: bool = False
        self._last_rx: float = 0.0
        self._last_error: str | None = None
        self._symbols: list[str] = []

    @property
    def is_connected(self) -> bool:
        return self._connected

    def status(self) -> dict[str, Any]:
        return {
            "connected": self._connected,
            "symbols": self._symbols,
            "lastError": self._last_error,
        }

    # ── Lifecycle ────────────────────────────────────────────────────
    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        if not settings.BINANCE_ENABLED:
            logger.info("binance_skipped: BINANCE_ENABLED is false")
            return
        self._symbols = symbols()
        if not self._symbols:
            logger.info("binance_skipped: no BINANCE_SYMBOLS configured")
            return
        self._stop = False
        self._task = asyncio.create_task(self._run_loop(), name="binance_ws")
        logger.info("binance_started", extra={"symbols": len(self._symbols)})

    async def stop(self) -> None:
        self._stop = True
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        self._task = None
        self._connected = False

    # ── Connect / reconnect ──────────────────────────────────────────
    async def _run_loop(self) -> None:
        backoff = 1
        while not self._stop:
            try:
                await self._connect_once()
                backoff = 1
            except asyncio.CancelledError:
                break
            except Exception as e:  # noqa: BLE001
                self._last_error = str(e)[:300]
                logger.warning("binance_reconnect: %s", str(e)[:200])
            self._connected = False
            if self._stop:
                break
            await asyncio.sleep(min(backoff, RECONNECT_BACKOFF_CAP_SEC))
            backoff = min(backoff * 2, RECONNECT_BACKOFF_CAP_SEC)

    async def _connect_once(self) -> None:
        streams = "/".join(f"{s.lower()}@ticker" for s in self._symbols)
        url = f"{settings.BINANCE_WS_BASE}/stream?streams={streams}"
        # Binance sends server-side pings which `websockets` auto-pongs; we
        # disable client pings (Binance may not pong them) and rely on the
        # stale-rx watchdog below to heal a wedged socket.
        async with websockets.connect(
            url, ping_interval=None, ping_timeout=None, close_timeout=5, max_size=2**20
        ) as ws:
            self._connected = True
            self._last_error = None
            self._last_rx = time.monotonic()
            logger.info("binance_ws_connected", extra={"symbols": len(self._symbols)})
            while not self._stop:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=STALE_RX_TIMEOUT_SEC)
                except asyncio.TimeoutError:
                    logger.warning("binance_stale_rx: no frame for %ds → reconnect", STALE_RX_TIMEOUT_SEC)
                    return  # unwind → _run_loop reconnects
                self._last_rx = time.monotonic()
                try:
                    msg = json.loads(raw if isinstance(raw, str) else raw.decode("utf-8"))
                except Exception:
                    continue
                await self._handle(msg)

    # ── Tick handling ────────────────────────────────────────────────
    async def _handle(self, msg: dict[str, Any]) -> None:
        # Combined stream wraps each event as {stream, data}; be tolerant of a
        # bare event too.
        d = msg.get("data") if isinstance(msg.get("data"), dict) else msg
        if not isinstance(d, dict) or d.get("e") != "24hrTicker":
            return
        sym = (d.get("s") or "").upper()
        if not sym:
            return
        ltp = _f(d.get("c"))
        if ltp <= 0:
            return
        open_p = _f(d.get("o"))  # price 24h ago = the change reference (prev close)

        tick = {
            "symbol": sym,
            "ltp": ltp,
            "bid": _f(d.get("b")),
            "ask": _f(d.get("a")),
            "volume": _f(d.get("v")),
            "ts": int(_f(d.get("E"), time.time() * 1000)),
            "close_24h": open_p,
            "change": round(_f(d.get("p")), 6),
            "change_pct": round(_f(d.get("P")), 4),
            "open": open_p,
            "high": _f(d.get("h")),
            "low": _f(d.get("l")),
        }

        # Write into the SHARED tick cache that Infoway consumers read from, so
        # market-data / ws_hub / games see Binance crypto prices unchanged.
        try:
            from app.services.infoway_service import infoway

            infoway.ticks[sym] = tick
        except Exception:
            logger.debug("binance_cache_write_failed sym=%s", sym, exc_info=True)

        # Fan out to Redis for the user-side WS clients (same channel as Infoway).
        try:
            await publish(f"infoway:tick:{sym}", tick)
        except Exception:
            logger.debug("binance_publish_failed sym=%s", sym, exc_info=True)


# Singleton
binance = BinanceService()
