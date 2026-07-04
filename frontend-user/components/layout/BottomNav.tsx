"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Gamepad2,
  Home,
  LineChart,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/marketwatch", label: "Market", icon: LineChart },
  // Games gets the prominent centre slot (highlighted).
  { href: "/games", label: "Games", icon: Gamepad2, highlight: true },
  // /positions is the unified blotter (Position / Active / Closed /
  // Cancelled / Rejected tabs).
  { href: "/positions", label: "Position", icon: Briefcase },
  { href: "/profile", label: "Profile", icon: User },
];

/**
 * Mobile-only bottom tab bar. Hidden ≥ md so the desktop sidebar is the
 * single nav surface there. Sits above the page in a translucent sticky
 * footer with safe-area padding.
 *
 * Edge-to-edge, full-width — the previous "compact pill" mode was
 * rejected by the user ("ye jo box ke andar rakh hai waisa mat rakh
 * yrr"). One consistent shape across every mobile route now.
 */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className={cn(
        // Solid bg (no backdrop-blur): a fixed full-width blur bar makes iOS
        // Safari re-composite the whole viewport every frame → the iPhone-only
        // scroll jank + slow route transitions. Solid is visually equivalent
        // and cheap. Android Chrome handled the blur fine; iOS does not.
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background",
        "md:hidden",
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {items.map((it) => {
          const active = pathname === it.href || pathname?.startsWith(it.href + "/");
          const Icon = it.icon;
          const highlight = (it as any).highlight;
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {highlight ? (
                  <span
                    className={cn(
                      "-mt-5 grid size-11 place-items-center rounded-2xl border-4 border-background shadow-lg shadow-primary/30 transition-transform",
                      active ? "bg-primary text-primary-foreground scale-105" : "bg-primary/90 text-primary-foreground",
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                ) : (
                  <Icon className={cn("size-5", active && "scale-110")} />
                )}
                <span className={cn("font-medium", highlight && "mt-0.5")}>{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
