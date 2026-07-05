"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Landmark,
  Dice5,
  Clock,
  TrendingUp,
  TrendingDown,
  Users,
  ArrowRight,
  Ticket,
  Coins,
  Gift,
  Gamepad2,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminMeAPI } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** Human-readable game names, in the fixed order the backend returns. */
const GAME_NAMES: Record<string, string> = {
  niftyUpDown: "Nifty Up/Down",
  btcUpDown: "BTC Up/Down",
  niftyNumber: "Nifty Number",
  btcNumber: "BTC Number",
  niftyBracket: "Nifty Bracket",
  niftyJackpot: "Nifty Jackpot",
  btcJackpot: "BTC Jackpot",
};

const gameName = (key: string) => GAME_NAMES[key] ?? key;

type PerGame = {
  game_key: string;
  tickets: number;
  gross_revenue: number;
  payouts: number;
  house_net: number;
};

type PerAdmin = {
  user_code: string;
  full_name: string;
  commission_earned: number;
  held: number;
  released: number;
};

type Totals = {
  total_tickets: number;
  total_revenue: number;
  total_payouts: number;
  house_net: number;
};

export default function HousePage() {
  const { data } = useQuery({
    queryKey: ["admin", "me", "house-summary"],
    queryFn: () => AdminMeAPI.houseSummary(),
    refetchInterval: 15000,
  });

  const { data: breakdown, isLoading: bdLoading } = useQuery({
    queryKey: ["admin", "me", "games-breakdown"],
    queryFn: () => AdminMeAPI.gamesBreakdown(),
    refetchInterval: 30000,
  });

  const gamesNet = Number(data?.games_net ?? 0);
  const pending = Number(data?.pending_hierarchy_releases ?? 0);

  const perGame: PerGame[] = breakdown?.per_game ?? [];
  const perAdmin: PerAdmin[] = breakdown?.per_admin ?? [];
  const totals: Totals = breakdown?.totals ?? {
    total_tickets: 0,
    total_revenue: 0,
    total_payouts: 0,
    house_net: 0,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="House / Games P&L"
        description="The super-admin house pool at a glance — games revenue, hierarchy commission, and platform dues."
      />

      {/* Hero: house wallet + games net */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden border-primary/30">
          <CardContent className="relative p-5">
            <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-primary/10 blur-3xl" />
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Landmark className="size-5" /></span>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">House wallet balance</div>
            </div>
            <div className="mt-3 text-3xl font-bold tabular-nums text-primary sm:text-4xl">
              {formatINR(data?.house_wallet_balance ?? 0)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Live cash in your super-admin main wallet right now — it pays every game win and
              receives every stake. It also moves when you fund admins/brokers, so it won&apos;t
              equal the lifetime &ldquo;Games net&rdquo; on the right.
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="relative p-5">
            <span aria-hidden className={cn("pointer-events-none absolute -right-10 -top-10 size-40 rounded-full blur-3xl", gamesNet >= 0 ? "bg-buy/10" : "bg-sell/10")} />
            <div className="flex items-center gap-2">
              <span className={cn("grid size-9 place-items-center rounded-lg", gamesNet >= 0 ? "bg-buy/15 text-buy" : "bg-sell/15 text-sell")}>
                <Dice5 className="size-5" />
              </span>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Games net (house)</div>
            </div>
            <div className={cn("mt-3 flex items-center gap-2 text-3xl font-bold tabular-nums sm:text-4xl", gamesNet >= 0 ? "text-buy" : "text-sell")}>
              {gamesNet >= 0 ? <TrendingUp className="size-6" /> : <TrendingDown className="size-6" />}
              {formatINR(Math.abs(gamesNet))}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Stakes collected − wins funded (lifetime). {gamesNet >= 0 ? "House is up." : "House is down."}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending hierarchy releases (games commission held for admins/brokers) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className={cn("overflow-hidden", pending > 0 && "border-amber-500/40")}>
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400"><Clock className="size-5" /></span>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Pending hierarchy releases</div>
            </div>
            <div className="mt-3 text-2xl font-bold tabular-nums">{formatINR(pending)}</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3.5" /> held by {data?.pending_release_holders ?? 0} admin/broker(s)
            </div>
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link href="/games/earnings">Review &amp; release <ArrowRight className="size-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ─── Games revenue breakdown ─── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Gamepad2 className="size-4" /></span>
          <div>
            <h2 className="text-base font-semibold leading-none">Games revenue breakdown</h2>
            <p className="mt-1 text-xs text-muted-foreground">Tickets, revenue and payouts by game — plus each admin&apos;s commission cut.</p>
          </div>
        </div>

        {/* Totals strip */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MiniStat
            icon={<Ticket className="size-4" />}
            label="Total tickets sold"
            value={totals.total_tickets.toLocaleString("en-IN")}
          />
          <MiniStat
            icon={<Coins className="size-4" />}
            label="Total revenue"
            value={formatINR(totals.total_revenue)}
          />
          <MiniStat
            icon={<Gift className="size-4" />}
            label="Total payouts"
            value={formatINR(totals.total_payouts)}
          />
          <MiniStat
            icon={totals.house_net >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
            label="House net"
            value={formatINR(Math.abs(totals.house_net))}
            valueClassName={totals.house_net >= 0 ? "text-buy" : "text-sell"}
          />
        </div>

        {/* Per-game */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Revenue by game</CardTitle>
            <CardDescription>Gross revenue, payouts and net for each of the 7 games.</CardDescription>
          </CardHeader>
          <CardContent>
            {bdLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : perGame.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No games data yet.</div>
            ) : (
              <>
                {/* Mobile: stacked cards */}
                <div className="space-y-2 md:hidden">
                  {perGame.map((g) => (
                    <div key={g.game_key} className="rounded-xl border border-border/60 bg-card p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{gameName(g.game_key)}</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Ticket className="size-3.5" /> {g.tickets.toLocaleString("en-IN")}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 border-t border-border/50 pt-2 text-right">
                        <div className="text-left">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Gross</div>
                          <div className="text-sm tabular-nums">{formatINR(g.gross_revenue)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Payouts</div>
                          <div className="text-sm tabular-nums">{formatINR(g.payouts)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Net</div>
                          <div className={cn("text-sm font-bold tabular-nums", g.house_net >= 0 ? "text-buy" : "text-sell")}>
                            {formatINR(g.house_net)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop: table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Game</th>
                        <th className="py-2 pr-3 text-right font-medium">Tickets sold</th>
                        <th className="py-2 pr-3 text-right font-medium">Gross revenue</th>
                        <th className="py-2 pr-3 text-right font-medium">Payouts</th>
                        <th className="py-2 text-right font-medium">House net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perGame.map((g) => (
                        <tr key={g.game_key} className="border-b border-border/50 last:border-0">
                          <td className="py-2 pr-3 font-medium">{gameName(g.game_key)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{g.tickets.toLocaleString("en-IN")}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatINR(g.gross_revenue)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatINR(g.payouts)}</td>
                          <td className={cn("py-2 text-right font-bold tabular-nums", g.house_net >= 0 ? "text-buy" : "text-sell")}>
                            {formatINR(g.house_net)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Per-admin commission */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Commission by admin</CardTitle>
            <CardDescription>How much of the games revenue each admin/broker earned via the hierarchy.</CardDescription>
          </CardHeader>
          <CardContent>
            {bdLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : perAdmin.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No commission earned yet.</div>
            ) : (
              <>
                {/* Mobile: stacked cards */}
                <div className="space-y-2 md:hidden">
                  {perAdmin.map((a, i) => (
                    <div key={`${a.user_code}-${i}`} className="rounded-xl border border-border/60 bg-card p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold">{a.full_name || "—"}</div>
                          <div className="text-[11px] font-medium text-muted-foreground">{a.user_code}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Earned</div>
                          <div className="text-sm font-bold tabular-nums text-primary">{formatINR(a.commission_earned)}</div>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border/50 pt-2">
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Held</div>
                          <div className="text-sm tabular-nums text-amber-600 dark:text-amber-400">{formatINR(a.held)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Released</div>
                          <div className="text-sm tabular-nums text-buy">{formatINR(a.released)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop: table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Admin</th>
                        <th className="py-2 pr-3 text-right font-medium">Commission earned</th>
                        <th className="py-2 pr-3 text-right font-medium">Held</th>
                        <th className="py-2 text-right font-medium">Released</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perAdmin.map((a, i) => (
                        <tr key={`${a.user_code}-${i}`} className="border-b border-border/50 last:border-0">
                          <td className="py-2 pr-3">
                            <div className="font-medium">{a.full_name || "—"}</div>
                            <div className="text-[11px] text-muted-foreground">{a.user_code}</div>
                          </td>
                          <td className="py-2 pr-3 text-right font-bold tabular-nums text-primary">{formatINR(a.commission_earned)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-amber-600 dark:text-amber-400">{formatINR(a.held)}</td>
                          <td className="py-2 text-right tabular-nums text-buy">{formatINR(a.released)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lifetime commission rollup */}
      <Card>
        <CardHeader>
          <CardTitle>Hierarchy commission (lifetime)</CardTitle>
          <CardDescription>Total games commission accrued to admins/brokers vs. how much you&apos;ve released.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Earned (accrued)</div>
            <div className="mt-1 text-lg font-bold tabular-nums">{formatINR(data?.lifetime_hierarchy_commission ?? 0)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Released to main</div>
            <div className="mt-1 text-lg font-bold tabular-nums text-buy">{formatINR(data?.lifetime_hierarchy_released ?? 0)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Still held</div>
            <div className="mt-1 text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">{formatINR(pending)}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {icon} {label}
        </div>
        <div className={cn("mt-1 text-base font-bold tabular-nums", valueClassName)}>{value}</div>
      </CardContent>
    </Card>
  );
}
