"""Segment-aware wallet router (multi-wallet — wallet.md).

The single choke point the trading path calls instead of `wallet_service`
directly. When `MULTI_WALLET_ENABLED` is on, every margin / balance / P&L op
routes to the instrument's SEGMENT wallet (NSE_BSE / MCX / CRYPTO / FOREX);
when off, it falls through to the legacy single Main `Wallet` — so flipping the
flag OFF restores the original behaviour byte-for-byte.

All trading call sites have the segment in scope (order.instrument.segment /
position.segment_type), so routing is a drop-in: pass the segment string.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

from beanie import PydanticObjectId

from app.core.config import settings
from app.services import segment_wallet_service, wallet_kinds, wallet_service
from app.utils.decimal_utils import to_decimal

logger = logging.getLogger(__name__)


def enabled() -> bool:
    return bool(getattr(settings, "MULTI_WALLET_ENABLED", True))


def kind_for(segment: str | None) -> str:
    """Lenient resolver (read-only paths) — defaults an unknown segment to the
    NSE_BSE equity bucket, matching `wallet_kinds.wallet_kind_for_segment`."""
    return wallet_kinds.wallet_kind_for_segment(segment)


def _kind_for_trade(segment: str | None, op: str) -> str:
    """PERMANENT SAFETY GUARD — resolve the wallet kind for a MONEY op.

    A trade's margin / P&L may ONLY ever touch its OWN segment wallet. The
    lenient `kind_for` silently defaults a missing/blank segment to NSE_BSE,
    which is exactly how a MCX/CRYPTO/FOREX trade could, by mistake, debit the
    NSE wallet. So for anything that MOVES money we refuse a segment we can't
    unambiguously place, instead of guessing. This can never regress: if a
    call site ever loses the segment, the op raises loudly rather than cutting
    the wrong wallet.
    """
    if segment is None or not str(segment).strip():
        logger.critical("wallet_router_no_segment op=%s — refusing to prevent cross-wallet debit", op)
        raise ValueError(
            f"wallet_router.{op}: trade money op arrived without a segment — refusing "
            "(defaulting would risk debiting the wrong wallet)"
        )
    kind = wallet_kinds.wallet_kind_for_segment(segment)
    if kind not in wallet_kinds.SEGMENT_KINDS:
        logger.critical("wallet_router_non_trading_kind op=%s segment=%s kind=%s", op, segment, kind)
        raise ValueError(
            f"wallet_router.{op}: segment {segment!r} resolved to non-trading wallet {kind!r}"
        )
    return kind


async def get(user_id: str | PydanticObjectId, segment: str | None) -> Any:
    if enabled():
        return await segment_wallet_service.get_or_create(user_id, kind_for(segment))
    return await wallet_service.get_or_create(user_id)


async def block_margin(user_id: str | PydanticObjectId, segment: str | None, amount: Decimal | float) -> None:
    if enabled():
        return await segment_wallet_service.block_margin(user_id, _kind_for_trade(segment, "block_margin"), amount)
    return await wallet_service.block_margin(user_id, amount)


async def release_margin(user_id: str | PydanticObjectId, segment: str | None, amount: Decimal | float) -> None:
    if enabled():
        return await segment_wallet_service.release_margin(user_id, _kind_for_trade(segment, "release_margin"), amount)
    return await wallet_service.release_margin(user_id, amount)


async def adjust(user_id: str | PydanticObjectId, segment: str | None, amount, **kwargs) -> Any:
    if enabled():
        return await segment_wallet_service.adjust(user_id, _kind_for_trade(segment, "adjust"), amount, **kwargs)
    return await wallet_service.adjust(user_id, amount, **kwargs)


async def force_debit(user_id: str | PydanticObjectId, segment: str | None, amount, **kwargs) -> Any:
    """Debit a positive magnitude; floors at 0 with overflow → settlement
    (never raises), same contract as wallet_service.force_debit."""
    if enabled():
        # Segment adjust with a trading txn type floors + books settlement,
        # which is exactly force_debit semantics.
        return await segment_wallet_service.adjust(
            user_id, _kind_for_trade(segment, "force_debit"), -abs(to_decimal(amount)), **kwargs
        )
    return await wallet_service.force_debit(user_id, amount, **kwargs)
