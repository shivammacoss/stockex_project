"use client";

// Shim over next-themes (already provided at the app root) that exposes the
// same API the ported Stockex landing components expect.
import { useTheme as useNextTheme } from "next-themes";

export function useTheme() {
  const { theme, resolvedTheme, setTheme } = useNextTheme();
  const active = resolvedTheme || theme || "light";
  const isDark = active === "dark";
  return {
    theme: active,
    isDark,
    toggleTheme: () => setTheme(isDark ? "light" : "dark"),
    setDarkTheme: () => setTheme("dark"),
    setLightTheme: () => setTheme("light"),
    setTheme,
  };
}

// next-themes provider lives at the app root, so this is a pass-through.
export function ThemeProvider({ children }) {
  return children;
}

export default ThemeProvider;
