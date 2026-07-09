// Lightweight platform detection for routing decisions.
//
// The wallet "Trade" button routes differently by surface (user request):
//   • Desktop WEB browser  → the full Trading Terminal (chart + order panel +
//     blotter) — that layout is desktop-first (`lg:` grid).
//   • Mobile APP webview / phone browser → the Market (watchlist) page, whose
//     instrument chips + trade card are the mobile-friendly flow.
//
// We treat it as "desktop web" only when ALL of these hold: a non-mobile
// user-agent, a wide viewport, and a fine (mouse) pointer. Anything else —
// the Android/iOS in-app webview, a phone browser, a tablet — is "not desktop"
// and gets the Market page.

export function isDesktopWeb(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = (navigator.userAgent || "").toLowerCase();
  // Android system WebView ("; wv)"), phones, tablets, and generic "mobile".
  const mobileUa = /android|iphone|ipad|ipod|mobile|; wv\)/.test(ua);
  const wide = window.matchMedia?.("(min-width: 1024px)")?.matches ?? true;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  return !mobileUa && wide && !coarsePointer;
}
