"""Per-segment trading wallet money service (multi-wallet — wallet.md).

Mirrors `wallet_service` primitives (atomic, version/`$expr`-guarded) but keyed
by (user_id, kind) on `SegmentWallet`. MAIN is the existing `Wallet` (handled
via `wallet_service`); this module handles NSE_BSE / MCX / CRYPTO / FOREX.

Golden rule: only free balance (`available_balance − used_margin`) can transfer;
locked margin stays put. Never let a wallet go negative.
"""

from __future__ import annotations

import asyncio
import logging
from decimal import Decimal
from typing import Any

from beanie import PydanticObjectId
from bson import Decimal128
from pymongo import ReturnDocument

from app.core.exceptions import InsufficientFundsError
from app.core.redis_client import publish
from app.models.segment_wallet import SegmentWallet
from app.models.transaction import TransactionStatus, TransactionType, WalletTransaction
from app.models.wallet import Wallet
from app.services import wallet_kinds, wallet_service
from app.utils.decimal_utils import ZERO, add, quantize_money, sub, to_decimal, to_decimal128
from app.utils.time_utils import now_utc

logger = logging.getLogger(__name__)


async def get_or_create(user_id: str | PydanticObjectId, kind: str) -> SegmentWallet:
    uid = PydanticObjectId(str(user_id))
    w = await SegmentWallet.find_one(SegmentWallet.user_id == uid, SegmentWallet.kind == kind)
    if w is None:
        w = SegmentWallet(user_id=uid, kind=kind)
        try:
            await w.insert()
        except Exception:
            w = await SegmentWallet.find_one(SegmentWallet.user_id == uid, SegmentWallet.kind == kind)
            if w is None:
                raise
    return w


async def _publish(user_id, kind: str, *, reason: str, amount: Decimal, balance_after: Decimal) -> None:
    try:
        await publish(
            f"user:{user_id}:wallet",
            {"type": "wallet", "payload": {"reason": reason, "wallet_kind": kind,
                                            "amount": str(amount), "balance_after": str(balance_after)}},
        )
    except Exception:
        logger.debug("segment_wallet_publish_failed user=%s kind=%s", user_id, kind, exc_info=True)


# ── Margin (no ledger — internal lock, mirrors wallet_service.block_margin) ──
async def block_margin(user_id: str | PydanticObjectId, kind: str, amount: Decimal | float) -> None:
    amt = quantize_money(to_decimal(amount))
    if amt <= ZERO:
        return
    await get_or_create(user_id, kind)
    uid = PydanticObjectId(str(user_id))
    amt128 = to_decimal128(amt)
    neg128 = to_decimal128(ZERO - amt)
    zero128 = Decimal128("0")
    updated = await SegmentWallet.get_motor_collection().find_one_and_update(
        {
            "user_id": uid, "kind": kind,
            "$expr": {"$gte": [
                {"$add": [{"$ifNull": ["$available_balance", zero128]}, {"$ifNull": ["$credit_limit", zero128]}]},
                amt128,
            ]},
        },
        {"$inc": {"available_balance": neg128, "used_margin": amt128, "version": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        w = await get_or_create(user_id, kind)
        raise InsufficientFundsError(
            f"Insufficient {wallet_kinds.LABELS.get(kind, kind)} margin: have ₹{w.available_balance} "
            f"(+credit ₹{w.credit_limit}), need ₹{amt}"
        )


async def release_margin(user_id: str | PydanticObjectId, kind: str, amount: Decimal | float) -> None:
    amt = quantize_money(to_decimal(amount))
    if amt <= ZERO:
        return
    coll = SegmentWallet.get_motor_collection()
    for _ in range(8):
        w = await get_or_create(user_id, kind)
        actual = min(amt, to_decimal(w.used_margin))
        if actual <= ZERO:
            return
        res = await coll.update_one(
            {"_id": w.id, "version": w.version},
            {"$set": {
                "used_margin": to_decimal128(sub(w.used_margin, actual)),
                "available_balance": to_decimal128(add(w.available_balance, actual)),
            }, "$inc": {"version": 1}},
        )
        if res.modified_count == 1:
            return
    logger.error("segment_release_margin_contended user=%s kind=%s", user_id, kind)


# ── Signed balance adjust (writes a WalletTransaction tagged with kind) ──
async def adjust(
    user_id: str | PydanticObjectId, kind: str, amount: Decimal | float | int | str, *,
    transaction_type: TransactionType, narration: str,
    reference_type: str | None = None, reference_id: str | None = None,
    actor_id: str | PydanticObjectId | None = None, allow_negative: bool = False,
) -> WalletTransaction:
    amt = quantize_money(to_decimal(amount))
    coll = SegmentWallet.get_motor_collection()
    before = after = ZERO
    for _attempt in range(12):
        w = await get_or_create(user_id, kind)
        before = to_decimal(w.available_balance)
        after = add(before, amt)
        if after < ZERO and not allow_negative:
            # Debit available all the way down to 0; the shortfall that the
            # wallet can't cover overflows to settlement_outstanding (mirrors
            # the main wallet). `available` is always floored ≥ 0, so `before`
            # is the amount actually absorbed and `-after` (after is negative
            # here) is exactly the uncovered remainder.
            #
            # BUG (fixed 2026-07-02): the old `after = max(before, 0)` left
            # available UNCHANGED when before > 0 — so a stop-out loss bigger
            # than the balance booked the overflow to settlement but never
            # actually cut the wallet. It must go to 0.
            booked = -after  # uncovered remainder → settlement
            after = ZERO
            set_fields: dict[str, Any] = {
                "available_balance": to_decimal128(after),
                "settlement_outstanding": to_decimal128(add(to_decimal(w.settlement_outstanding), booked)),
                "version": (w.version or 0) + 1,
            }
        else:
            set_fields = {"available_balance": to_decimal128(after), "version": (w.version or 0) + 1}
        if transaction_type == TransactionType.PNL:
            set_fields["realized_pnl"] = to_decimal128(add(w.realized_pnl, amt))
        updated = await coll.find_one_and_update(
            {"_id": w.id, "version": w.version}, {"$set": set_fields},
            return_document=ReturnDocument.AFTER,
        )
        if updated is not None:
            after = to_decimal(updated.get("available_balance"))
            break
        await asyncio.sleep(0.015 * (_attempt + 1))
    else:
        raise RuntimeError("segment adjust: too much contention")

    txn = WalletTransaction(
        user_id=PydanticObjectId(str(user_id)), transaction_type=transaction_type,
        amount=Decimal128(str(after - before)), balance_before=Decimal128(str(before)),
        balance_after=Decimal128(str(after)), reference_type=reference_type or f"WALLET:{kind}",
        reference_id=reference_id, narration=narration, status=TransactionStatus.COMPLETED,
        created_by=PydanticObjectId(str(actor_id)) if actor_id else None,
    )
    await txn.insert()
    asyncio.create_task(_publish(user_id, kind, reason=transaction_type.value, amount=amt, balance_after=after))
    return txn


# ── Read helpers ──────────────────────────────────────────────────────
async def summary(user_id: str | PydanticObjectId, kind: str) -> dict[str, Any]:
    w = await get_or_create(user_id, kind)
    avail = to_decimal(w.available_balance)
    used = to_decimal(w.used_margin)
    bal = add(avail, used)
    return {
        "kind": kind, "label": wallet_kinds.LABELS.get(kind, kind),
        "available_balance": str(avail), "used_margin": str(used),
        "balance": str(bal), "equity": str(add(bal, to_decimal(w.unrealized_pnl))),
        "credit_limit": str(w.credit_limit), "profit_blocked": w.profit_blocked,
        "settlement_outstanding": str(w.settlement_outstanding),
    }


async def list_all(user_id: str | PydanticObjectId) -> list[dict[str, Any]]:
    """MAIN (from main Wallet) + the 4 segment wallets."""
    out: list[dict[str, Any]] = []
    mw = await wallet_service.get_or_create(user_id)
    out.append({
        "kind": wallet_kinds.MAIN, "label": "Main",
        "available_balance": str(mw.available_balance), "used_margin": "0",
        "balance": str(mw.available_balance), "equity": str(mw.available_balance),
        "credit_limit": str(mw.credit_limit), "profit_blocked": False,
        "settlement_outstanding": str(mw.settlement_outstanding),
    })
    for kind in wallet_kinds.SEGMENT_KINDS:
        out.append(await summary(user_id, kind))
    return out


# ── Transfers (Main ↔ segment, segment ↔ segment) ──────────────────────
async def _transferable(user_id, kind: str) -> Decimal:
    if kind == wallet_kinds.MAIN:
        mw = await wallet_service.get_or_create(user_id)
        return to_decimal(mw.available_balance)
    w = await get_or_create(user_id, kind)
    return sub(to_decimal(w.available_balance), to_decimal(w.used_margin))


async def transfer(
    user_id: str | PydanticObjectId, from_kind: str, to_kind: str, amount: Decimal | float | int | str,
) -> dict[str, Any]:
    amt = quantize_money(to_decimal(amount))
    if amt <= ZERO:
        raise ValueError("amount must be positive")
    if from_kind == to_kind:
        raise ValueError("source and target must differ")
    if not (wallet_kinds.is_valid_kind(from_kind) and wallet_kinds.is_valid_kind(to_kind)):
        raise ValueError("invalid wallet")

    if await _transferable(user_id, from_kind) < amt:
        raise InsufficientFundsError(
            f"Only free balance can transfer from {wallet_kinds.LABELS.get(from_kind, from_kind)}"
        )

    ref = f"{from_kind}->{to_kind}"
    # Debit source.
    if from_kind == wallet_kinds.MAIN:
        await wallet_service.adjust(user_id, -amt, transaction_type=TransactionType.WALLET_TRANSFER,
                                    narration=f"Transfer to {wallet_kinds.LABELS.get(to_kind, to_kind)} wallet",
                                    reference_type="WALLET_TRANSFER", reference_id=ref)
    else:
        await adjust(user_id, from_kind, -amt, transaction_type=TransactionType.WALLET_TRANSFER,
                     narration=f"Transfer to {wallet_kinds.LABELS.get(to_kind, to_kind)} wallet",
                     reference_id=ref)
    # Credit target (revert source on failure).
    try:
        if to_kind == wallet_kinds.MAIN:
            await wallet_service.adjust(user_id, amt, transaction_type=TransactionType.WALLET_TRANSFER,
                                        narration=f"Transfer from {wallet_kinds.LABELS.get(from_kind, from_kind)} wallet",
                                        reference_type="WALLET_TRANSFER", reference_id=ref)
        else:
            await adjust(user_id, to_kind, amt, transaction_type=TransactionType.WALLET_TRANSFER,
                         narration=f"Transfer from {wallet_kinds.LABELS.get(from_kind, from_kind)} wallet",
                         reference_id=ref, allow_negative=True)
    except Exception:
        if from_kind == wallet_kinds.MAIN:
            await wallet_service.adjust(user_id, amt, transaction_type=TransactionType.WALLET_TRANSFER,
                                        narration="Reverted failed transfer", reference_type="WALLET_TRANSFER")
        else:
            await adjust(user_id, from_kind, amt, transaction_type=TransactionType.WALLET_TRANSFER,
                         narration="Reverted failed transfer", allow_negative=True)
        raise
    return {"from": from_kind, "to": to_kind, "amount": str(amt)}
