"use client";

// Minimal stub — the ported landing does not use the shadcn toaster; this
// only satisfies the import in components/landing/ui/toaster.jsx if it is
// ever pulled into the bundle. Real toasts in this app use `sonner`.
export function useToast() {
  return { toast: () => {}, dismiss: () => {}, toasts: [] };
}

export const toast = () => {};
