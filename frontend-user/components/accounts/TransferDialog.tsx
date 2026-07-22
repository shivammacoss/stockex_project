"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountsAPI, GamesAPI } from "@/lib/api";
import { WALLET_LABEL, SEGMENT_KINDS, type WalletKind } from "@/lib/wallets";

// The Games wallet is a SEPARATE system from the segment/main wallets — it only
// moves to/from MAIN (Main → Games is instant; Games → Main needs admin
// approval). We surface it here as a pseudo-kind so the user can top it up from
// the same "Move funds" dialog, but route it through the games API + constrain
// its pairing to MAIN.
type PickKind = WalletKind | "GAMES";
const ALL: PickKind[] = ["MAIN", ...SEGMENT_KINDS, "GAMES"];
const LABEL = (k: PickKind): string => (k === "GAMES" ? "Games" : WALLET_LABEL[k as WalletKind]);

export function TransferDialog({
  open,
  onOpenChange,
  defaultFrom = "MAIN",
  defaultTo = "NSE_BSE",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultFrom?: PickKind;
  defaultTo?: PickKind;
}) {
  const qc = useQueryClient();
  const [from, setFrom] = useState<PickKind>(defaultFrom);
  const [to, setTo] = useState<PickKind>(defaultTo);
  const [amount, setAmount] = useState("");

  // The dialog stays mounted (only `open` toggles), so re-sync the picked
  // wallets to the caller's defaults every time it opens — otherwise clicking
  // "Move" on a specific wallet (e.g. MCX) would keep the previous selection.
  useEffect(() => {
    if (open) {
      setFrom(defaultFrom);
      setTo(defaultTo);
    }
  }, [open, defaultFrom, defaultTo]);

  // Games only pairs with MAIN. Picking Games on one side forces the other to
  // Main; picking a segment while the other side is Games clears that Games.
  function pickFrom(k: PickKind) {
    setFrom(k);
    if (k === "GAMES") setTo("MAIN");
    else if (to === "GAMES" && k !== "MAIN") setTo("NSE_BSE");
  }
  function pickTo(k: PickKind) {
    setTo(k);
    if (k === "GAMES") setFrom("MAIN");
    else if (from === "GAMES" && k !== "MAIN") setFrom("NSE_BSE");
  }

  const involvesGames = from === "GAMES" || to === "GAMES";
  const gamesToMain = from === "GAMES" && to === "MAIN";
  const mainToGames = from === "MAIN" && to === "GAMES";

  const m = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (mainToGames) return GamesAPI.transferIn(amt);
      if (gamesToMain) return GamesAPI.withdraw(amt);
      return AccountsAPI.transfer(from as WalletKind, to as WalletKind, amt);
    },
    onSuccess: () => {
      toast.success("Transfer complete");
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["wallet-summary"] });
      qc.invalidateQueries({ queryKey: ["games", "wallet"] });
      setAmount("");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "Transfer failed"),
  });

  const Pick = ({
    value,
    onChange,
    exclude,
  }: {
    value: PickKind;
    onChange: (k: PickKind) => void;
    exclude: PickKind;
  }) => (
    <div className="flex flex-wrap gap-1.5">
      {ALL.map((k) => {
        // Games ↔ segment is not allowed — only Games ↔ Main. Disable the
        // combos that can't move so the picker can't produce an invalid pair.
        const gamesConflict =
          (k === "GAMES" && exclude !== "MAIN" && exclude !== "GAMES") ||
          (exclude === "GAMES" && k !== "MAIN" && k !== "GAMES");
        const disabled = k === exclude || gamesConflict;
        return (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => onChange(k)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              value === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
            } ${disabled ? "opacity-30" : ""}`}
          >
            {LABEL(k)}
          </button>
        );
      })}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move funds between wallets</DialogTitle>
          <DialogDescription>Only free balance (balance − used margin) can move.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">From</Label>
            <Pick value={from} onChange={pickFrom} exclude={to} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Pick value={to} onChange={pickTo} exclude={from} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="amt" className="text-xs">Amount (🪙)</Label>
            <Input id="amt" type="number" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {involvesGames && (
            <p className="rounded-md bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground">
              {mainToGames
                ? "Main → Games is instant — the amount is added to your Games wallet right away."
                : "Games → Main is instant. Only your free games balance moves — money locked in an active ticket stays until that game settles."}
            </p>
          )}
          <Button className="w-full" loading={m.isPending} disabled={m.isPending} onClick={() => m.mutate()}>
            Transfer {LABEL(from)} → {LABEL(to)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
