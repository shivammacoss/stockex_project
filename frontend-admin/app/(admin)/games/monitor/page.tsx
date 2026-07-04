"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { AdminGamesAPI } from "@/lib/api";

const LABELS: Record<string, string> = {
  niftyUpDown: "Nifty Up/Down",
  btcUpDown: "BTC Up/Down",
  niftyNumber: "Nifty Number",
  btcNumber: "BTC Number",
  niftyBracket: "Nifty Bracket",
  niftyJackpot: "Nifty Jackpot",
  btcJackpot: "BTC Jackpot",
};

export default function GamesMonitorPage() {
  const { data } = useQuery({
    queryKey: ["admin", "games", "live-details"],
    queryFn: () => AdminGamesAPI.liveDetails(),
    refetchInterval: 5000,
  });

  const live = data?.live || {};
  const games = data?.settings?.games || {};

  return (
    <div className="space-y-5">
      <PageHeader title="Live Bets" description="Live market prices and per-game status." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">NIFTY</div>
          <div className="text-2xl font-bold tabular-nums">{live.nifty ? Number(live.nifty).toLocaleString("en-IN") : "—"}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">BTC/USDT</div>
          <div className="text-2xl font-bold tabular-nums">{live.btc ? Number(live.btc).toLocaleString("en-IN") : "—"}</div>
        </CardContent></Card>
      </div>
      <Card>
        <CardContent className="space-y-1 p-4">
          {Object.keys(LABELS).map((k) => (
            <div key={k} className="flex items-center justify-between border-b border-border/60 py-2 text-sm last:border-0">
              <span className="font-medium">{LABELS[k]}</span>
              <span className={games[k]?.enabled === false ? "text-muted-foreground" : "text-buy"}>
                {games[k]?.enabled === false ? "Disabled" : "Enabled"}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
