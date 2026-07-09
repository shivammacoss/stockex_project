"""Public broker directory for the signup broker-picker + the super-admin
visibility control (which admins' brokers are searchable).

Shared by the PUBLIC user endpoint (`GET /user/auth/brokers`) and the
super-admin settings endpoints, and by the signup / profile-change flows that
must validate a picked broker.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from beanie import PydanticObjectId

from app.models.platform_setting import PlatformSetting, SettingType
from app.models.user import User, UserRole, UserStatus

logger = logging.getLogger(__name__)

# JSON PlatformSetting: list of ADMIN user-ids whose brokers are HIDDEN from
# the signup broker-search. Default [] = every admin's brokers are searchable.
HIDDEN_ADMINS_KEY = "broker_search.hidden_admin_ids"


async def get_hidden_admin_ids() -> list[str]:
    row = await PlatformSetting.find_one(PlatformSetting.setting_key == HIDDEN_ADMINS_KEY)
    if row is None or not isinstance(row.setting_value, list):
        return []
    return [str(x) for x in row.setting_value]


async def set_hidden_admin_ids(ids: list[str]) -> list[str]:
    """Upsert the hidden-admin list (validated, deduped)."""
    clean: list[str] = []
    seen: set[str] = set()
    for x in ids or []:
        s = str(x).strip()
        if not s or s in seen:
            continue
        try:
            PydanticObjectId(s)  # reject junk ids
        except Exception:
            continue
        seen.add(s)
        clean.append(s)

    row = await PlatformSetting.find_one(PlatformSetting.setting_key == HIDDEN_ADMINS_KEY)
    if row is None:
        row = PlatformSetting(
            setting_key=HIDDEN_ADMINS_KEY,
            setting_value=clean,
            setting_type=SettingType.JSON,
            category="general",
            is_public=False,
            description="Admin ids whose brokers are HIDDEN from the signup broker-search.",
        )
        await row.insert()
    else:
        row.setting_value = clean
        await row.save()
    return clean


async def _hidden_set() -> set[PydanticObjectId]:
    out: set[PydanticObjectId] = set()
    for x in await get_hidden_admin_ids():
        try:
            out.add(PydanticObjectId(x))
        except Exception:
            continue
    return out


async def search_brokers(q: str | None = None, limit: int = 30) -> list[dict[str, Any]]:
    """Active brokers + sub-brokers across all admins (minus hidden admins),
    matched by city / full_name / user_code. Platform-pool brokers (no owning
    admin) are always shown."""
    hidden = await _hidden_set()
    query: dict[str, Any] = {
        "role": UserRole.BROKER.value,
        "status": UserStatus.ACTIVE.value,
    }
    needle = (q or "").strip()
    if needle:
        rx = re.compile(re.escape(needle), re.IGNORECASE)
        query["$or"] = [{"city": rx}, {"full_name": rx}, {"user_code": rx}]

    rows = await User.find(query).limit(200).to_list()
    rows = [r for r in rows if not (r.assigned_admin_id and r.assigned_admin_id in hidden)]
    rows.sort(key=lambda r: ((r.city or "￿").lower(), (r.full_name or "").lower()))
    rows = rows[:limit]

    admin_ids = {r.assigned_admin_id for r in rows if r.assigned_admin_id}
    admins: dict[str, str] = {}
    if admin_ids:
        for a in await User.find({"_id": {"$in": list(admin_ids)}}).to_list():
            admins[str(a.id)] = a.full_name or a.user_code

    return [
        {
            "id": str(r.id),
            "user_code": r.user_code,
            "full_name": r.full_name,
            "city": r.city,
            "admin_name": admins.get(str(r.assigned_admin_id)) if r.assigned_admin_id else "Platform",
        }
        for r in rows
    ]


async def resolve_active_visible_broker(broker_id: str) -> User | None:
    """Return the active, non-hidden BROKER for `broker_id`, else None.
    Used by signup + profile-change to validate the picked broker."""
    try:
        b = await User.get(PydanticObjectId(str(broker_id)))
    except Exception:
        return None
    if b is None or b.role != UserRole.BROKER or b.status != UserStatus.ACTIVE:
        return None
    hidden = await _hidden_set()
    if b.assigned_admin_id and b.assigned_admin_id in hidden:
        return None
    return b
