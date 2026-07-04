"""User games routers (mounted under /api/v1/user/games)."""

from fastapi import APIRouter

from app.api.v1.user.games import (
    bracket,
    common,
    jackpot,
    number,
    settings,
    updown,
    wallet,
)

router = APIRouter(prefix="/games", tags=["user-games"])
router.include_router(wallet.router)
router.include_router(settings.router)
router.include_router(common.router)
router.include_router(updown.router)
router.include_router(number.router)
router.include_router(bracket.router)
router.include_router(jackpot.router)
