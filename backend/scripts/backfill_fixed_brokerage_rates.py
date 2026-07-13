"""Backfill Account 2 per-segment frozen rates for existing fixed-brokerage nodes.

For every `is_fixed_brokerage` ADMIN/BROKER that has no `fixed_brokerage_rates`
yet, snapshot its CURRENT effective per-segment brokerage (GLOBAL + the node's
own SubAdminSegmentOverride — i.e. what the parent set at create) into
`fixed_brokerage_rates`. Idempotent: skips nodes that already have rates.

Run:  cd backend && .venv/bin/python -m scripts.backfill_fixed_brokerage_rates
"""

import asyncio

from app.core.database import init_database, close_database
from app.core.redis_client import init_redis
from app.models.netting import SEGMENT_CODES
from app.models.user import User
from app.services import netting_service, settings_snapshot


async def main() -> None:
    await init_database()
    await init_redis()
    coll = User.get_motor_collection()
    docs = await coll.find({"is_fixed_brokerage": True}).to_list(length=5000)
    print(f"fixed-brokerage nodes: {len(docs)}")
    updated = 0
    for d in docs:
        node = User(**d)
        existing = getattr(node, "fixed_brokerage_rates", None) or {}
        if existing:
            print(f"  skip {node.user_code} ({node.role.value}) — already has {len(existing)} rates")
            continue
        rates: dict[str, dict] = {}
        for seg in SEGMENT_CODES:
            eff = await settings_snapshot._resolve_effective_segment(source_user=node, segment_name=seg)
            rates[seg] = {
                "commission": eff.get("commission"),
                "commissionType": eff.get("commissionType") or "per_crore",
                "optionBuyCommission": eff.get("optionBuyCommission"),
                "optionSellCommission": eff.get("optionSellCommission"),
            }
        node.fixed_brokerage_rates = rates
        await node.save()
        updated += 1
        sample = {k: rates[k]["commission"] for k in ("NSE_STK_OPT", "MCX_FUT", "CRYPTO") if k in rates}
        print(f"  froze {node.user_code} ({node.role.value}) {len(rates)} segs; sample={sample}")
    print(f"\nDONE — froze {updated} node(s).")
    _ = netting_service  # keep import (parity with runtime path)
    await close_database()


if __name__ == "__main__":
    asyncio.run(main())
