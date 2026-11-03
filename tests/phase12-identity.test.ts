/**
 * Phase 12 identity pins ("Ink + Record" professional identity).
 *
 * The owner judged the Phase 9 generic SaaS look as AI vibe-coded.
 * These tests pin the replacement: ink + record-red tokens, the
 * record-dot wordmark, the renamed professional headings, the
 * corrected copy (CC paste scope, 15–60s windows, no "link box"
 * wording anywhere), the token-only UI (no violet/slate leftovers),
 * and the legacy imports branch running real verification.
 * They read source files because the contract lives in classes,
 * CSS, and copy, not in runtime behavior.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("phase 12 identity tokens", () => {
  it("uses ink + record red, never the superseded blue/orange", () => {
    const css = read("app/globals.css");
    expect(css).toContain("--color-primary: #171717");
    expect(css).toContain("--color-accent: #dc2626");
    expect(css).toContain("--color-background: #fafaf9");
    expect(css).toContain("--color-primary: #fafafa");
    expect(css).toContain("--color-accent: #f87171");
    expect(css).toContain("--color-background: #0a0a0a");
    expect(css).not.toContain("#2563eb");
    expect(css).not.toContain("#ea580c");
  });

  it("wordmark carries the record dot, not an emoji or image", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain("bg-accent");
    expect(layout).toContain("rounded-full");
    expect(layout).toContain("AI Video Clipper");
  });
});

describe("phase 12 professional headings", () => {
  it("homepage uses the tightened headings, not the generic ones", () => {
    const home = read("app/page.tsx");
    expect(home).toContain("See it work");
    expect(home).not.toContain("See it work — for real");
    expect(home).toContain("What the clipper does");
    expect(home).not.toContain("Everything the clipper does, in one place");
    expect(home).toContain("Common questions");
    expect(home).not.toContain("Questions, answered honestly");
    expect(home).toContain("tracking-tight");
    expect(home).not.toContain("bg-gradient");
    expect(home).not.toContain("violet");
  });
});

describe("phase 12 corrected copy", () => {
  it("no 'link box' wording survives anywhere user-facing", () => {
    for (const path of [
      "lib/marketing.ts",
      "app/faq/page.tsx",
      "app/layout.tsx",
      "components/ClipperTool.tsx",
      "app/terms/page.tsx",
    ]) {
      const text = read(path);
      expect(text, path).not.toContain("no link box");
      expect(text, path).not.toContain("there is no link box");
    }
  });

  it("moment windows are 15–60s everywhere, not 30–60s", () => {
    for (const path of [
      "app/create/page.tsx",
      "app/how-it-works/page.tsx",
      "lib/ai/highlights.ts",
    ]) {
      const text = read(path);
      expect(text, path).toContain("15–60");
      expect(text, path).not.toContain("30–60");
    }
  });
});

describe("phase 12 token-only UI", () => {
  it("no violet/slate/raw-white classes remain in themed UI", () => {
    for (const path of [
      "app/admin/layout.tsx",
      "app/admin/users/[id]/page.tsx",
      "app/faq/page.tsx",
      "app/signin/page.tsx",
      "components/MetadataCard.tsx",
      "components/RightsConsent.tsx",
      "components/ClipEditor.tsx",
      "components/ClipperTool.tsx",
    ]) {
      const text = read(path);
      expect(text, path).not.toContain("violet");
      expect(text, path).not.toContain("slate-");
      expect(text, path).not.toContain("bg-white");
    }
  });
});

describe("phase 12 legacy imports branch", () => {
  it("routes caller-declared licences through real verification", () => {
    const route = read("app/api/imports/route.ts");
    expect(route).toContain("verifyCcUrl");
    expect(route).not.toContain("CC_ALLOWED_HOSTS");
    expect(route).not.toContain("assertAllowedFetchUrl");
    expect(route).toContain("verified");
    const index = read("lib/imports/index.ts");
    expect(index).not.toContain("CC_ALLOWED_HOSTS");
  });
});

describe("phase 12 design system", () => {
  it("MASTER.md documents the new identity and type scale", () => {
    const master = read("design-system/ai-video-clipper/MASTER.md");
    expect(master).toContain("Ink + Record");
    expect(master).toContain("Type scale");
    expect(master).toContain("#171717");
    expect(master).toContain("#DC2626");
  });
});
