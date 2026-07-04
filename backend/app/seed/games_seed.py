"""Idempotent seed for the games subsystem.

Creates the `GameSettings` singleton with the 7 default game blocks (or
auto-heals a missing block on an existing install). No balance mutation.
"""

from __future__ import annotations

import logging

from app.models.games.settings import GameSettings

logger = logging.getLogger(__name__)


async def seed_game_settings() -> None:
    settings = await GameSettings.load_singleton()
    logger.info("seeded_game_settings", extra={"games": list(settings.games.keys())})
