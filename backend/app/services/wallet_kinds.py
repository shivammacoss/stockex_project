"""Wallet-kind taxonomy for the multi-wallet system (wallet.md).

Maps the 20 trading SegmentTypes into 4 trading wallets + MAIN (cash) + GAMES.
Golden rule: a trade debits ONLY its segment wallet — MAIN never trades.
"""

from __future__ import annotations

# Trading wallet kinds (GAMES lives in its own collection; MAIN = cash Wallet).
MAIN = "MAIN"
NSE_BSE = "NSE_BSE"
MCX = "MCX"
CRYPTO = "CRYPTO"
FOREX = "FOREX"

# The trading segment wallets (funded from MAIN). Order = display order.
SEGMENT_KINDS: tuple[str, ...] = (NSE_BSE, MCX, CRYPTO, FOREX)
ALL_KINDS: tuple[str, ...] = (MAIN, *SEGMENT_KINDS)

LABELS: dict[str, str] = {
    MAIN: "Main",
    NSE_BSE: "NSE / BSE",
    MCX: "MCX",
    CRYPTO: "Crypto",
    FOREX: "Forex",
}
# Short code prefix shown on the wallet card (IND-xxxx style).
CODE_PREFIX: dict[str, str] = {
    MAIN: "MAIN",
    NSE_BSE: "IND",
    MCX: "MCX",
    CRYPTO: "CRYPTO",
    FOREX: "FOREX",
}

DEFAULT_PRIMARY = NSE_BSE


def wallet_kind_for_segment(segment_type: str | None) -> str:
    """Resolve which trading wallet a segment trades from. Default NSE_BSE."""
    s = (segment_type or "").upper()
    if s.startswith("MCX"):
        return MCX
    if s.startswith("CRYPTO"):
        return CRYPTO
    if s.startswith("CDS") or "FOREX" in s:
        return FOREX
    # NSE_*, BSE_*, NFO, and anything else → the default equity/derivatives bucket.
    return NSE_BSE


# Which SegmentType values belong to each wallet kind (for market/positions
# filtering + per-wallet margin recompute). Prefix-based, mirrors the resolver.
def segments_for_kind(kind: str) -> list[str]:
    from app.models._base import ALL_SEGMENTS

    return [s.value for s in ALL_SEGMENTS if wallet_kind_for_segment(s.value) == kind]


def is_valid_kind(kind: str) -> bool:
    return kind in ALL_KINDS


def is_segment_kind(kind: str) -> bool:
    return kind in SEGMENT_KINDS
