"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, MapPin, Check, Building2 } from "lucide-react";
import { BrokerSearchAPI, type BrokerOption } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Searchable broker directory (used at signup + in the profile broker-switch).
 * Debounced place/name search → public `GET /user/auth/brokers`. Mobile-first.
 */
export function BrokerPicker({
  value,
  onSelect,
}: {
  value?: string | null;
  onSelect: (b: BrokerOption) => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ["broker-search", debounced],
    queryFn: () => BrokerSearchAPI.search(debounced),
    staleTime: 30_000,
  });
  const brokers = data || [];

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search broker by city or name…"
          className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary"
        />
      </div>
      <div className="max-h-64 space-y-1.5 overflow-y-auto overscroll-contain rounded-xl border border-border/60 bg-card/40 p-1.5">
        {isLoading && <div className="py-6 text-center text-xs text-muted-foreground">Searching…</div>}
        {!isLoading && brokers.length === 0 && (
          <div className="py-6 text-center text-xs text-muted-foreground">
            {debounced ? `No brokers found for "${debounced}".` : "Type a city or broker name to search."}
          </div>
        )}
        {brokers.map((b) => {
          const active = value === b.id;
          return (
            <button
              type="button"
              key={b.id}
              onClick={() => onSelect(b)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
                active ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted/50",
              )}
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <Building2 className="size-3.5 shrink-0 text-primary" />
                  <span className="truncate text-sm font-bold">{b.full_name}</span>
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  {b.city && (
                    <span className="inline-flex items-center gap-0.5">
                      <MapPin className="size-3" /> {b.city}
                    </span>
                  )}
                  <span className="font-mono">{b.user_code}</span>
                  {b.admin_name && <span>· {b.admin_name}</span>}
                </span>
              </span>
              {active && <Check className="size-4 shrink-0 text-primary" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
