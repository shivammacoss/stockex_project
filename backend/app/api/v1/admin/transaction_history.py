"""Super-admin unified transaction history.

One feed that merges TRADING money (WalletTransaction) with EACH game's money
(GamesWalletLedger), filterable by source (all / trading / a specific game) and
by admin (super-admin can drill into any admin's pool). Scoped to the caller's
pool for a regular admin. Powers the responsive Transaction History page.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, Query

from app.core.dependencies import CurrentAdmin, require_perm, scoped_user_ids
from app.models.games.wallet import GamesLedgerEntryType, GamesWalletLedger
from app.models.transaction import WalletTransaction
from app.models.user import User, UserRole
from app.schemas.common import APIResponse
from app.utils.decimal_utils import to_decimal

router = APIRouter(prefix="/transaction-history", tags=["admin-transaction-history"])

# The 7 games (GameSettings keys) — each is its own selectable "source".
GAME_KEYS = [
    "niftyUpDown", "btcUpDown", "niftyNumber", "btcNumber",
    "niftyBracket", "niftyJackpot", "btcJackpot",
]
GAME_LABELS = {
    "niftyUpDown": "Nifty Up/Down", "btcUpDown": "BTC Up/Down",
    "niftyNumber": "Nifty Number", "btcNumber": "BTC Number",
    "niftyBracket": "Nifty Bracket", "niftyJackpot": "Nifty Jackpot",
    "btcJackpot": "BTC Jackpot",
}


def _role(u) -> str:
    return str(getattr(getattr(u, "role", None), "value", None) or "")


async def _scope_ids(admin: User, admin_id: str | None) -> list[PydanticObjectId]:
    """The user_ids the caller may see. A super-admin can target ONE admin's
    pool via admin_id; otherwise the caller's own pool."""
    if admin_id and _role(admin) == "SUPER_ADMIN":
        try:
            target = await User.get(PydanticObjectId(admin_id))
        except Exception:
            target = None
        if target is not None:
            return await scoped_user_ids(target, include_closed=True)
    return await scoped_user_ids(admin, include_closed=True)


async def _admin_options(admin: User) -> list[dict[str, str]]:
    """Admin dropdown (super-admin only) — every ADMIN so the SA can filter the
    feed to a single admin's pool."""
    if _role(admin) != "SUPER_ADMIN":
        return []
    rows = await User.find(User.role == UserRole.ADMIN).sort("full_name").to_list()
    return [{"id": str(a.id), "label": a.full_name or a.user_code or "admin"} for a in rows]


@router.get("", response_model=APIResponse[dict])
async def transaction_history(
    admin: CurrentAdmin,
    source: str = Query("all", description="all | trading | <game_key>"),
    admin_id: str | None = Query(None),
    limit: int = Query(400, ge=1, le=2000),
    _: None = Depends(require_perm("ledger", "read")),
):
    ids = await _scope_ids(admin, admin_id)
    meta = {
        "admins": await _admin_options(admin),
        "games": [{"key": k, "label": GAME_LABELS[k]} for k in GAME_KEYS],
        "is_super": _role(admin) == "SUPER_ADMIN",
    }
    if not ids:
        return APIResponse(data={"rows": [], **meta})

    rows: list[dict[str, Any]] = []

    # ── Trading money (WalletTransaction — signed amount) ──────────────
    if source in ("all", "trading"):
        txns = (
            await WalletTransaction.find({"user_id": {"$in": ids}})
            .sort("-created_at")
            .limit(limit)
            .to_list()
        )
        for t in txns:
            amt = to_decimal(t.amount)
            rows.append(
                {
                    "id": f"t_{t.id}",
                    "date": t.created_at,
                    "source": "trading",
                    "source_label": "Trading",
                    "category": t.transaction_type.value,
                    "amount": float(amt),  # signed
                    "balance_after": float(to_decimal(t.balance_after)),
                    "description": t.narration or "",
                    "_uid": str(t.user_id),
                }
            )

    # ── Games money (GamesWalletLedger — magnitude + direction) ─────────
    if source == "all" or source in GAME_KEYS:
        gq: dict[str, Any] = {"owner_id": {"$in": ids}}
        gq["game_key"] = source if source in GAME_KEYS else {"$in": GAME_KEYS}
        gls = (
            await GamesWalletLedger.find(gq).sort("-created_at").limit(limit).to_list()
        )
        for g in gls:
            mag = to_decimal(g.amount)
            signed = mag if g.entry_type == GamesLedgerEntryType.CREDIT else -mag
            gk = g.game_key or "games"
            kind = (g.meta or {}).get("kind") or g.entry_type.value
            rows.append(
                {
                    "id": f"g_{g.id}",
                    "date": g.created_at,
                    "source": gk,
                    "source_label": GAME_LABELS.get(gk, gk),
                    "category": str(kind),
                    "amount": float(signed),
                    "balance_after": float(to_decimal(g.balance_after)),
                    "description": g.description or "",
                    "_uid": str(g.owner_id),
                }
            )

    # newest first, then cap.
    rows.sort(key=lambda r: r["date"] or datetime.min, reverse=True)
    rows = rows[:limit]

    # ── Enrich with user + owning-admin names (batch) ──────────────────
    uid_objs = list({PydanticObjectId(r["_uid"]) for r in rows})
    users = {str(u.id): u for u in await User.find({"_id": {"$in": uid_objs}}).to_list()}
    admin_ids = list(
        {u.assigned_admin_id for u in users.values() if u.assigned_admin_id is not None}
    )
    admins = {str(a.id): a for a in await User.find({"_id": {"$in": admin_ids}}).to_list()}
    for r in rows:
        u = users.get(r.pop("_uid"))
        r["user_code"] = u.user_code if u else "—"
        r["user_name"] = (u.full_name if u else "") or ""
        oa = admins.get(str(u.assigned_admin_id)) if (u and u.assigned_admin_id) else None
        r["admin_name"] = (oa.full_name or oa.user_code) if oa else ("—" if not u else "Platform")
        r["date"] = r["date"].isoformat() if r["date"] else None

    return APIResponse(data={"rows": rows, **meta})
