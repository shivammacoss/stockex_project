"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gamepad2, GitBranch, Power, Save, Wrench } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminGamesAPI, AdminReferralAPI } from "@/lib/api";
import { cn } from "@/lib/utils";

const GAME_LABELS: Record<string, string> = {
  niftyUpDown: "Nifty Up/Down",
  btcUpDown: "BTC Up/Down",
  niftyNumber: "Nifty Number",
  btcNumber: "BTC Number",
  niftyBracket: "Nifty Bracket",
  niftyJackpot: "Nifty Jackpot",
  btcJackpot: "BTC Jackpot",
};

// Field group keys — used purely to organise the inputs into headed sections
// inside a GameCard. The save mutation still iterates the flat GAME_FIELDS.
type GroupKey = "core" | "commission";

// The levers we surface for editing per game (the rest stay at their defaults
// and can be added later). Numbers are edited as strings then coerced on save.
const GAME_FIELDS: { key: string; label: string; group: GroupKey; type?: "bool" }[] = [
  { key: "win_multiplier", label: "Win multiplier", group: "core" },
  { key: "ticket_price", label: "Ticket price (₹)", group: "core" },
  { key: "min_tickets", label: "Min tickets", group: "core" },
  { key: "max_tickets", label: "Max tickets", group: "core" },
  { key: "fixed_profit", label: "Winning amount (₹, number games)", group: "core" },
  { key: "top_winners", label: "Top winners (jackpot)", group: "core" },
  // Up/Down uses start/end_time; Number/Bracket/Jackpot use bidding_* + result.
  { key: "start_time", label: "Betting start — up/down (HH:MM:SS)", group: "core" },
  { key: "end_time", label: "Betting end — up/down (HH:MM:SS)", group: "core" },
  { key: "bidding_start_time", label: "Bidding start — number/bracket/jackpot", group: "core" },
  { key: "bidding_end_time", label: "Bidding end — number/bracket/jackpot", group: "core" },
  { key: "result_time", label: "Result time (HH:MM:SS)", group: "core" },
  // ── Commission & referral — flat % of the gross WINNING amount ───────
  { key: "admin_profit_pct", label: "Admin %  (of winning amount)", group: "commission" },
  { key: "broker_profit_pct", label: "Broker %  (of winning amount)", group: "commission" },
  { key: "sub_broker_profit_pct", label: "Sub-broker %  (of winning amount)", group: "commission" },
  { key: "referrer_profit_pct", label: "Referrer %  (client who shared the code)", group: "commission" },
  { key: "referrer_first_win_only", label: "Referrer paid once per game?", group: "commission", type: "bool" },
];

// Presentation-only grouping metadata: heading, help line and icon per section.
const FIELD_GROUPS: { key: GroupKey; title: string; hint: string; icon: typeof Gamepad2 }[] = [
  {
    key: "core",
    title: "Core",
    hint: "Win / ticket economics, tail limits and the daily timing windows.",
    icon: Gamepad2,
  },
  {
    key: "commission",
    title: "Commission & referral — % of winning amount",
    hint: "On every win, each level gets its % of the FULL winning amount (payout/prize — NOT win − stake), funded from the house. e.g. ₹600 ticket → ₹1000 win → Sub-broker gets [Sub-broker%] of ₹1000, Admin gets [Admin%] of ₹1000, referral [Referrer%] of ₹1000.",
    icon: GitBranch,
  },
];

function GameCard({ gameKey, cfg }: { gameKey: string; cfg: any }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    const f: Record<string, string> = {};
    for (const { key } of GAME_FIELDS) f[key] = String(cfg?.[key] ?? "");
    setForm(f);
  }, [cfg]);

  const save = useMutation({
    mutationFn: () => {
      const body: any = {};
      for (const { key, type } of GAME_FIELDS) {
        const raw = form[key];
        if (raw === "" || raw == null) continue;
        // Bool → true/false; time fields stay strings; everything else numeric.
        body[key] = type === "bool" ? raw === "true" : key.endsWith("_time") ? raw : Number(raw);
      }
      return AdminGamesAPI.updateGame(gameKey, body);
    },
    onSuccess: () => {
      toast.success(`${GAME_LABELS[gameKey]} updated`);
      qc.invalidateQueries({ queryKey: ["admin", "games", "settings"] });
    },
    onError: (e: any) => toast.error(e?.message || "Save failed"),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => AdminGamesAPI.toggleGame(gameKey, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "games", "settings"] });
    },
  });

  const disabled = cfg?.enabled === false;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Gamepad2 className="size-4 shrink-0 text-primary" />
            <span className="truncate">{GAME_LABELS[gameKey] || gameKey}</span>
          </CardTitle>
          <CardDescription className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-block size-1.5 rounded-full",
                disabled ? "bg-muted-foreground" : "bg-primary"
              )}
            />
            {disabled ? "Disabled" : "Enabled"}
          </CardDescription>
        </div>
        <Button
          variant={disabled ? "outline" : "destructive"}
          size="sm"
          loading={toggle.isPending}
          onClick={() => toggle.mutate(disabled)}
        >
          <Power className="size-4" />
          {disabled ? "Enable" : "Disable"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {FIELD_GROUPS.map(({ key: groupKey, title, hint, icon: Icon }) => {
          const fields = GAME_FIELDS.filter((f) => f.group === groupKey);
          if (fields.length === 0) return null;
          return (
            <section key={groupKey} className="space-y-3">
              <div className="space-y-0.5 border-b border-border pb-2">
                <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground">
                  <Icon className="size-3.5 text-primary" />
                  {title}
                </h4>
                <p className="text-[11px] text-muted-foreground">{hint}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {fields.map(({ key, label, type }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    {type === "bool" ? (
                      <select
                        value={form[key] === "false" ? "false" : "true"}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="true">Once per game (first win)</option>
                        <option value="false">Every win</option>
                      </select>
                    ) : (
                      <Input
                        value={form[key] ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        <div className="flex justify-end pt-1">
          <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
            <Save className="size-4" />
            Save {GAME_LABELS[gameKey]}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function GameSettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin", "games", "settings"],
    queryFn: () => AdminGamesAPI.settings(),
  });

  const toggleAll = useMutation({
    mutationFn: (enabled: boolean) => AdminGamesAPI.toggleAll(enabled),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin", "games", "settings"] });
    },
  });
  const maintenance = useMutation({
    mutationFn: (on: boolean) => AdminGamesAPI.setMaintenance({ maintenance_mode: on }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin", "games", "settings"] });
    },
  });

  const games = data?.games || {};

  return (
    <div className="space-y-6">
      <PageHeader
        title="Game Settings"
        description="Configure the prediction games — multipliers, ticket prices, limits and timing windows."
        actions={
          <>
            <Button
              variant="outline"
              loading={toggleAll.isPending}
              onClick={() => toggleAll.mutate(!(data?.games_enabled))}
            >
              <Power className="size-4" />
              {data?.games_enabled ? "Disable all games" : "Enable all games"}
            </Button>
            <Button
              variant={data?.maintenance_mode ? "default" : "outline"}
              loading={maintenance.isPending}
              onClick={() => maintenance.mutate(!data?.maintenance_mode)}
            >
              <Wrench className="size-4" />
              {data?.maintenance_mode ? "Exit maintenance" : "Maintenance mode"}
            </Button>
          </>
        }
      />

      <ReferralEligibilityCard />

      <div className="grid gap-4">
        {Object.keys(GAME_LABELS).map((k) => (
          <GameCard key={k} gameKey={k} cfg={games[k]} />
        ))}
      </div>
    </div>
  );
}

/** SUPER_ADMIN sets the referral payout threshold gate (shared by games +
 *  trading referral). A referral only pays once the referred user's subtree
 *  has earned the house at least this much. */
function ReferralEligibilityCard() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin", "referral", "eligibility"],
    queryFn: () => AdminReferralAPI.eligibility(),
  });
  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!data) return;
    setForm({
      enabled: data.enabled ? "1" : "0",
      threshold_amount: String(data.threshold_amount ?? ""),
      threshold_unit: data.threshold_unit ?? "PER_CRORE",
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      AdminReferralAPI.updateEligibility({
        enabled: form.enabled === "1",
        threshold_amount: Number(form.threshold_amount),
        threshold_unit: form.threshold_unit,
      }),
    onSuccess: () => {
      toast.success("Referral eligibility updated");
      qc.invalidateQueries({ queryKey: ["admin", "referral", "eligibility"] });
    },
    onError: (e: any) => toast.error(e?.message || "Save failed"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="size-4 text-primary" />
          Referral payout gate
        </CardTitle>
        <CardDescription>
          A referral reward is only paid once the referred user&apos;s subtree has earned the house
          at least the threshold. Applies to games + trading referral.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Enabled (1/0)</Label>
            <Input
              value={form.enabled ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">Set 1 to enforce the gate, 0 to pay referrals immediately.</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Threshold amount</Label>
            <Input
              value={form.threshold_amount ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, threshold_amount: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">House earnings the subtree must clear first.</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Unit (PER_CRORE / ABSOLUTE)</Label>
            <Input
              value={form.threshold_unit ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, threshold_unit: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">How the threshold amount is measured.</p>
          </div>
        </div>
        <div className="flex justify-end border-t border-border pt-3">
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            <Save className="size-4" />
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
