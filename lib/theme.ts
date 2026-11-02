/**
 * Theme helpers (ClipForge Phase 7: dark mode).
 *
 * The stored value is validated against an allowlist — anything else
 * (including a tampered localStorage value) falls back to light. The
 * toggle component owns DOM/localStorage side effects; these helpers
 * are pure and unit-tested.
 */

export const THEME_STORAGE_KEY = "clipper-theme";

export type Theme = "light" | "dark";

/** Parse a stored theme value; unknown values return null (→ light). */
export function parseTheme(value: unknown): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}

/** The theme the toggle switches to. */
export function nextTheme(current: Theme): Theme {
  return current === "dark" ? "light" : "dark";
}

/** Accessible label for the toggle in its current state. */
export function themeToggleLabel(current: Theme): string {
  return current === "dark" ? "Switch to light mode" : "Switch to dark mode";
}
