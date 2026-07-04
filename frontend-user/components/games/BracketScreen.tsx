"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCoins as formatINR } from "@/lib/games/coins";
import { GamesAPI } from "@/lib/api";
import { type GameUiId } from "@/lib/games/ids";
import { isBiddingOpen } from "@/lib/games/window";
import { useGameConfig, useGamesPrice, useGamesWallet } from "@/components/games/useGames";
import { GameHowTo, GameStatePill, StatChip, LiveDot, LivePrice } from "@/components/games/bits";

const QUICK_ADD = [500, 1000, 5000];

export function BracketScreen({ id }: { id: GameUiId }) {
  const cfg = useGameConfig(id);
  const { data: wallet } = useGamesWallet();
  const { data: price } = useGamesPrice(1000);
  const qc = useQueryClient();
  const [side, setSide] = useState<"BUY" | "SELL" | null>(null);
  const [amount, setAmount] = useState("");

  const live = price?.nifty ? Number(price.nifty) : 0;
  const gap = Number(cfg?.bracket_gap ?? 20);
  const open = cfg ? isBiddingOpen(cfg.bidding_start_time, cfg.bidding_end_time) : false;
  const balance = Number(wallet?.balance ?? 0);

  const { data: active } = useQuery({
    queryKey: ["games", "bets", "bracket-active"],
    queryFn: () => GamesAPI.bracketActive(),
    refetchInterval: 2000,
  });

  const place = useMutation({
    mutationFn: async () => {
      if (!side) throw new Error("Pick BUY or SELL");
      if (!(Number(amount) > 0)) throw new Error("Enter an amount");
      if (Number(amount) > balance) throw new Error("Insufficient games balance");
      return GamesAPI.bracketTrade({ prediction: side, amount: Number(amount), entryPrice: live });
    },
    onSuccess: () => {
      toast.success("Bracket placed");
      setAmount(""); setSide(null);
      qc.invalidateQueries({ queryKey: ["games", "bets", "bracket-active"] });
      qc.invalidateQueries({ queryKey: ["games", "wallet"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not place"),
  });

  const bracketMult = Number(cfg?.win_multiplier ?? 0);
  return (
    <div className="space-y-4">
      <GameHowTo
        costText="Bet any amount"
        payoutLabel={bracketMult > 0 ? `Win = ${bracketMult}× your bet` : "Win = fixed bracket payout"}
        steps={[
          "Pick BUY (up) or SELL (down)",
          "Enter your bet amount",
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
              <StatChip label={`Sell below (−${gap})`} value={live ? (live - gap).toFixed(2) : "—"} tone="text-sell" />
              <StatChip label={`Buy above (+${gap})`} value={live ? (live + gap).toFixed(2) : "—"} tone="text-buy" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle>Active trades</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {(active || []).length === 0 && <div className="py-2 text-sm text-muted-foreground">No active trades.</div>}
            {(active || []).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-0">
                <span className="flex items-center gap-2">
                  <span className={cn("font-semibold", t.prediction === "BUY" ? "text-buy" : "text-sell")}>{t.prediction}</span>
                  <span className="tabular-nums text-muted-foreground">@ {Number(t.entry_price).toFixed(2)}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">{formatINR(t.amount)}</span>
                  <GameStatePill state="pending" label="Live" />
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit md:sticky md:top-4">
        <CardHeader className="pb-3"><CardTitle>Place bracket</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSide("BUY")}
              className={cn("rounded-xl border-2 py-3 font-bold transition-all", side === "BUY" ? "border-buy bg-buy/10 text-buy" : "border-border hover:border-buy/40")}>
              BUY
            </button>
            <button type="button" onClick={() => setSide("SELL")}
              className={cn("rounded-xl border-2 py-3 font-bold transition-all", side === "SELL" ? "border-sell bg-sell/10 text-sell" : "border-border hover:border-sell/40")}>
              SELL
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground"><span>Amount (₹)</span><span>Bal {formatINR(balance)}</span></div>
            <Input type="number" inputMode="decimal" placeholder={String(cfg?.ticket_price ?? 1000)} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {QUICK_ADD.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount((a) => String((Number(a) || 0) + q))}
                  className="rounded-md border border-border bg-muted/30 px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  +{q >= 1000 ? `${q / 1000}k` : q}
                </button>
              ))}
            </div>
          </div>
          <StatChip label="Win pays" value={formatINR(Number(amount || 0) * Number(cfg?.win_multiplier ?? 1.9))} tone="text-buy" />
          <Button className="w-full" size="lg" loading={place.isPending} disabled={place.isPending || !open} onClick={() => place.mutate()}>
            {open ? "Place bracket" : "Closed"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">Resolves in {cfg?.expiry_minutes ?? 5} min · {cfg?.win_multiplier ?? 1.9}×</p>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
