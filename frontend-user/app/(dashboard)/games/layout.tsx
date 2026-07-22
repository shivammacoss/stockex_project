"use client";

import { useState } from "react";
import Link from "next/link";
import { Gamepad2, Plus, ArrowLeftRight, AlertTriangle, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCoins as formatINR } from "@/lib/games/coins";
import { useGamesSettings, useGamesWallet } from "@/components/games/useGames";
import { TransferDialog } from "@/components/games/TransferDialog";

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  const { data: settings } = useGamesSettings();
  const { data: wallet } = useGamesWallet();
  const [txIn, setTxIn] = useState(false);
  const [txOut, setTxOut] = useState(false);

  const maintenance = settings?.maintenance_mode || settings?.games_enabled === false;

  return (
    <div className="mx-auto w-full max-w-screen-xl p-3 pb-24 sm:p-6 md:pb-6">
      {/* Games sub-header — stacks cleanly on mobile, single row on ≥sm */}
      <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center">
        <Link href="/games" className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <Gamepad2 className="size-5" />
          </span>
          <span className="text-lg font-bold tracking-tight">Games</span>
        </Link>

        <div className="flex items-center gap-2 sm:ml-auto">
          {/* Coin balance — amber/atm coin accent so ◉ reads as a real
              "coins" balance, not just another 🪙 figure. */}
          <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-atm/30 bg-atm/5 px-3 py-1.5 sm:flex-none">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-atm/15 text-atm ring-1 ring-inset ring-atm/30">
              <Coins className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Games coins</div>
              {/* Shown in ◉ coins (not tickets) — each game has its own ticket
                  price, so a single "Tkt" count across games is misleading. */}
              <div className="text-base font-bold leading-tight tabular-nums text-atm">
                {formatINR(wallet?.balance ?? 0)}
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setTxOut(true)} className="shrink-0">
            <ArrowLeftRight className="size-4" />
            <span className="hidden xs:inline">To main</span>
          </Button>
          <Button size="sm" onClick={() => setTxIn(true)} className="shrink-0">
            <Plus className="size-4" />
            <span className="hidden xs:inline">Add coins</span>
          </Button>
        </div>
      </div>

      {maintenance && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-atm/30 bg-atm/10 px-3 py-2 text-sm text-atm">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{settings?.maintenance_message || "Games are temporarily unavailable."}</span>
        </div>
      )}

      {children}

      <TransferDialog open={txIn} onOpenChange={setTxIn} direction="in" />
      <TransferDialog open={txOut} onOpenChange={setTxOut} direction="out" />
    </div>
  );
}
