"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CategoryChips } from "@/components/admin/netting/CategoryChips";
import { SegmentMatrix } from "@/components/admin/netting/SegmentMatrix";

/** SUPER-ADMIN edits ONE admin's segment settings (at create or anytime via the
 *  sub-admin 3-dot menu). The admin can only TIGHTEN these vs the super-admin's
 *  ceiling; brokerage stays a floor. */
export function SubAdminSegmentDialog({
  open,
  onOpenChange,
  adminId,
  adminName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  adminId: string | null;
  adminName?: string;
}) {
  const [category, setCategory] = useState("lot");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Segment settings · {adminName || "Admin"}</DialogTitle>
          <DialogDescription>
            Set this admin&apos;s per-segment limits. They can only TIGHTEN these (never exceed
            your ceiling); brokerage they charge stays ≥ yours.
          </DialogDescription>
        </DialogHeader>
        {adminId && (
          <div className="space-y-3">
            <CategoryChips value={category} onChange={setCategory} />
            <SegmentMatrix categoryId={category} subAdminId={adminId} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
