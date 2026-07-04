"""ID mapping (spec §7) — the single source of truth on the backend.

Three namespaces exist and must never be conflated:
  • UI id       — what the frontend route/slug uses ("updown", "btcupdown", …)
  • settings key — the GameSettings key & internal `game_key` ("niftyUpDown", …)
  • ledger id    — the id stamped on ledger rows

The API accepts a UI id and maps to the settings key at the edge; everything
internal (models, ledger, engine) uses the settings key.
"""

from __future__ import annotations

# UI id → GameSettings key
UI_TO_SETTINGS: dict[str, str] = {
    "updown": "niftyUpDown",
    "btcupdown": "btcUpDown",
    "niftynumber": "niftyNumber",
    "btcnumber": "btcNumber",
    "niftybracket": "niftyBracket",
    "niftyjackpot": "niftyJackpot",
    "btcjackpot": "btcJackpot",
}

# GameSettings key → UI id
SETTINGS_TO_UI: dict[str, str] = {v: k for k, v in UI_TO_SETTINGS.items()}

# UI id → ledger game id (matches spec §7 — mostly the settings key, except
# the two up/down games keep their lowercase UI id in the ledger).
UI_TO_LEDGER: dict[str, str] = {
    "updown": "updown",
    "btcupdown": "btcupdown",
    "niftynumber": "niftyNumber",
    "btcnumber": "btcNumber",
    "niftybracket": "niftyBracket",
    "niftyjackpot": "niftyJackpot",
    "btcjackpot": "btcJackpot",
}


def settings_key(game_id: str) -> str | None:
    """Accept either a UI id or an already-canonical settings key."""
    if game_id in SETTINGS_TO_UI:  # already a settings key
        return game_id
    return UI_TO_SETTINGS.get(game_id)


def ui_id(settings_or_ui: str) -> str | None:
    if settings_or_ui in UI_TO_SETTINGS:  # already a UI id
        return settings_or_ui
    return SETTINGS_TO_UI.get(settings_or_ui)
