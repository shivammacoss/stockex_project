"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCoins as formatINR } from "@/lib/games/coins";
import { GamesAPI } from "@/lib/api";
import { type GameUiId } from "@/lib/games/ids";
import { isBiddingOpen } from "@/lib/games/window";
import { useGameConfig, useGamesPrice, useGamesWallet } from "@/components/games/useGames";
import { GameHowTo, GameStatePill, StatChip, LiveDot, LivePrice } from "@/components/games/bits";

// Quick ticket-count picks.
const QUICK_TICKETS = [1, 2, 5, 10];

export function BracketScreen({ id }: { id: GameUiId }) {
  const cfg = useGameConfig(id);
  const { data: wallet } = useGamesWallet();
  const { data: price } = useGamesPrice(250);
  const qc = useQueryClient();
  // Direction is stored internally as BUY (up) / SELL (down) — the API contract
  // is unchanged — but shown to the user as UP / DOWN to remove confusion.
  const [side, setSide] = useState<"BUY" | "SELL" | null>(null);
  const [tickets, setTickets] = useState(1);

  const live = price?.nifty ? Number(price.nifty) : 0;
  const gap = Number(cfg?.bracket_gap ?? 20);
  const open = cfg ? isBiddingOpen(cfg.bidding_start_time, cfg.bidding_end_time) : false;
  const balance = Number(wallet?.balance ?? 0);

  // Fixed ticket price (no free-form amount). Amount = tickets × ticket price.
  const ticketPrice = Number(cfg?.ticket_price ?? 1100);
  const amount = tickets * ticketPrice;
  const maxTickets = ticketPrice > 0 ? Math.max(1, Math.floor(balance / ticketPrice)) : 1;

  const { data: active } = useQuery({
    queryKey: ["games", "bets", "bracket-active"],
    queryFn: () => GamesAPI.bracketActive(),
    refetchInterval: 2000,
  });
  // Resolved trades (WON / LOST) so the result + payout stay visible after a
  // bracket settles — instead of the bet just vanishing from "Active trades".
  const { data: history } = useQuery({
    queryKey: ["games", "bets", "bracket-history"],
    queryFn: () => GamesAPI.bracketHistory(20),
    refetchInterval: 3000,
  });
  const results: any[] = (history || []).filter((t: any) => t.status && t.status !== "PENDING");

  // GLOBAL last-5 session results (the official session-close per day) — visible
  // to EVERY player, even before their own trades settle.
  const { data: recentResults } = useQuery({
    queryKey: ["games", "bets", "bracket-recent-results"],
    queryFn: () => GamesAPI.bracketRecentResults(5),
    refetchInterval: 5000,
  });
  const sessionResults: any[] = recentResults || [];

  const place = useMutation({
    mutationFn: async () => {
      if (!side) throw new Error("Pick UP or DOWN");
      if (!(tickets > 0)) throw new Error("Select at least 1 ticket");
      if (amount > balance) throw new Error("Insufficient games balance");
      return GamesAPI.bracketTrade({ prediction: side, amount, entryPrice: live });
    },
    onSuccess: () => {
      toast.success("Bracket placed");
      setTickets(1); setSide(null);
      qc.invalidateQueries({ queryKey: ["games", "bets", "bracket-active"] });
      qc.invalidateQueries({ queryKey: ["games", "bets", "bracket-history"] });
      qc.invalidateQueries({ queryKey: ["games", "wallet"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not place"),
  });

  const bracketMult = Number(cfg?.win_multiplier ?? 0);
  return (
    <div className="space-y-4">
      <GameHowTo
        costText={`${formatINR(ticketPrice)} / ticket`}
        payoutLabel={bracketMult > 0 ? `Win = ${bracketMult}× your stake` : "Win = fixed bracket payout"}
        steps={[
          "Pick UP or DOWN",
          "Choose how many tickets",
          `Win if NIFTY moves your way past the ${gap}-pt bracket by session close`,
        ]}
      />
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        <Card className="overflow-hidden">
          <CardContent className="relative p-4 sm:p-5">
            <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-primary/10 blur-3xl" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Nifty Bracket · Live spot</div>
                <LivePrice value={live} className="mt-1 text-3xl font-bold sm:text-4xl" />
                <div className="mt-1"><LiveDot live={!!live} label={live ? "Live price" : "Waiting for feed"} /></div>
              </div>
              {open ? <GameStatePill state="open" label="Open" /> : <GameStatePill state="closed" label="Closed" />}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <StatChip label={`Down below (−${gap})`} value={live ? (live - gap).toFixed(2) : "—"} tone="text-sell" />
              <StatChip label={`Up above (+${gap})`} value={live ? (live + gap).toFixed(2) : "—"} tone="text-buy" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle>Active trades</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {(active || []).length === 0 && <div className="py-2 text-sm text-muted-foreground">No active trades.</div>}
            {(active || []).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-0">
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2">
                    <span className={cn("font-semibold", t.prediction === "BUY" ? "text-buy" : "text-sell")}>
                      {t.prediction === "BUY" ? "UP" : "DOWN"}
                    </span>
                    <span className="tabular-nums text-muted-foreground">@ {Number(t.entry_price).toFixed(2)}</span>
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{fmtBidTimeMs(t.created_at)}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">{formatINR(t.amount)}</span>
                  <GameStatePill state="pending" label="Live" />
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Last 5 SESSION results — GLOBAL, shown to everyone so recent outcomes
            are always visible even before your own trades settle. */}
        <Card>
          <CardHeader className="pb-3"><CardTitle>Last 5 results</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {sessionResults.length === 0 && (
              <div className="py-2 text-sm text-muted-foreground">No results yet.</div>
            )}
            {sessionResults.map((r: any) => {
              const up = r.direction === "UP";
              const down = r.direction === "DOWN";
              return (
                <div key={r.day} className="flex items-center justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{r.day}</span>
                    <span className="text-[11px] text-muted-foreground">Session close</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums font-semibold">
                      {Number(r.close_price).toFixed(2)}
                    </span>
                    {r.direction && (
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[11px] font-bold",
                          up ? "bg-buy/15 text-buy" : down ? "bg-sell/15 text-sell" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {up ? "▲ UP" : down ? "▼ DOWN" : "— FLAT"}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Your own resolved trades STAY visible with won/lost + payout
            (they used to just vanish when the bracket settled). */}
        <Card>
          <CardHeader className="pb-3"><CardTitle>Your recent results</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {results.length === 0 && <div className="py-2 text-sm text-muted-foreground">No results yet.</div>}
            {results.map((t: any) => {
              const won = t.status === "WON";
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={cn("font-semibold", t.prediction === "BUY" ? "text-buy" : "text-sell")}>
                        {t.prediction === "BUY" ? "UP" : "DOWN"}
                      </span>
                      <span className="tabular-nums text-muted-foreground">@ {Number(t.entry_price).toFixed(2)}</span>
                      {t.result_price && (
                        <span className="text-[11px] tabular-nums text-muted-foreground">→ {Number(t.result_price).toFixed(2)}</span>
                      )}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatINR(t.amount)} · {fmtBidTimeMs(t.created_at)}
                    </span>
                  </span>
                  <span className={cn("shrink-0 font-bold tabular-nums", won ? "text-buy" : "text-sell")}>
                    {won ? `WON +${formatINR(t.payout)}` : "LOST"}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit md:sticky md:top-4">
        <CardHeader className="pb-3"><CardTitle>Place bracket</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Direction — UP / DOWN */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSide("BUY")}
              className={cn("rounded-xl border-2 py-3 font-bold transition-all", side === "BUY" ? "border-buy bg-buy/10 text-buy" : "border-border hover:border-buy/40")}>
              UP
            </button>
            <button type="button" onClick={() => setSide("SELL")}
              className={cn("rounded-xl border-2 py-3 font-bold transition-all", side === "SELL" ? "border-sell bg-sell/10 text-sell" : "border-border hover:border-sell/40")}>
              DOWN
            </button>
          </div>

          {/* Ticket count (fixed price — no free-form amount) */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Tickets · {formatINR(ticketPrice)} each</span>
              <span>Bal {formatINR(balance)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Fewer tickets"
                onClick={() => setTickets((t) => Math.max(1, t - 1))}
                className="grid size-11 shrink-0 place-items-center rounded-xl border border-border hover:border-primary/40 disabled:opacity-40"
                disabled={tickets <= 1}>
                <Minus className="size-4" />
              </button>
              <div className="flex-1 rounded-xl border border-border py-1.5 text-center">
                <div className="text-2xl font-bold tabular-nums leading-none">{tickets}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">= {formatINR(amount)}</div>
              </div>
              <button type="button" aria-label="More tickets"
                onClick={() => setTickets((t) => Math.min(maxTickets, t + 1))}
                className="grid size-11 shrink-0 place-items-center rounded-xl border border-border hover:border-primary/40 disabled:opacity-40"
                disabled={tickets >= maxTickets}>
                <Plus className="size-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {QUICK_TICKETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTickets(Math.min(maxTickets, n))}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors",
                    tickets === n ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-primary",
                  )}
                >
                  {n} T
                </button>
              ))}
            </div>
          </div>

          <StatChip label="Win pays" value={formatINR(amount * Number(cfg?.win_multiplier ?? 1.818189))} tone="text-buy" />
          <Button className="w-full" size="lg" loading={place.isPending} disabled={place.isPending || !open || !side} onClick={() => place.mutate()}>
            {open ? (side ? "Place bracket" : "Pick UP or DOWN") : "Closed"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Resolves at session close · {(cfg?.result_time ?? "15:30:00").slice(0, 5)} IST · {cfg?.win_multiplier ?? 1.818189}×
          </p>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}

// Placement time WITH milliseconds, IST — e.g. "13:46:18.052". Users wanted the
// exact bet instant (ms) visible on each live bracket trade.
function fmtBidTimeMs(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hms = d.toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata",
  });
  return `${hms}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}
