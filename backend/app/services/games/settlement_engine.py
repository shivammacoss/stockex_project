"""Games auto-settlement engine — 3 leader-only background loops.

  • games_general_tick_loop (30s) — Nifty Up/Down, Bracket, Number (both),
    Nifty Jackpot.
  • btc_updown_fast_loop (5s)     — BTC Up/Down (fast publish).
  • btc_jackpot_loop (1s)         — BTC Jackpot lock + declare.

Each loop is wrapped in `_supervise` + `_leader_only` at the main.py lifespan
so exactly one worker runs it. Per-loop single-flight is guaranteed by the
sequential `while` body; every declare path is independently idempotent
(UpDownWindowSettlement unique index / GameResult / bank.result_declared), so
a duplicate fire is a safe no-op. All declares are wrapped so one game's error
never stops the others.
"""

from __future__ import annotations

import asyncio
import logging

from app.services.games import (
    bracket_service,
    jackpot_service,
    number_service,
    updown_service,
)

logger = logging.getLogger(__name__)

_general_stop = False
_btc_updown_stop = False
_btc_jackpot_stop = False


def stop_games_loops() -> None:
    global _general_stop, _btc_updown_stop, _btc_jackpot_stop
    _general_stop = True
    _btc_updown_stop = True
    _btc_jackpot_stop = True


async def _safe(label: str, coro) -> None:
    try:
        await coro
    except Exception:  # noqa: BLE001 — one game's failure must not stop others
        logger.exception("games_settle_failed %s", label)


async def games_general_tick_loop(interval_sec: float = 30.0) -> None:
    global _general_stop
    _general_stop = False
    logger.info("games_general_tick_loop_started")
    while not _general_stop:
        await _safe("niftyUpDown", updown_service.declare_and_settle("niftyUpDown"))
        await _safe("niftyBracket", bracket_service.declare_and_settle())
        await _safe("niftyNumber", number_service.declare_and_settle("niftyNumber"))
        await _safe("btcNumber", number_service.declare_and_settle("btcNumber"))
        await _safe("niftyJackpot", jackpot_service.declare_and_settle("niftyJackpot"))
        try:
            await asyncio.sleep(interval_sec)
        except asyncio.CancelledError:
            return


async def btc_updown_fast_loop(interval_sec: float = 5.0) -> None:
    global _btc_updown_stop
    _btc_updown_stop = False
    logger.info("games_btc_updown_fast_loop_started")
    while not _btc_updown_stop:
        await _safe("btcUpDown", updown_service.declare_and_settle("btcUpDown"))
        try:
            await asyncio.sleep(interval_sec)
        except asyncio.CancelledError:
            return


async def btc_jackpot_loop(interval_sec: float = 1.0) -> None:
    global _btc_jackpot_stop
    _btc_jackpot_stop = False
    logger.info("games_btc_jackpot_loop_started")
    while not _btc_jackpot_stop:
        await _safe("btcJackpot", jackpot_service.declare_and_settle("btcJackpot"))
        try:
            await asyncio.sleep(interval_sec)
        except asyncio.CancelledError:
            return
