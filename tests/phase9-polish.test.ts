/**
 * Phase 9 polish pins (ui-ux-pro-max design system).
 *
 * These tests pin the visual contract, not pixel output: the persisted
 * design system exists with the chosen palette, the token CSS is in
 * place (light + dark values, focus-visible rule, reduced-motion
 * rule), and the pages touched by the polish use tokens instead of
 * the old violet/slate palette. They read source files because the
 * contract lives in classes and CSS, not in runtime behavior.
 */
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

// Emoji ranges (pictographs, dingbats, emoticons): the skill forbids
// emojis as structural icons, so the toggle must not contain any.
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

describe("phase 9 design system", () => {
  it("persists a MASTER.md with the chosen palette and font", () => {
    const master = "design-system/ai-video-clipper/MASTER.md";
    expect(existsSync(master)).toBe(true);
    const text = read(master);
    expect(text).toContain("#2563EB");
    expect(text).toContain("#EA580C");
    expect(text).toContain("Plus Jakarta Sans");
  });

  it("defines light + dark token values, focus-visible, reduced motion", () => {
    const css = read("app/globals.css");
    expect(css).toContain("@theme inline");
    expect(css).toContain("--color-primary: #2563eb");
    expect(css).toContain("--color-accent: #ea580c");
    expect(css).toContain(".dark {");
    expect(css).toContain("--color-background: #020617");
    expect(css).toContain("background-color: var(--color-background)");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("theme toggle uses SVG icons, never emojis", () => {
    const toggle = read("components/ThemeToggle.tsx");
    expect(toggle).not.toMatch(EMOJI_RE);
    expect(toggle).toContain("<svg");
    expect(toggle).toContain('aria-hidden="true"');
  });

  it("homepage uses tokens, not the old violet palette", () => {
    const home = read("app/page.tsx");
    expect(home).not.toContain("violet");
    expect(home).toContain("bg-accent");
    expect(home).toContain("text-primary");
    expect(home).toContain("min-h-[44px]");
  });

  it("tool shell uses tokens, not the old violet/slate buttons", () => {
    const tool = read("components/ClipperTool.tsx");
    expect(tool).not.toContain("violet");
    expect(tool).not.toContain("bg-slate-800");
    expect(tool).toContain("bg-primary");
    expect(tool).toContain("min-h-[44px]");
  });

  it("layout loads the design-system font and 44px nav targets", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain("Plus_Jakarta_Sans");
    expect(layout).toContain("min-h-[44px]");
  });
});
