"""Admin (SUPER_ADMIN only) — Game settings config + games→main approvals."""

from __future__ import annotations

from typing import Any

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException

from app.core.dependencies import SuperAdmin
from app.models.games.settings import GAME_KEYS, GameConfig, GameSettings
from app.models.games.transfer import GamesWithdrawalRequest, GamesWithdrawalStatus
from app.schemas.common import APIResponse
from app.services.games import ids, wallet_service

router = APIRouter(prefix="/games", tags=["admin-games"])

# Global scalar fields an admin may set via PUT /games/settings.
_GLOBAL_FIELDS = {
    "games_enabled", "maintenance_mode", "maintenance_message", "token_value",
    "platform_commission", "global_min_tickets", "global_max_tickets",
    "daily_bet_limit", "daily_win_limit", "game_position_expiry_grace_seconds",
}


def _serialize(s: GameSettings) -> dict[str, Any]:
    return s.model_dump(mode="json", exclude={"id", "revision_id"})


@router.get("/settings", response_model=APIResponse[dict])
async def get_settings(_: SuperAdmin):
    s = await GameSettings.load_singleton()
    return APIResponse(data=_serialize(s))


@router.get("/settings/live-details", response_model=APIResponse[dict])
async def live_details(_: SuperAdmin):
    from app.services.games import price_resolver

    s = await GameSettings.load_singleton()
    nifty = await price_resolver.nifty_ltp()
    btc = await price_resolver.btc_ltp()
    return APIResponse(
        data={
            "settings": _serialize(s),
            "live": {"nifty": str(nifty) if nifty else None, "btc": str(btc) if btc else None},
        }
    )


@router.put("/settings", response_model=APIResponse[dict])
async def update_settings(payload: dict, _: SuperAdmin):
    s = await GameSettings.load_singleton()
    for k, v in payload.items():
        if k in _GLOBAL_FIELDS:
            setattr(s, k, v)
        elif k == "profit_distribution" and isinstance(v, dict):
            s.profit_distribution = s.profit_distribution.model_copy(update=v)
    await s.save()
    return APIResponse(data=_serialize(s), message="Settings updated")


@router.put("/settings/game/{game_id}", response_model=APIResponse[dict])
async def update_game(game_id: str, payload: dict, _: SuperAdmin):
    key = ids.settings_key(game_id)
    if key is None or key not in GAME_KEYS:
        raise HTTPException(status_code=404, detail="Unknown game")
    s = await GameSettings.load_singleton()
    current = s.games.get(key) or GameConfig()
    merged = current.model_copy(update={k: v for k, v in payload.items() if k in GameConfig.model_fields})
    s.games[key] = merged
    await s.save()
    return APIResponse(data=merged.model_dump(mode="json"), message="Game updated")


@router.patch("/settings/game/{game_id}/toggle", response_model=APIResponse[dict])
async def toggle_game(game_id: str, payload: dict, _: SuperAdmin):
    key = ids.settings_key(game_id)
    if key is None or key not in GAME_KEYS:
        raise HTTPException(status_code=404, detail="Unknown game")
    s = await GameSettings.load_singleton()
    cfg = s.games.get(key) or GameConfig()
    cfg.enabled = bool(payload.get("enabled", not cfg.enabled))
    s.games[key] = cfg
    await s.save()
    return APIResponse(data={"game": key, "enabled": cfg.enabled})


@router.patch("/settings/toggle-all", response_model=APIResponse[dict])
async def toggle_all(payload: dict, _: SuperAdmin):
    s = await GameSettings.load_singleton()
    enabled = bool(payload.get("enabled", True))
    s.games_enabled = enabled
    await s.save()
    return APIResponse(data={"games_enabled": enabled})


@router.patch("/settings/maintenance", response_model=APIResponse[dict])
async def set_maintenance(payload: dict, _: SuperAdmin):
    s = await GameSettings.load_singleton()
    s.maintenance_mode = bool(payload.get("maintenance_mode", True))
    if payload.get("maintenance_message"):
        s.maintenance_message = str(payload["maintenance_message"])
    await s.save()
    return APIResponse(data={"maintenance_mode": s.maintenance_mode})


# ── Games → main withdrawal approvals ────────────────────────────────
@router.get("/withdrawals", response_model=APIResponse[list])
async def list_withdrawals(_: SuperAdmin, status: str = "PENDING"):
    q = {}
    if status:
        q["status"] = status
    rows = await GamesWithdrawalRequest.find(q).sort("-created_at").limit(200).to_list()
    return APIResponse(
        data=[
            {
                "id": str(r.id),
                "user_id": str(r.user_id),
                "amount": str(r.amount),
                "status": r.status.value,
                "user_remark": r.user_remark,
                "admin_remark": r.admin_remark,
                "created_at": r.created_at,
                "processed_at": r.processed_at,
            }
            for r in rows
        ]
    )


@router.post("/withdrawals/{request_id}/approve", response_model=APIResponse[dict])
async def approve_withdrawal(request_id: str, admin: SuperAdmin, payload: dict | None = None):
    res = await wallet_service.approve_games_withdrawal(
        PydanticObjectId(request_id), admin.id, (payload or {}).get("admin_remark")
    )
    return APIResponse(data=res, message="Approved")


@router.post("/withdrawals/{request_id}/reject", response_model=APIResponse[dict])
async def reject_withdrawal(request_id: str, admin: SuperAdmin, payload: dict | None = None):
    res = await wallet_service.reject_games_withdrawal(
        PydanticObjectId(request_id), admin.id, (payload or {}).get("reason")
    )
    return APIResponse(data=res, message="Rejected")


# ── Hierarchy commission (temporary wallet) — view + release ─────────
@router.get("/hierarchy-earnings", response_model=APIResponse[list])
async def hierarchy_earnings(_: SuperAdmin):
    """Admins/brokers with held games commission (temporary wallet > 0)."""
    from app.models.user import User
    from app.models.wallet import Wallet

    wallets = await Wallet.find(
        {"$expr": {"$gt": [{"$toDecimal": "$temporary_balance"}, 0]}}
    ).to_list()
    out = []
    for w in wallets:
        u = await User.get(w.user_id)
        if u is None:
            continue
        out.append({
            "user_id": str(w.user_id),
            "user_code": u.user_code,
            "full_name": u.full_name,
            "role": u.role.value if hasattr(u.role, "value") else str(u.role),
            "temporary_balance": str(w.temporary_balance),
            "temporary_total_earned": str(w.temporary_total_earned),
            "temporary_total_released": str(w.temporary_total_released),
        })
    return APIResponse(data=out)


@router.post("/hierarchy-earnings/{user_id}/release", response_model=APIResponse[dict])
async def release_hierarchy_earnings(user_id: str, admin: SuperAdmin, payload: dict):
    amount = payload.get("amount")
    res = await wallet_service.release_temp_to_main(
        PydanticObjectId(user_id), amount, actor_id=admin.id
    )
    return APIResponse(data=res, message="Released to main wallet")
