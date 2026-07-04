// Client-side pre-submit checks (spec §6.5). UX ONLY — the server
// independently re-validates every limit, window, balance, and game state.

export interface BetCheckInput {
  amount: number;
  balance: number;
  ticketPrice: number;
  minTickets: number;
  maxTickets: number;
  enabled: boolean;
  windowOpen: boolean;
  hasSelection: boolean;
}

export interface CheckResult {
  ok: boolean;
  reason?: string;
}

export function validateBet(i: BetCheckInput): CheckResult {
  if (!i.enabled) return { ok: false, reason: "This game is currently disabled" };
  if (!i.windowOpen) return { ok: false, reason: "Betting window is closed" };
  if (!i.hasSelection) return { ok: false, reason: "Make a selection first" };
  if (!(i.amount > 0)) return { ok: false, reason: "Enter an amount" };
  if (i.ticketPrice > 0) {
    const tickets = Math.round(i.amount / i.ticketPrice);
    if (tickets < i.minTickets) return { ok: false, reason: `Minimum ${i.minTickets} ticket(s)` };
    if (tickets > i.maxTickets) return { ok: false, reason: `Maximum ${i.maxTickets} ticket(s)` };
  }
  if (i.amount > i.balance) return { ok: false, reason: "Insufficient games balance" };
  return { ok: true };
}
