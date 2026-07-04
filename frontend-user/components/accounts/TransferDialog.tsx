"use client";

import { useState } from "react";
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
import { AccountsAPI } from "@/lib/api";
import { WALLET_LABEL, SEGMENT_KINDS, type WalletKind } from "@/lib/wallets";

const ALL: WalletKind[] = ["MAIN", ...SEGMENT_KINDS];

export function TransferDialog({
  open,
  onOpenChange,
  defaultFrom = "MAIN",
  defaultTo = "NSE_BSE",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultFrom?: WalletKind;
  defaultTo?: WalletKind;
}) {
  const qc = useQueryClient();
  const [from, setFrom] = useState<WalletKind>(defaultFrom);
  const [to, setTo] = useState<WalletKind>(defaultTo);
  const [amount, setAmount] = useState("");

  const m = useMutation({
    mutationFn: () => AccountsAPI.transfer(from, to, Number(amount)),
    onSuccess: () => {
      toast.success("Transfer complete");
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["wallet-summary"] });
      setAmount("");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "Transfer failed"),
  });

  const Pick = ({ value, onChange, exclude }: { value: WalletKind; onChange: (k: WalletKind) => void; exclude: WalletKind }) => (
    <div className="flex flex-wrap gap-1.5">
      {ALL.map((k) => (
        <button
          key={k}
          type="button"
          disabled={k === exclude}
          onClick={() => onChange(k)}
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            value === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
          } ${k === exclude ? "opacity-30" : ""}`}
        >
          {WALLET_LABEL[k]}
        </button>
      ))}
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
            <Pick value={from} onChange={setFrom} exclude={to} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Pick value={to} onChange={setTo} exclude={from} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="amt" className="text-xs">Amount (₹)</Label>
            <Input id="amt" type="number" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <Button className="w-full" loading={m.isPending} disabled={m.isPending} onClick={() => m.mutate()}>
            Transfer {WALLET_LABEL[from]} → {WALLET_LABEL[to]}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
