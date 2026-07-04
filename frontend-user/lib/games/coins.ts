// Coin (◉) display for the GAMES section only. "Coins" is a pure branding
// layer over INR — every games balance is still a plain ₹ number; we just
// render it with the ◉ symbol inside game screens (mirrors Stockex
// stockexCoins.js). Trading / main-wallet UI keeps ₹.

export const COIN_SYMBOL = "◉";

const numFmt = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Render an amount as `◉ 1,234.00`. `withSymbol:false` → number only. */
export function formatCoins(
  value: number | string | null | undefined,
  opts?: { withSymbol?: boolean },
): string {
  if (value === null || value === undefined || value === "") {
    return opts?.withSymbol === false ? "0.00" : `${COIN_SYMBOL} 0.00`;
  }
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) {
    return opts?.withSymbol === false ? "0.00" : `${COIN_SYMBOL} 0.00`;
  }
  return opts?.withSymbol === false
    ? numFmt.format(n)
    : `${COIN_SYMBOL} ${numFmt.format(n)}`;
}
