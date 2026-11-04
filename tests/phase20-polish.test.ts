/**
 * Phase 20 polish pins (professional redesign + device-friendly).
 *
 * The owner judged the site as still vibe-coded after Phase 12.
 * These tests pin the execution fixes, not a new identity: the
 * two-row scrollable nav (no phone wrap), the unified page-title
 * scale, the card treatment, the 44px touch rule for form controls
 * and action buttons, the phone-only 16px form text (no iOS zoom),
 * the responsive publish grids (the one proven phone overflow),
 * the single-<main> landmark shape, and the corrected FAQ output
 * formats (Phase 19 added 16:9 + 1:1). They read source files
 * because the contract lives in classes, CSS, and copy.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function allTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...allTsx(path));
    else if (path.endsWith(".tsx")) out.push(path);
  }
  return out;
}

describe("phase 20 navigation", () => {
  it("header is two rows with a scrollable link bar, not a wrapping row", () => {
    const layout = read("app/layout.tsx");
    expect(layout).not.toContain("flex-wrap items-center gap-4 px-4 py-3");
    expect(layout).toContain("overflow-x-auto");
    expect(layout).toContain("flex-nowrap");
    expect(layout).toContain('aria-label="Main"');
    for (const href of [
      "/create",
      "/generate",
      "/how-it-works",
      "/faq",
      "/pricing",
      "/publish",
      "/accounts",
      "/analytics",
    ]) {
      expect(layout).toContain(`href="${href}"`);
    }
  });

  it("admin console nav is a scrollable bar with touch-height links", () => {
    const layout = read("app/admin/layout.tsx");
    expect(layout).not.toContain("flex flex-wrap gap-4 border-b pb-3");
    expect(layout).toContain("overflow-x-auto");
    expect(layout).toContain("border-border");
    expect(layout).toContain("min-h-[44px]");
  });

  it("generate page links back to clipping your own video", () => {
    const page = read("app/generate/page.tsx");
    expect(page).toContain('href="/create"');
    expect(page).toContain("Clip it instead");
  });
});

describe("phase 20 type scale and cards", () => {
  it("every content page title is text-3xl tracking-tight", () => {
    for (const path of [
      "app/accounts/page.tsx",
      "app/publish/page.tsx",
      "app/analytics/page.tsx",
      "app/billing/page.tsx",
      "app/share/[token]/page.tsx",
      "app/contact/page.tsx",
      "app/cookies/page.tsx",
      "app/acceptable-use/page.tsx",
      "app/terms/page.tsx",
      "app/privacy/page.tsx",
      "app/copyright/page.tsx",
      "app/report/page.tsx",
      "app/signin/page.tsx",
    ]) {
      expect(read(path)).toContain("text-3xl font-bold tracking-tight");
    }
  });

  it("admin console titles are text-2xl tracking-tight", () => {
    expect(read("app/admin/page.tsx")).toContain(
      "text-2xl font-bold tracking-tight",
    );
  });

  it("faq and pricing cards carry a border edge and p-6", () => {
    expect(read("app/faq/page.tsx")).toContain(
      "rounded-xl border border-border bg-card p-6 shadow-sm",
    );
    expect(read("app/pricing/page.tsx")).toContain(
      "rounded-xl border border-border bg-card p-6 shadow-sm",
    );
  });

  it("no bare border class survives in themed UI", () => {
    // A bare `border` width utility with NO color renders as
    // currentColor in Tailwind v4 — the exact inconsistency Phase
    // 12 named. A class list that uses the `border` token must
    // also carry a color: `border-border`, an explicit status
    // color, or a token color with opacity (`border-primary/25`).
    // Side widths (`border-b`) and styles (`border-dashed`) do
    // not count as colors.
    const isColor = (t: string): boolean => {
      if (!t.startsWith("border-")) return false;
      if (/^border-[tblrxy](-\d+)?$/.test(t)) return false;
      if (/^border-(solid|dashed|dotted|double|hidden|none|\d+)$/.test(t)) {
        return false;
      }
      return true;
    };
    const classLists: string[] = [];
    for (const path of [...allTsx("app"), ...allTsx("components")]) {
      const src = read(path);
      for (const m of src.matchAll(/className="([^"]*)"/g)) {
        classLists.push(m[1]);
      }
    }
    expect(classLists.length).toBeGreaterThan(0);
    for (const list of classLists) {
      const tokens = list.split(/\s+/);
      if (tokens.includes("border")) {
        expect(tokens.some(isColor)).toBe(true);
      }
    }
  });
});

describe("phase 20 touch targets and phone text", () => {
  it("form controls get a 44px minimum from the global rule", () => {
    const css = read("app/globals.css");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain('input:not([type="checkbox"])');
    expect(css).toContain('not([type="range"])');
  });

  it("phone form text is held at 16px so iOS does not auto-zoom", () => {
    const css = read("app/globals.css");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("font-size: 16px");
  });

  it("admin action buttons carry the 44px touch height", () => {
    for (const path of [
      "app/admin/users/[id]/page.tsx",
      "app/admin/audit/page.tsx",
      "app/admin/strikes/page.tsx",
      "app/admin/AdminBanner.tsx",
    ]) {
      expect(read(path)).toContain("min-h-[44px]");
    }
  });
});

describe("phase 20 layout bugs", () => {
  it("publish grids collapse on phones (the proven overflow)", () => {
    const page = read("app/publish/page.tsx");
    expect(page).toContain("grid-cols-1 gap-3 sm:grid-cols-2");
    expect(page).toContain("grid-cols-1 gap-3 sm:grid-cols-3");
    expect(page).toContain("grid-cols-1 gap-2 sm:grid-cols-2");
    expect(page).not.toContain("grid grid-cols-2 gap-3");
    expect(page).not.toContain("grid grid-cols-3 gap-3");
  });

  it("no page nests a second <main> inside the layout's <main>", () => {
    for (const path of allTsx("app")) {
      if (path === "app/layout.tsx") continue;
      expect(read(path)).not.toContain("<main");
    }
  });

  it("report form labels are not muted gray", () => {
    const page = read("app/report/page.tsx");
    expect(page).not.toContain("space-y-8 text-sm text-muted-foreground");
  });
});

describe("phase 20 corrected copy", () => {
  it("faqs name the generated-short formats, not just 720x1280", () => {
    for (const path of ["lib/marketing.ts", "app/faq/page.tsx"]) {
      const src = read(path);
      expect(src).toContain("1280×720 and 720×720");
      expect(src).not.toContain("Output is 720×1280 vertical video");
    }
  });
});
