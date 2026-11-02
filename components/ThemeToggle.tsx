"use client";

import { useEffect, useState } from "react";
import {
  THEME_STORAGE_KEY,
  nextTheme,
  parseTheme,
  themeToggleLabel,
  type Theme,
} from "@/lib/theme";

/**
 * Light/dark toggle (ClipForge Phase 7).
 *
 * The layout's inline script already applied the stored theme before
 * paint, so this component only syncs state with it and toggles on
 * click. Dark mode covers the site chrome, the marketing homepage,
 * and the tool page shell; the video workspace itself stays light on
 * purpose (accurate color preview while editing).
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  // Syncs the toggle label with the theme the layout script already
  // applied pre-paint. Deferred past commit so the mount sync does
  // not cascade renders during the commit phase.
  useEffect(() => {
    queueMicrotask(() => {
      const stored = parseTheme(
        window.localStorage.getItem(THEME_STORAGE_KEY),
      );
      if (stored) {
        setTheme(stored);
        document.documentElement.classList.toggle("dark", stored === "dark");
      }
    });
  }, []);

  const toggle = () => {
    const next = nextTheme(theme);
    setTheme(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={themeToggleLabel(theme)}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
    </button>
  );
}
