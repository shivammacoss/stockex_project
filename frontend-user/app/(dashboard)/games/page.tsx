"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Hash, Split, Trophy, ChevronRight, Bitcoin } from "lucide-react";
import { cn } from "@/lib/utils";
import { GamesAPI } from "@/lib/api";
import { ALL_GAME_IDS, GAME_META, SETTINGS_KEY, type Mechanic } from "@/lib/games/ids";
import { useGamesSettings, useGamesPrice } from "@/components/games/useGames";
import { LivePriceTag, LiveDot } from "@/components/games/bits";

const MECHANIC_ICON: Record<Mechanic, any> = {
  updown: TrendingUp,
  number: Hash,
  bracket: Split,
  jackpot: Trophy,
};

const GROUPS: { title: string; mechanic: Mechanic }[] = [
  { title: "Up / Down", mechanic: "updown" },
  { title: "Number", mechanic: "number" },
  { title: "Bracket", mechanic: "bracket" },
  { title: "Jackpot", mechanic: "jackpot" },
];

export default function GamesLobby() {
  const { data: settings, isLoading } = useGamesSettings();
  const { data: price } = useGamesPrice();
  const { data: activity } = useQuery({
    queryKey: ["games", "activity"],
    queryFn: () => GamesAPI.liveActivity(),
    refetchInterval: 10000,
  });

  const games = settings?.games || {};
  const nifty = price?.nifty ? Number(price.nifty) : null;
  const btc = price?.btc ? Number(price.btc) : null;
  const feedLive = !!(nifty || btc);

  return (
    <div className="space-y-6">
      {/* Live-price strip */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <LivePriceTag asset="NIFTY" value={nifty} className="min-w-0 sm:min-w-[140px]" />
          <LivePriceTag asset="BTC" value={btc} className="min-w-0 sm:min-w-[160px]" />
        </div>
        <LiveDot live={feedLive} label={feedLive ? "Live market feed" : "Waiting for feed…"} />
      </div>

      {isLoading ? (
        <LobbySkeleton />
      ) : (
        GROUPS.map((g) => {
          const ids = ALL_GAME_IDS.filter((id) => GAME_META[id].mechanic === g.mechanic);
          const Icon = MECHANIC_ICON[g.mechanic];
          return (
            <section key={g.mechanic}>
              <h2 className="mb-2.5 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                <Icon className="size-4" /> {g.title}
              </h2>
              {/* 2 small boxes per row on phone, 3 on desktop */}
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
                {ids.map((id) => {
                  const meta = GAME_META[id];
                  const cfg = games[SETTINGS_KEY[id]];
                  const enabled = cfg ? cfg.enabled !== false : true;
                  const tickets = activity?.[SETTINGS_KEY[id]]?.tickets ?? 0;
                  const isBtc = meta.asset === "BTC";
                  return (
                    <GameCard
                      key={id}
                      id={id}
                      title={meta.title}
                      blurb={meta.blurb}
                      asset={meta.asset}
                      isBtc={isBtc}
                      enabled={enabled}
                      tickets={tickets}
                    />
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function GameCard({
  id, title, blurb, asset, isBtc, enabled, tickets,
}: {
  id: string; title: string; blurb: string; asset: string; isBtc: boolean; enabled: boolean; tickets: number;
}) {
  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-6 -top-6 size-20 rounded-full blur-2xl transition-opacity",
          isBtc ? "bg-atm/15" : "bg-primary/15",
          enabled ? "opacity-100" : "opacity-30",
        )}
      />
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            isBtc ? "bg-atm/15 text-atm" : "bg-primary/10 text-primary",
          )}
        >
          {isBtc ? <Bitcoin className="size-3" /> : <TrendingUp className="size-3" />}
          {asset}
        </span>
        {enabled ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <span className={cn("size-1.5 rounded-full", tickets > 0 ? "bg-buy animate-pulse" : "bg-muted-foreground/40")} />
            {tickets}
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-muted-foreground">Off</span>
        )}
      </div>

      <div className="mt-2 flex-1">
        <div className="text-[15px] font-bold leading-tight tracking-tight">{title}</div>
        <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{blurb}</div>
      </div>

      {enabled ? (
        <div
          className={cn(
            "mt-3 flex h-10 items-center justify-center gap-1 rounded-xl text-sm font-bold shadow-sm transition-transform group-hover:scale-[1.02] group-active:scale-100",
            isBtc ? "bg-atm text-black shadow-atm/20" : "bg-primary text-primary-foreground shadow-primary/20",
          )}
        >
          Play <ChevronRight className="size-4" />
        </div>
      ) : (
        <div className="mt-3 flex h-10 items-center justify-center rounded-xl border border-border text-sm font-semibold text-muted-foreground">
          Disabled
        </div>
      )}
    </>
  );

  const cls = cn(
    "group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-3.5 transition-all",
    enabled ? "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5" : "cursor-not-allowed opacity-60",
  );

  return enabled ? (
    <Link href={`/games/${id}`} className={cls}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function LobbySkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((s) => (
        <section key={s}>
          <div className="mb-2.5 h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3.5">
                <div className="flex justify-between">
                  <div className="h-4 w-10 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-6 animate-pulse rounded bg-muted" />
                </div>
                <div className="mt-2 h-4 w-4/5 animate-pulse rounded bg-muted" />
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="mt-3 h-10 w-full animate-pulse rounded-xl bg-muted" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
