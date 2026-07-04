"""Games wallet + games ledger.

`GamesWallet` is a SEPARATE collection (1:1 per user), deliberately NOT
embedded on the User doc — User is on every hot auth/order/risk path and uses
state-management, so high-write game money is isolated here. It mirrors the
trading `Wallet`'s `version` optimistic-lock field so the games wallet service
can reuse the same version-guarded `find_one_and_update` discipline.

`GamesWalletLedger` is a dedicated ledger (kept out of the trading
`wallet_transactions` collection so the trading ledger + P&L aggregates stay
byte-identical). Every games money movement appends one immutable row.
"""

from __future__ import annotations

from beanie import Indexed, PydanticObjectId
from bson import Decimal128
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel

from app.models._base import StrEnum, TimestampMixin
from app.models._types import Money


def _zero() -> Decimal128:
    return Decimal128("0")


class GamesWallet(TimestampMixin):
    user_id: Indexed(PydanticObjectId, unique=True)  # type: ignore[valid-type]

    balance: Money = Field(default_factory=_zero)
    # Reserved for spec fidelity (stake locked in open/pending bets). v1 debits
    # the stake straight off `balance` at placement, so this stays 0.
    used_margin: Money = Field(default_factory=_zero)
    realized_pnl: Money = Field(default_factory=_zero)
    today_realized_pnl: Money = Field(default_factory=_zero)
    # Risk lever — when True, wins are NOT credited (audited zero-row written).
    profit_blocked: bool = False

    # Optimistic-locking version. Increment on each financial mutation.
    version: int = 0

    class Settings:
        name = "games_wallets"
        indexes = [IndexModel([("user_id", ASCENDING)], unique=True)]


class GamesLedgerEntryType(StrEnum):
    CREDIT = "CREDIT"
    DEBIT = "DEBIT"


class GamesWalletLedger(TimestampMixin):
    """Immutable per-move ledger for the games wallet. `amount` is a POSITIVE
    magnitude; the direction is carried by `entry_type`."""

    owner_type: str = "USER"
    owner_id: PydanticObjectId
    entry_type: GamesLedgerEntryType
    amount: Money = Field(default_factory=_zero)
    balance_after: Money = Field(default_factory=_zero)
    game_key: str | None = None  # GameSettings key, e.g. "niftyUpDown"
    description: str = ""
    meta: dict = Field(default_factory=dict)

    class Settings:
        name = "games_wallet_ledger"
        indexes = [
            IndexModel([("owner_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel(
                [("owner_id", ASCENDING), ("game_key", ASCENDING), ("created_at", DESCENDING)]
            ),
            IndexModel([("created_at", DESCENDING)]),
        ]
