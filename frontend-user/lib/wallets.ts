// Multi-wallet kinds (mirror of backend app/services/wallet_kinds.py).

export type WalletKind = "MAIN" | "NSE_BSE" | "MCX" | "CRYPTO" | "FOREX";

export const SEGMENT_KINDS: WalletKind[] = ["NSE_BSE", "MCX", "CRYPTO", "FOREX"];

export const WALLET_LABEL: Record<WalletKind, string> = {
  MAIN: "Main",
  NSE_BSE: "NSE / BSE",
  MCX: "MCX",
  CRYPTO: "Crypto",
  FOREX: "Forex",
};

export const WALLET_CODE: Record<WalletKind, string> = {
  MAIN: "MAIN",
  NSE_BSE: "IND",
  MCX: "MCX",
  CRYPTO: "CRYPTO",
  FOREX: "FOREX",
};

/** Accent color class per wallet (uses the app theme tokens). */
export const WALLET_ACCENT: Record<WalletKind, { text: string; bg: string; grad: string }> = {
  MAIN: { text: "text-primary", bg: "bg-primary/10", grad: "from-primary to-primary/70" },
  NSE_BSE: { text: "text-primary", bg: "bg-primary/10", grad: "from-indigo-500 to-violet-500" },
  MCX: { text: "text-atm", bg: "bg-atm/15", grad: "from-amber-500 to-orange-500" },
  CRYPTO: { text: "text-atm", bg: "bg-atm/15", grad: "from-yellow-500 to-amber-500" },
  FOREX: { text: "text-buy", bg: "bg-buy/15", grad: "from-emerald-500 to-teal-500" },
};

/** Resolve which wallet a segment trades from — mirrors the backend resolver. */
export function walletKindForSegment(segment: string | null | undefined): WalletKind {
  const s = (segment || "").toUpperCase();
  if (s.startsWith("MCX")) return "MCX";
  if (s.startsWith("CRYPTO")) return "CRYPTO";
  if (s.startsWith("CDS") || s.includes("FOREX")) return "FOREX";
  return "NSE_BSE";
}
