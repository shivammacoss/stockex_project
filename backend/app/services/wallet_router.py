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

from decimal import Decimal
from typing import Any

from beanie import PydanticObjectId

from app.core.config import settings
from app.services import segment_wallet_service, wallet_kinds, wallet_service
from app.utils.decimal_utils import to_decimal


def enabled() -> bool:
    return bool(getattr(settings, "MULTI_WALLET_ENABLED", True))


def kind_for(segment: str | None) -> str:
    return wallet_kinds.wallet_kind_for_segment(segment)


async def get(user_id: str | PydanticObjectId, segment: str | None) -> Any:
    if enabled():
        return await segment_wallet_service.get_or_create(user_id, kind_for(segment))
    return await wallet_service.get_or_create(user_id)


async def block_margin(user_id: str | PydanticObjectId, segment: str | None, amount: Decimal | float) -> None:
    if enabled():
        return await segment_wallet_service.block_margin(user_id, kind_for(segment), amount)
    return await wallet_service.block_margin(user_id, amount)


async def release_margin(user_id: str | PydanticObjectId, segment: str | None, amount: Decimal | float) -> None:
    if enabled():
        return await segment_wallet_service.release_margin(user_id, kind_for(segment), amount)
    return await wallet_service.release_margin(user_id, amount)


async def adjust(user_id: str | PydanticObjectId, segment: str | None, amount, **kwargs) -> Any:
    if enabled():
        return await segment_wallet_service.adjust(user_id, kind_for(segment), amount, **kwargs)
    return await wallet_service.adjust(user_id, amount, **kwargs)


async def force_debit(user_id: str | PydanticObjectId, segment: str | None, amount, **kwargs) -> Any:
    """Debit a positive magnitude; floors at 0 with overflow → settlement
    (never raises), same contract as wallet_service.force_debit."""
    if enabled():
        # Segment adjust with a trading txn type floors + books settlement,
        # which is exactly force_debit semantics.
        return await segment_wallet_service.adjust(
            user_id, kind_for(segment), -abs(to_decimal(amount)), **kwargs
        )
    return await wallet_service.force_debit(user_id, amount, **kwargs)
