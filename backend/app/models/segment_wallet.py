"""Per-segment trading wallet (multi-wallet system — wallet.md).

One row per (user_id, kind) for the trading segment wallets (NSE_BSE / MCX /
CRYPTO / FOREX). The MAIN cash wallet stays the existing `Wallet` doc; GAMES
stays `games_wallets`. Additive — nothing existing is modified.

Mirrors the trading `Wallet` money fields + a `version` optimistic lock so the
same race-safe `find_one_and_update` discipline applies, plus per-wallet risk
state (independent stop-out / ledger-autosquare / profit-block per wallet.md).
"""

from __future__ import annotations

from beanie import Indexed, PydanticObjectId
from bson import Decimal128
from pydantic import Field
from pymongo import ASCENDING, IndexModel

from app.models._base import TimestampMixin
from app.models._types import Money


def _zero() -> Decimal128:
    return Decimal128("0")


class SegmentWallet(TimestampMixin):
    user_id: PydanticObjectId
    kind: str  # NSE_BSE | MCX | CRYPTO | FOREX

    available_balance: Money = Field(default_factory=_zero)
    used_margin: Money = Field(default_factory=_zero)
    realized_pnl: Money = Field(default_factory=_zero)
    unrealized_pnl: Money = Field(default_factory=_zero)
    credit_limit: Money = Field(default_factory=_zero)
    settlement_outstanding: Money = Field(default_factory=_zero)

    total_deposits: Money = Field(default_factory=_zero)
    total_withdrawals: Money = Field(default_factory=_zero)

    # Per-wallet risk state (independent from other wallets).
    profit_blocked: bool = False
    ledger_reference_balance: Money = Field(default_factory=_zero)
    ledger_autosquare_active: bool = False

    version: int = 0

    class Settings:
        name = "segment_wallets"
        indexes = [
            IndexModel(
                [("user_id", ASCENDING), ("kind", ASCENDING)],
                unique=True,
                name="segment_wallet_user_kind_unique",
            ),
        ]
