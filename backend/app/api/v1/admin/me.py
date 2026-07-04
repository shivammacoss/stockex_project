"""Self-serve money views for the logged-in admin-tier user.

- GET /admin/me/wallet    — the CURRENT admin/broker/sub-broker's OWN wallet:
  main available_balance, held games commission (temporary_balance), how much
  has been released, settlement-outstanding, plus their weekly P&L-share
  settlement history. Read-only (releasing held commission stays SUPER_ADMIN
  only, via /admin/games/hierarchy-earnings).
- GET /admin/me/house-summary — SUPER_ADMIN only: the house pool at a glance
  (games net collected/paid, pending hierarchy releases across everyone, house
  wallet balance, and total user settlement-outstanding).
"""

from __future__ import annotations

from beanie import PydanticObjectId
from bson import Decimal128

from app.core.dependencies import CurrentAdmin, SuperAdmin
from app.models.admin_settlement import AdminSettlement
from app.models.broker_settlement import BrokerSettlement
from app.models.transaction import TransactionType, WalletTransaction
from app.models.user import User, UserRole
from app.models.wallet import Wallet
from app.schemas.common import APIResponse
from app.services import wallet_service
from app.services.games import wallet_service as games_wallet_service
from app.utils.decimal_utils import to_decimal
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/me", tags=["admin-me"])


def _f(v) -> float:
    try:
        return float(to_decimal(v))
    except Exception:
        return 0.0


@router.get("/wallet", response_model=APIResponse[dict])
async def my_wallet(admin: CurrentAdmin):
    """The logged-in admin/broker/sub-broker's own wallet + settlement history."""
    w = await wallet_service.get_or_create(admin.id)

    # Weekly P&L-share settlement history for this role.
    history: list[dict] = []
    if admin.role == UserRole.BROKER:
        rows = (
            await BrokerSettlement.find(BrokerSettlement.broker_id == admin.id)
            .sort("-period_start")
            .limit(26)
            .to_list()
        )
        for r in rows:
            history.append(
                {
                    "period_start": r.period_start,
                    "period_end": r.period_end,
                    "net_house_pnl": _f(r.net_house_pnl_inr),
                    "share": _f(r.broker_share_inr),
                    "status": r.status.value if hasattr(r.status, "value") else str(r.status),
                }
            )
    else:  # ADMIN (and SUPER_ADMIN, who normally has none)
        rows = (
            await AdminSettlement.find(AdminSettlement.sub_admin_id == admin.id)
            .sort("-period_start")
            .limit(26)
            .to_list()
        )
        for r in rows:
            history.append(
                {
                    "period_start": r.period_start,
                    "period_end": r.period_end,
                    "net_house_pnl": _f(r.net_house_pnl_inr),
                    "share": _f(r.sub_admin_share_inr),
                    "status": r.status.value if hasattr(r.status, "value") else str(r.status),
                }
            )

    return APIResponse(
        data={
            "role": admin.role.value,
            "user_code": admin.user_code,
            # Main withdrawable wallet.
            "available_balance": _f(w.available_balance),
            "used_margin": _f(w.used_margin),
            "credit_limit": _f(w.credit_limit),
            "settlement_outstanding": _f(w.settlement_outstanding),
            "total_deposits": _f(w.total_deposits),
            "total_withdrawals": _f(w.total_withdrawals),
            # Held games hierarchy commission (released to main by SUPER_ADMIN).
            "temporary_balance": _f(w.temporary_balance),
            "temporary_total_earned": _f(w.temporary_total_earned),
            "temporary_total_released": _f(w.temporary_total_released),
            # Weekly P&L-share settlements.
            "settlement_history": history,
        }
    )


@router.get("/house-summary", response_model=APIResponse[dict])
async def house_summary(admin: SuperAdmin):
    """SUPER_ADMIN house pool at a glance."""
    house = await wallet_service.get_or_create(admin.id)

    # Games net on the house = signed sum of GAMES_HOUSE_SETTLE on the SA wallet
    # (+ stakes collected, − wins funded). Positive = house up.
    tcoll = WalletTransaction.get_motor_collection()
    games_agg = await tcoll.aggregate(
        [
            {
                "$match": {
                    "user_id": admin.id,
                    "transaction_type": TransactionType.GAMES_HOUSE_SETTLE.value,
                }
            },
            {"$group": {"_id": None, "net": {"$sum": {"$toDecimal": "$amount"}}}},
        ]
    ).to_list(1)
    games_net = _f(games_agg[0]["net"]) if games_agg else 0.0

    # Pending hierarchy releases = total held temporary_balance across everyone,
    # and total user settlement-outstanding across the platform.
    wcoll = Wallet.get_motor_collection()
    wagg = await wcoll.aggregate(
        [
            {
                "$group": {
                    "_id": None,
                    "temp": {"$sum": {"$toDecimal": "$temporary_balance"}},
                    "settle": {"$sum": {"$toDecimal": "$settlement_outstanding"}},
                    "temp_earned": {"$sum": {"$toDecimal": "$temporary_total_earned"}},
                    "temp_released": {"$sum": {"$toDecimal": "$temporary_total_released"}},
                }
            }
        ]
    ).to_list(1)
    row = wagg[0] if wagg else {}
    pending_releases = _f(row.get("temp", Decimal128("0")))
    settlement_total = _f(row.get("settle", Decimal128("0")))
    lifetime_commission = _f(row.get("temp_earned", Decimal128("0")))
    lifetime_released = _f(row.get("temp_released", Decimal128("0")))

    # How many admins/brokers currently hold commission.
    holders = await wcoll.count_documents({"temporary_balance": {"$gt": Decimal128("0")}})

    return APIResponse(
        data={
            "house_wallet_balance": _f(house.available_balance),
            "house_settlement_outstanding": _f(house.settlement_outstanding),
            # Kuber pool (distributable house pool, separate from personal main).
            "kuber_balance": _f(house.kuber_balance),
            "kuber_total_in": _f(house.kuber_total_in),
            "kuber_total_out": _f(house.kuber_total_out),
            "games_net": games_net,
            "pending_hierarchy_releases": pending_releases,
            "pending_release_holders": holders,
            "lifetime_hierarchy_commission": lifetime_commission,
            "lifetime_hierarchy_released": lifetime_released,
            "platform_settlement_outstanding": settlement_total,
        }
    )


# ── Self-release held games commission (temporary_balance → main) ─────
@router.post("/release-commission", response_model=APIResponse[dict])
async def release_commission(admin: CurrentAdmin, payload: dict | None = None):
    """The logged-in admin/broker/sub-broker releases THEIR OWN held games
    commission (`temporary_balance`) into their OWN main wallet.

    Body: {"amount": number | null}. A null/absent amount releases the FULL
    held balance. Reuses the atomic, self-guarded
    `games_wallet_service.release_temp_to_main` (same primitive the
    SUPER_ADMIN `/games/hierarchy-earnings/{id}/release` path uses); the
    SUPER_ADMIN path stays unchanged.
    """
    w = await wallet_service.get_or_create(admin.id)
    held = to_decimal(w.temporary_balance)

    raw = (payload or {}).get("amount")
    if raw is None:
        amt = held  # release ALL
    else:
        try:
            amt = to_decimal(raw)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid amount")

    if amt <= 0:
        raise HTTPException(status_code=400, detail="Nothing to release")
    if amt > held:
        raise HTTPException(
            status_code=400,
            detail=f"Amount ₹{amt} exceeds held commission ₹{held}",
        )

    try:
        await games_wallet_service.release_temp_to_main(
            admin.id, amt, actor_id=admin.id
        )
    except HTTPException:
        raise
    except Exception as exc:  # atomic guard / insufficient temp → clean 400
        raise HTTPException(status_code=400, detail=str(exc) or "Release failed")

    fresh = await wallet_service.get_or_create(admin.id)
    return APIResponse(
        data={
            "released": _f(amt),
            "available_balance": _f(fresh.available_balance),
            "temporary_balance": _f(fresh.temporary_balance),
        },
        message="Commission released to main wallet",
    )


# ── Fund / commission ledger for the acting user ─────────────────────
_LEDGER_TYPES = [
    TransactionType.ADMIN_DEPOSIT.value,
    TransactionType.ADMIN_TRANSFER.value,
    TransactionType.ADMIN_WITHDRAW.value,
    TransactionType.ADMIN_FLOAT_DISPENSE.value,
    TransactionType.ADMIN_FLOAT_REPLENISH.value,
    TransactionType.GAMES_HIERARCHY.value,
    TransactionType.DEPOSIT.value,
    TransactionType.WITHDRAWAL.value,
]


@router.get("/ledger", response_model=APIResponse[list])
async def my_ledger(admin: CurrentAdmin, limit: int = Query(50, ge=1, le=200)):
    """The acting user's own fund / commission ledger.

    Filters the immutable `wallet_transactions` collection to the money-flow
    types that matter to an admin-tier member (how much the super-admin /
    parent funded them, self-released games commission, and their own
    deposits/withdrawals). The very first ADMIN_DEPOSIT row is the opening
    fund. Read-only.
    """
    rows = (
        await WalletTransaction.find(
            WalletTransaction.user_id == admin.id,
            {"transaction_type": {"$in": _LEDGER_TYPES}},
        )
        .sort("-created_at")
        .limit(limit)
        .to_list()
    )
    out: list[dict] = []
    for r in rows:
        out.append(
            {
                "id": str(r.id),
                "type": r.transaction_type.value
                if hasattr(r.transaction_type, "value")
                else str(r.transaction_type),
                "amount": _f(r.amount),  # signed as stored
                "narration": r.narration,
                "reference_type": r.reference_type,
                "created_at": r.created_at,
            }
        )
    return APIResponse(data=out)


# ── Direct fundable downline of the acting user ──────────────────────
async def _direct_members(admin: User) -> list[User]:
    """The acting user's DIRECT fundable members.

    SUPER_ADMIN → all ADMIN-role users.
    ADMIN       → BROKER users with assigned_admin_id == admin.id.
    BROKER      → BROKER users with assigned_broker_id == admin.id (sub-brokers).
    """
    if admin.role == UserRole.SUPER_ADMIN:
        q: dict = {"role": UserRole.ADMIN.value}
    elif admin.role == UserRole.ADMIN:
        q = {"role": UserRole.BROKER.value, "assigned_admin_id": admin.id}
    elif admin.role == UserRole.BROKER:
        q = {"role": UserRole.BROKER.value, "assigned_broker_id": admin.id}
    else:
        return []
    return await User.find(q).sort("+user_code").limit(200).to_list()


@router.get("/members", response_model=APIResponse[list])
async def my_members(admin: CurrentAdmin, q: str | None = Query(None)):
    """The acting user's direct fundable downline with live balances (cap 200).

    Optional `?q=` filters on user_code / full_name (case-insensitive substring).
    """
    members = await _direct_members(admin)
    needle = (q or "").strip().lower()
    if needle:
        members = [
            m
            for m in members
            if needle in (m.user_code or "").lower()
            or needle in (m.full_name or "").lower()
        ]

    ids = [m.id for m in members]
    wallets: dict = {}
    if ids:
        for w in await Wallet.find({"user_id": {"$in": ids}}).to_list():
            wallets[str(w.user_id)] = w

    out: list[dict] = []
    for m in members:
        w = wallets.get(str(m.id))
        out.append(
            {
                "id": str(m.id),
                "user_code": m.user_code,
                "full_name": m.full_name,
                "role": m.role.value if hasattr(m.role, "value") else str(m.role),
                "available_balance": _f(w.available_balance) if w else 0.0,
                "temporary_balance": _f(w.temporary_balance) if w else 0.0,
            }
        )
    return APIResponse(data=out)


# ── Games revenue analytics (SUPER_ADMIN) ────────────────────────────
# Canonical game keys (mirrors app.models.games.settings.GAME_KEYS). Kept as a
# local literal so this analytics endpoint degrades gracefully even if that
# module changes shape.
_GAMES_KEYS: tuple[str, ...] = (
    "niftyUpDown",
    "btcUpDown",
    "niftyNumber",
    "btcNumber",
    "niftyBracket",
    "niftyJackpot",
    "btcJackpot",
)


async def _game_stats(model, game_key: str, amount_field: str, payout_field: str) -> dict:
    """Per-collection tickets / gross / payouts aggregate. Defensive — any
    failure (missing collection/field) degrades to zeros so the whole
    breakdown never 500s on one bad game."""
    try:
        coll = model.get_motor_collection()
        agg = await coll.aggregate(
            [
                {"$match": {"game_key": game_key}},
                {
                    "$group": {
                        "_id": None,
                        "tickets": {"$sum": 1},
                        "gross": {
                            "$sum": {
                                "$ifNull": [{"$toDecimal": f"${amount_field}"}, Decimal128("0")]
                            }
                        },
                        "payouts": {
                            "$sum": {
                                "$ifNull": [{"$toDecimal": f"${payout_field}"}, Decimal128("0")]
                            }
                        },
                    }
                },
            ]
        ).to_list(1)
        if not agg:
            return {"tickets": 0, "gross_revenue": 0.0, "payouts": 0.0}
        row = agg[0]
        return {
            "tickets": int(row.get("tickets", 0) or 0),
            "gross_revenue": _f(row.get("gross", Decimal128("0"))),
            "payouts": _f(row.get("payouts", Decimal128("0"))),
        }
    except Exception:  # noqa: BLE001 — degrade gracefully per collection
        return {"tickets": 0, "gross_revenue": 0.0, "payouts": 0.0}


@router.get("/games-breakdown", response_model=APIResponse[dict])
async def games_breakdown(admin: SuperAdmin):
    """SUPER_ADMIN games revenue analytics — read-only + defensive.

    Returns:
      • per_game   : tickets / gross_revenue / payouts / house_net per game_key
      • per_admin  : commission_earned / held / released for admin/broker wallets
      • totals     : aggregate tickets / revenue / payouts / house_net
    """
    from app.models.games.bets import (
        BracketTrade,
        JackpotBid,
        NumberBet,
        UpDownBet,
    )

    # game_key → (model, stake_field, payout_field)
    model_for = {
        "niftyUpDown": (UpDownBet, "amount", "payout"),
        "btcUpDown": (UpDownBet, "amount", "payout"),
        "niftyNumber": (NumberBet, "amount", "payout"),
        "btcNumber": (NumberBet, "amount", "payout"),
        "niftyBracket": (BracketTrade, "amount", "payout"),
        "niftyJackpot": (JackpotBid, "amount", "prize"),
        "btcJackpot": (JackpotBid, "amount", "prize"),
    }

    per_game: list[dict] = []
    total_tickets = 0
    total_revenue = 0.0
    total_payouts = 0.0
    for key in _GAMES_KEYS:
        model, amt_f, pay_f = model_for[key]
        s = await _game_stats(model, key, amt_f, pay_f)
        house_net = round(s["gross_revenue"] - s["payouts"], 2)
        per_game.append(
            {
                "game_key": key,
                "tickets": s["tickets"],
                "gross_revenue": s["gross_revenue"],
                "payouts": s["payouts"],
                "house_net": house_net,
            }
        )
        total_tickets += s["tickets"]
        total_revenue += s["gross_revenue"]
        total_payouts += s["payouts"]

    # Per-admin/broker commission (from the trading Wallet temporary_* fields).
    per_admin: list[dict] = []
    try:
        admin_ids = [
            u.id
            for u in await User.find(
                {"role": {"$in": [UserRole.ADMIN.value, UserRole.BROKER.value]}}
            ).to_list()
        ]
        if admin_ids:
            wallets = await Wallet.find(
                {
                    "user_id": {"$in": admin_ids},
                    "$or": [
                        {"$expr": {"$gt": [{"$toDecimal": "$temporary_total_earned"}, 0]}},
                        {"$expr": {"$gt": [{"$toDecimal": "$temporary_balance"}, 0]}},
                        {"$expr": {"$gt": [{"$toDecimal": "$temporary_total_released"}, 0]}},
                    ],
                }
            ).to_list()
            users = {}
            for u in await User.find({"_id": {"$in": [w.user_id for w in wallets]}}).to_list():
                users[str(u.id)] = u
            for w in wallets:
                u = users.get(str(w.user_id))
                if u is None:
                    continue
                per_admin.append(
                    {
                        "user_code": u.user_code,
                        "full_name": u.full_name,
                        "commission_earned": _f(w.temporary_total_earned),
                        "held": _f(w.temporary_balance),
                        "released": _f(w.temporary_total_released),
                    }
                )
            per_admin.sort(key=lambda r: r["commission_earned"], reverse=True)
            per_admin = per_admin[:100]
    except Exception:  # noqa: BLE001 — degrade gracefully
        per_admin = []

    return APIResponse(
        data={
            "per_game": per_game,
            "per_admin": per_admin,
            "totals": {
                "total_tickets": total_tickets,
                "total_revenue": round(total_revenue, 2),
                "total_payouts": round(total_payouts, 2),
                "house_net": round(total_revenue - total_payouts, 2),
            },
        }
    )
