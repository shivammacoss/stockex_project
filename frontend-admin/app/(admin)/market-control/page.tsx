"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { MarketControlAPI } from "@/lib/api";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";

type Row = { segment: string; label: string; enabled: boolean; open_time: string; close_time: string };

export default function MarketControlPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "market-control"],
    queryFn: () => MarketControlAPI.list(),
  });

  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setRows(data);
      setDirty(new Set());
    }
  }, [data]);

  function edit(seg: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.segment === seg ? { ...r, ...patch } : r)));
    setDirty((prev) => new Set(prev).add(seg));
  }

  async function saveAll() {
    setSaving(true);
    const changed = rows.filter((r) => dirty.has(r.segment));
    const results = await Promise.allSettled(
      changed.map((r) =>
        MarketControlAPI.set(r.segment, { enabled: r.enabled, open_time: r.open_time, close_time: r.close_time }),
      ),
    );
    const failed = results.filter((x) => x.status === "rejected").length;
    if (failed === 0) toast.success(`Saved ${changed.length} segment${changed.length === 1 ? "" : "s"}`);
    else toast.error(`${failed} of ${changed.length} didn't save`);
    await refetch();
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Market Control"
        description="Set each segment's trading hours. When ON, trading is allowed ONLY inside the window (IST) — including the 24×7 Crypto / Forex markets. Exits (closing a position) stay allowed."
        actions={
          <Button onClick={saveAll} disabled={dirty.size === 0} loading={saving}>
            Save {dirty.size > 0 ? `(${dirty.size})` : ""}
          </Button>
        }
      />

      {isLoading ? (
        <div className="rounded-lg border border-border p-8 text-center text-xs text-muted-foreground">Loading…</div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {rows.map((r) => (
              <div key={r.segment} className="rounded-xl border border-border/60 bg-card p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{r.label}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{r.segment}</div>
                  </div>
                  <Toggle on={r.enabled} onChange={(v) => edit(r.segment, { enabled: v })} />
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <TimeField label="Open" value={r.open_time} disabled={!r.enabled} onChange={(v) => edit(r.segment, { open_time: v })} />
                  <TimeField label="Close" value={r.close_time} disabled={!r.enabled} onChange={(v) => edit(r.segment, { close_time: v })} />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Segment</th>
                  <th className="px-3 py-2 text-left font-semibold">Control</th>
                  <th className="px-3 py-2 text-left font-semibold">Open (IST)</th>
                  <th className="px-3 py-2 text-left font-semibold">Close (IST)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.segment} className="border-t border-border/60">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.label}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{r.segment}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Toggle on={r.enabled} onChange={(v) => edit(r.segment, { enabled: v })} />
                        <span className={`text-xs font-semibold ${r.enabled ? "text-primary" : "text-muted-foreground"}`}>
                          {r.enabled ? "ON" : "OFF (default calendar)"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <TimeField value={r.open_time} disabled={!r.enabled} onChange={(v) => edit(r.segment, { open_time: v })} />
                    </td>
                    <td className="px-3 py-2">
                      <TimeField value={r.close_time} disabled={!r.enabled} onChange={(v) => edit(r.segment, { close_time: v })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}
      aria-pressed={on}
    >
      <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

function TimeField({
  label,
  value,
  disabled,
  onChange,
}: {
  label?: string;
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      {label && <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>}
      <div className="relative">
        <Clock className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="time"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none disabled:opacity-40"
        />
      </div>
    </div>
  );
}
