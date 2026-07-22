"use client";

import { useRef, useState } from "react";
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
import { GamesAPI } from "@/lib/api";

type Direction = "in" | "out";

export function TransferDialog({
  open,
  onOpenChange,
  direction,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  direction: Direction;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const idem = useRef<string>("");
  if (!idem.current) {
    idem.current =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  const isIn = direction === "in";

  const mutation = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!(amt > 0)) throw new Error("Enter a valid amount");
      return isIn ? GamesAPI.transferIn(amt) : GamesAPI.withdraw(amt);
    },
    onSuccess: () => {
      toast.success(
        isIn ? "Added to games wallet" : "Transferred to main wallet",
      );
      qc.invalidateQueries({ queryKey: ["games", "wallet"] });
      qc.invalidateQueries({ queryKey: ["games", "ledger"] });
      qc.invalidateQueries({ queryKey: ["wallet-summary"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      setAmount("");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "Transfer failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isIn ? "Add to games wallet" : "Send to main wallet"}</DialogTitle>
          <DialogDescription>
            {isIn
              ? "Instantly move money from your main trading wallet into your games wallet."
              : "Instantly move your free games balance back to the main wallet. Money locked in an active ticket stays in games until that game settles."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tx-amount">Amount (🪙)</Label>
            <Input
              id="tx-amount"
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            loading={mutation.isPending}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {isIn ? "Add funds" : "Transfer to main"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
