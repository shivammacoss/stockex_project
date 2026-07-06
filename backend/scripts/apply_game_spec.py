"""Apply the per-game spec (_DEFAULTS) onto the LIVE GameSettings singleton.

Changing `_DEFAULTS` only affects fresh installs / auto-healed missing game
blocks — an already-created singleton keeps its old per-game values. This
one-shot migration overwrites, on the existing singleton, exactly the fields
listed in `_DEFAULTS[game]` (ticket price, winning multiplier / fixed_profit,
the 4-level incentive %s, referral %, and the betting/result timings), leaving
every other field (enabled, min/max tickets, prize table, …) untouched.

Idempotent — safe to re-run. Run from backend/ with the venv active:

    python -m scripts.apply_game_spec
"""

from __future__ import annotations

import asyncio

from app.core.database import close_database, init_database
from app.models.games.settings import _DEFAULTS, GAME_KEYS, GameSettings


async def main() -> None:
    await init_database()
    doc = await GameSettings.load_singleton()

    print("Applying spec to GameSettings singleton…\n")
    for key in GAME_KEYS:
        cfg = doc.games.get(key)
        if cfg is None:
            print(f"  {key}: (missing — skipped, load_singleton should have healed it)")
            continue
        spec = _DEFAULTS.get(key, {})
        for field, val in spec.items():
            setattr(cfg, field, val)
        print(
            f"  {key:14s} ticket={cfg.ticket_price:>7} "
            f"mult={cfg.win_multiplier:<9} fixed={cfg.fixed_profit:<8} "
            f"SB/B/A={cfg.sub_broker_profit_pct}/{cfg.broker_profit_pct}/{cfg.admin_profit_pct} "
            f"ref={cfg.referrer_profit_pct}"
        )

    await doc.save()
    print("\nSaved. Timings:")
    for key in GAME_KEYS:
        cfg = doc.games[key]
        if key in ("niftyUpDown", "btcUpDown"):
            print(f"  {key:14s} betting {cfg.start_time}–{cfg.end_time} (rounds {cfg.round_duration}s)")
        else:
            print(f"  {key:14s} bidding {cfg.bidding_start_time}–{cfg.bidding_end_time}, result {cfg.result_time}")

    await close_database()
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
