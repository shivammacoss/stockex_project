"""Super-admin per-segment MARKET CONTROL — configurable trading hours.

When `enabled`, trading in that segment is allowed ONLY between `open_time` and
`close_time` IST, every day, overriding the default calendar. Lets the super-admin
open/close ANY segment at will — including the normally 24×7 CRYPTO and 24×5 FOREX
markets. Keyed by the admin-row segment code (NSE_STK_OPT / CRYPTO / FOREX …).
"""

from __future__ import annotations

from pymongo import ASCENDING, IndexModel

from app.models._base import TimestampMixin


class MarketControl(TimestampMixin):
    segment_name: str  # admin-row code, e.g. "CRYPTO", "NSE_IDX_OPT"
    enabled: bool = False
    open_time: str = "09:15"  # HH:MM IST
    close_time: str = "15:30"  # HH:MM IST

    class Settings:
        name = "market_controls"
        indexes = [
            IndexModel([("segment_name", ASCENDING)], unique=True, name="market_control_segment_unique"),
        ]
