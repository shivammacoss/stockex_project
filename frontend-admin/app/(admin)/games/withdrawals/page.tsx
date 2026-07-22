"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdminGamesAPI } from "@/lib/api";

export default function GamesWithdrawalsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin", "games", "withdrawals"],
    queryFn: () => AdminGamesAPI.withdrawals("PENDING"),
    refetchInterval: 5000,
  });

  const approve = useMutation({
    mutationFn: (id: string) => AdminGamesAPI.approveWithdrawal(id),
    onSuccess: () => {
      toast.success("Approved — moved to main wallet");
      qc.invalidateQueries({ queryKey: ["admin", "games", "withdrawals"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });
  const reject = useMutation({
    mutationFn: (id: string) => AdminGamesAPI.rejectWithdrawal(id, "Rejected by admin"),
    onSuccess: () => {
      toast.success("Rejected");
      qc.invalidateQueries({ queryKey: ["admin", "games", "withdrawals"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Games Withdrawals"
        description="Approve or reject games-wallet → main-wallet transfer requests."
      />
      <Card>
        <CardContent className="space-y-1 p-4">
          {(data || []).length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">No pending requests.</div>
          )}
          {(data || []).map((r: any) => (
            <div key={r.id} className="flex items-center justify-between border-b border-border/60 py-3 last:border-0">
              <div className="min-w-0">
                <div className="font-semibold tabular-nums">🪙{Number(r.amount).toLocaleString("en-IN")}</div>
                <div className="text-xs text-muted-foreground">
                  User {r.user_id} · {new Date(r.created_at).toLocaleString("en-IN")}
                </div>
                {r.user_remark && <div className="text-xs text-muted-foreground">"{r.user_remark}"</div>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => reject.mutate(r.id)} disabled={reject.isPending}>
                  Reject
                </Button>
                <Button size="sm" onClick={() => approve.mutate(r.id)} disabled={approve.isPending}>
                  Approve
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
