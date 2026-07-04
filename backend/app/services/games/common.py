"""Small shared helpers for the games subsystem — IST day/time + window math.

All games are IST-scoped (Asia/Kolkata). These helpers centralize the day
string and window-number computation so services and settlement agree.
"""

from __future__ import annotations

from datetime import datetime, time

from app.utils.time_utils import IST, now_ist


def ist_datetime_for_day(day: str) -> datetime:
    """IST-midnight datetime for a 'YYYY-MM-DD' day string."""
    y, m, d = (int(x) for x in day.split("-"))
    return datetime(y, m, d, tzinfo=IST)


def ist_day(dt: datetime | None = None) -> str:
    """IST day string 'YYYY-MM-DD' for the given (or current) moment."""
    d = dt if dt is not None else now_ist()
    return d.strftime("%Y-%m-%d")


def parse_hms(s: str) -> time:
    """Parse 'HH:MM' or 'HH:MM:SS' into a time (IST)."""
    parts = [int(p) for p in s.split(":")]
    while len(parts) < 3:
        parts.append(0)
    h, m, sec = parts[0], parts[1], parts[2]
    return time(hour=h, minute=m, second=sec)


def seconds_since_ist_midnight(dt: datetime | None = None) -> int:
    d = dt if dt is not None else now_ist()
    return d.hour * 3600 + d.minute * 60 + d.second


def window_number_for(
    now: datetime, start_hms: str, round_duration_sec: int
) -> int:
    """1-based window index since `start_hms` for a fixed round duration.

    Window 1 covers [start, start+dur), window 2 [start+dur, start+2·dur), …
    Values <= 0 (before session start) clamp to 0.
    """
    start = parse_hms(start_hms)
    start_sec = start.hour * 3600 + start.minute * 60 + start.second
    now_sec = now.hour * 3600 + now.minute * 60 + now.second
    if round_duration_sec <= 0:
        return 0
    delta = now_sec - start_sec
    if delta < 0:
        return 0
    return delta // round_duration_sec + 1


def window_open_close_ist(
    day_ist: datetime, start_hms: str, round_duration_sec: int, window_number: int
) -> tuple[datetime, datetime]:
    """Return (open_dt, close_dt) IST for a given 1-based window number."""
    start = parse_hms(start_hms)
    base = day_ist.replace(
        hour=start.hour, minute=start.minute, second=start.second, microsecond=0
    )
    from datetime import timedelta

    open_dt = base + timedelta(seconds=round_duration_sec * (window_number - 1))
    close_dt = open_dt + timedelta(seconds=round_duration_sec)
    return open_dt, close_dt
