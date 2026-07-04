"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, GitBranch, Save, X } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPattiAPI, UsersAPI } from "@/lib/api";

const SEGMENTS: { key: string; label: string }[] = [
  { key: "ALL", label: "All segments (fallback)" },
  { key: "trading", label: "NSE / BSE" },
  { key: "mcx", label: "MCX" },
  { key: "crypto", label: "Crypto" },
  { key: "forex", label: "Forex" },
];

export default function PattiPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [member, setMember] = useState<any | null>(null);

  const { data: search } = useQuery({
    queryKey: ["admin", "patti", "search", query],
    queryFn: () => UsersAPI.list({ q: query, page_size: 8 }),
    enabled: query.trim().length >= 2,
  });

  const { data: cfg } = useQuery({
    queryKey: ["admin", "patti", member?.id],
    queryFn: () => AdminPattiAPI.get(member.id),
    enabled: !!member,
  });

  const [enabled, setEnabled] = useState(false);
  const [rows, setRows] = useState<Record<string, { pnl: string; brok: string }>>({});

  useEffect(() => {
    if (!cfg) return;
    setEnabled(!!cfg.enabled);
    const r: Record<string, { pnl: string; brok: string }> = {};
    for (const { key } of SEGMENTS) {
      const s = cfg.segments?.[key];
      r[key] = { pnl: String(s?.pnl_pct ?? ""), brok: String(s?.brokerage_pct ?? "") };
    }
    setRows(r);
  }, [cfg]);

  const save = useMutation({
    mutationFn: () => {
      const segments: Record<string, { pnl_pct: number; brokerage_pct: number }> = {};
      for (const { key } of SEGMENTS) {
        const r = rows[key];
        const pnl = Number(r?.pnl || 0);
        const brok = Number(r?.brok || 0);
        if (pnl > 0 || brok > 0) segments[key] = { pnl_pct: pnl, brokerage_pct: brok };
      }
      return AdminPattiAPI.set(member.id, { enabled, segments });
    },
    onSuccess: () => {
      toast.success("Patti config saved");
      qc.invalidateQueries({ queryKey: ["admin", "patti", member?.id] });
    },
    onError: (e: any) => toast.error(e?.message || "Save failed"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Patti Sharing"
        description="Cascade a user's trading result up the admin hierarchy in real time (house-funded). Opt-in per member — keep OFF where the weekly P&L-sharing agreement is used, to avoid double-counting."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GitBranch className="size-4 text-primary" /> Configure member</CardTitle>
          <CardDescription>Pick an admin / broker / sub-broker, then set their per-segment share.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* member search */}
          <div className="space-y-1.5">
            <Label>Search member</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setMember(null); }}
                placeholder="code / name (min 2 chars)"
                className="pl-9"
              />
            </div>
            {query.trim().length >= 2 && !member && (
              <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-muted/10">
                {(search?.items ?? []).length === 0 ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground">No matches.</div>
                ) : (
                  search?.items
                    .filter((u: any) => ["ADMIN", "BROKER", "SUPER_ADMIN"].includes(u.role))
                    .map((u: any) => (
                      <button key={u.id} type="button" onClick={() => setMember(u)}
                        className="flex w-full items-center justify-between border-b border-border/40 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-muted/30">
                        <span><span className="font-mono">{u.user_code}</span><span className="ml-2 text-muted-foreground">{u.full_name}</span></span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{u.role}</span>
                      </button>
                    ))
                )}
              </div>
            )}
            {member && (
              <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
                <span><span className="font-mono font-semibold">{member.user_code}</span> · {member.full_name} · {member.role}</span>
                <Button variant="ghost" size="icon" onClick={() => { setMember(null); setQuery(""); }}><X className="size-3" /></Button>
              </div>
            )}
          </div>

          {/* config */}
          {member && (
            <div className="space-y-4 border-t border-border pt-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4" />
                <span className="font-semibold">Patti enabled for this member&apos;s subtree</span>
              </label>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Segment</th>
                      <th className="py-2 pr-3 font-medium">P&amp;L share %</th>
                      <th className="py-2 font-medium">Brokerage share %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SEGMENTS.map(({ key, label }) => (
                      <tr key={key} className="border-b border-border/50 last:border-0">
                        <td className="py-2 pr-3">{label}</td>
                        <td className="py-2 pr-3">
                          <Input className="h-8 w-24" value={rows[key]?.pnl ?? ""} onChange={(e) => setRows((r) => ({ ...r, [key]: { ...r[key], pnl: e.target.value } }))} placeholder="0" />
                        </td>
                        <td className="py-2">
                          <Input className="h-8 w-24" value={rows[key]?.brok ?? ""} onChange={(e) => setRows((r) => ({ ...r, [key]: { ...r[key], brok: e.target.value } }))} placeholder="0" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Each % is this node&apos;s <strong>gross share of the full house pool</strong> (house gains a user&apos;s loss, funded from the super-admin house). In a multi-level chain a node <strong>nets</strong> its own % minus the nearest downline&apos;s % (e.g. sub-broker 30, broker 50, admin 70 → sub keeps 30, broker 20, admin 20, SA the rest) — so set them <strong>cumulatively</strong> up the chain and the total never exceeds 100%. The share is shared <strong>both ways</strong>: on a user profit the chain is debited (partners share the downside). Segment-specific rows override the &quot;All segments&quot; fallback.
              </p>

              <div className="flex justify-end">
                <Button loading={save.isPending} onClick={() => save.mutate()}><Save className="size-4" /> Save patti config</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
