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
      className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground transition-colors duration-200 hover:bg-muted"
    >
      {/* Inline SVG sun/moon (stroke 2px, one icon family): emojis are
          never used as icons — they render inconsistently and cannot
          be themed. The icons are decorative; the visible text + the
          aria-label carry the meaning. */}
      {theme === "dark" ? (
        <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      )}
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
