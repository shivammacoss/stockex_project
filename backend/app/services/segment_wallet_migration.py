"""One-shot migration to the multi-wallet model (wallet.md).

Runs once on boot (leader-only) when `MULTI_WALLET_ENABLED` is on. For every
existing user it:
  • sums each OPEN position's margin_used by wallet kind → segment used_margin,
  • moves the Main wallet's free cash + credit into the NSE_BSE segment wallet,
  • zeroes the Main wallet's trading fields (Main becomes cash-only).

Total wealth per user is preserved: Σ(segment available+used) == old Main
(available + used). Idempotent via a PlatformSetting marker, so it never runs
twice (which would wrongly re-zero Main after a user funds it).
"""

from __future__ import annotations

import logging
from collections import defaultdict
from decimal import Decimal

from app.core.config import settings
from app.utils.decimal_utils import ZERO, to_decimal, to_decimal128

logger = logging.getLogger(__name__)

_MARKER = "multiwallet.migrated_v1"


async def migrate_to_segment_wallets() -> dict[str, int]:
    if not getattr(settings, "MULTI_WALLET_ENABLED", False):
        return {"skipped": 1}

    from app.models.platform_setting import PlatformSetting
    from app.models.position import Position, PositionStatus
    from app.models.wallet import Wallet
    from app.services import segment_wallet_service, wallet_kinds

    marker = await PlatformSetting.find_one(PlatformSetting.setting_key == _MARKER)
    if marker is not None and bool(marker.setting_value):
        return {"already": 1}

    wallets = await Wallet.find_all().to_list()
    migrated = 0
    for w in wallets:
        try:
            uid = w.user_id
            # Per-kind open-position margin.
            used_by_kind: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
            positions = await Position.find(
                Position.user_id == uid, Position.status == PositionStatus.OPEN
            ).to_list()
            for p in positions:
                seg = getattr(p, "segment_type", None)
                kind = wallet_kinds.wallet_kind_for_segment(seg)
                used_by_kind[kind] = used_by_kind[kind] + to_decimal(p.margin_used)

            avail = to_decimal(w.available_balance)
            credit = to_decimal(w.credit_limit)

            for kind in wallet_kinds.SEGMENT_KINDS:
                sw = await segment_wallet_service.get_or_create(uid, kind)
                sw.used_margin = to_decimal128(used_by_kind.get(kind, ZERO))
                if kind == wallet_kinds.NSE_BSE:
                    # All free cash + credit lands in the default trading wallet.
                    sw.available_balance = to_decimal128(avail)
                    sw.credit_limit = to_decimal128(credit)
                sw.version = (sw.version or 0) + 1
                await sw.save()

            # Main becomes cash-only: zero trading fields (keep settlement info).
            w.available_balance = to_decimal128(ZERO)
            w.used_margin = to_decimal128(ZERO)
            w.credit_limit = to_decimal128(ZERO)
            w.version = (w.version or 0) + 1
            await w.save()
            migrated += 1
        except Exception:  # noqa: BLE001 — one user must not abort the batch
            logger.exception("multiwallet_migration_user_failed user=%s", getattr(w, "user_id", "?"))

    # Stamp the marker so this never runs again.
    try:
        if marker is None:
            marker = PlatformSetting(
                setting_key=_MARKER, setting_value=True,
                description="Multi-wallet migration completed", category="general",
            )
            await marker.insert()
        else:
            marker.setting_value = True
            await marker.save()
    except Exception:
        logger.exception("multiwallet_migration_marker_failed")

    logger.info("multiwallet_migration_done migrated=%d", migrated)
    return {"migrated": migrated}
