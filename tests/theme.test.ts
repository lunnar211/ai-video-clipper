import { describe, expect, it } from "vitest";
import {
  nextTheme,
  parseTheme,
  themeToggleLabel,
} from "@/lib/theme";

describe("parseTheme", () => {
  it("accepts light and dark", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
  });

  it("rejects anything else (tampered storage falls back to light)", () => {
    expect(parseTheme("DARK")).toBeNull();
    expect(parseTheme("")).toBeNull();
    expect(parseTheme(null)).toBeNull();
    expect(parseTheme(undefined)).toBeNull();
    expect(parseTheme(42)).toBeNull();
    expect(parseTheme({})).toBeNull();
  });
});

describe("nextTheme / themeToggleLabel", () => {
  it("toggles between light and dark", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
  });

  it("labels the action, not the current state", () => {
    expect(themeToggleLabel("light")).toBe("Switch to dark mode");
    expect(themeToggleLabel("dark")).toBe("Switch to light mode");
  });
});
