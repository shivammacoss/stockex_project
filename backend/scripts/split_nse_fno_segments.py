"""Split the NSE_FUT / NSE_OPT admin settings rows into 4 granular rows.

    NSE_FUT  → NSE_STK_FUT (Stock Future) + NSE_IDX_FUT (Index Future)
    NSE_OPT  → NSE_STK_OPT (Stock Option) + NSE_IDX_OPT (Index Option)

Changing SEGMENT_DEFAULTS only SEEDS the 4 new rows with DEFAULT values; the
admin's existing NSE_FUT / NSE_OPT tuning would be lost. This one-shot,
idempotent migration:

  1. Copies each existing NSE_FUT/NSE_OPT row's VALUES into BOTH of its new
     rows (netting_segments + every per-tier override collection), so the
     admin's current lot/margin/brokerage settings are preserved on both the
     stock and index rows (they can then diverge them from the panel).
  2. Re-points per-symbol script overrides to the correct new row by symbol
     (NIFTY/BANKNIFTY/… → index row, else stock row).
  3. Deletes the retired NSE_FUT / NSE_OPT rows.

Run from backend/ with the venv active:  python -m scripts.split_nse_fno_segments
"""

from __future__ import annotations

import asyncio

from app.core.database import close_database, init_database
from app.models.netting import NettingSegment

# old settings row → [(new row name, displayName), …]
SPLIT: dict[str, list[tuple[str, str]]] = {
    "NSE_FUT": [("NSE_STK_FUT", "Stock Future"), ("NSE_IDX_FUT", "Index Future")],
    "NSE_OPT": [("NSE_STK_OPT", "Stock Option"), ("NSE_IDX_OPT", "Index Option")],
}
IDX_PREFIXES = ("NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "MIDCAPNIFTY", "SENSEX", "BANKEX")

# (collection, code-field, has displayName)
SEG_COLLECTIONS = [
    ("netting_segments", "name", True),
    ("user_segment_overrides", "segment_name", False),
    ("sub_admin_segment_overrides", "segment_name", False),
    ("super_admin_segment_overrides", "segment_name", False),
    ("broker_segment_overrides", "segment_name", False),
]


def _owner_filter(doc: dict) -> dict:
    """The owner-id fields that identify an override row (user_id / broker_id /
    …) — everything ending in _id except the mongo _id and the segment FK."""
    return {k: v for k, v in doc.items() if k.endswith("_id") and k not in ("_id", "segment_id")}


async def main() -> None:
    await init_database()
    db = NettingSegment.get_motor_collection().database

    # ── 1) Copy/split value rows (segments + per-tier overrides) ──────────
    for coll_name, field, has_display in SEG_COLLECTIONS:
        coll = db[coll_name]
        copied = deleted = 0
        for old_name, variants in SPLIT.items():
            olds = await coll.find({field: old_name}).to_list(length=None)
            for old in olds:
                of = _owner_filter(old)
                for new_name, display in variants:
                    new_doc = {k: v for k, v in old.items() if k != "_id"}
                    new_doc[field] = new_name
                    if has_display:
                        new_doc["displayName"] = display
                    await coll.replace_one({**of, field: new_name}, new_doc, upsert=True)
                    copied += 1
                await coll.delete_one({"_id": old["_id"]})
                deleted += 1
        print(f"  {coll_name:32s} copied={copied} deleted_old={deleted}")

    # ── 2) Re-point per-symbol script overrides by underlying ────────────
    seg_ids: dict[str, object] = {}
    async for s in db["netting_segments"].find(
        {"name": {"$in": ["NSE_STK_FUT", "NSE_IDX_FUT", "NSE_STK_OPT", "NSE_IDX_OPT"]}}
    ):
        seg_ids[s["name"]] = s["_id"]

    sc = db["netting_script_overrides"]
    remapped = 0
    olds = await sc.find({"segment_name": {"$in": ["NSE_FUT", "NSE_OPT"]}}).to_list(length=None)
    for ov in olds:
        sym = (ov.get("symbol") or "").upper()
        is_idx = sym.startswith(IDX_PREFIXES)
        if ov["segment_name"] == "NSE_FUT":
            new_name = "NSE_IDX_FUT" if is_idx else "NSE_STK_FUT"
        else:
            new_name = "NSE_IDX_OPT" if is_idx else "NSE_STK_OPT"
        upd = {"segment_name": new_name}
        if seg_ids.get(new_name):
            upd["segment_id"] = seg_ids[new_name]
        await sc.update_one({"_id": ov["_id"]}, {"$set": upd})
        remapped += 1
    print(f"  netting_script_overrides         remapped={remapped}")

    # ── 3) Report the final NSE settings rows ────────────────────────────
    print("\nFinal NSE settings rows:")
    async for s in db["netting_segments"].find({"name": {"$regex": "^NSE_"}}):
        print(f"  {s['name']:14s} {s.get('displayName','')}  minLots={s.get('minLots')} maxLots={s.get('maxLots')}")

    await close_database()
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
