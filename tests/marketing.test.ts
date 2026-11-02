import { describe, expect, it } from "vitest";
import { TRANSLATION_LANGUAGES } from "@/lib/ai/languages";
import {
  DEMO_NOTE,
  DEMO_STYLES,
  FEATURES,
  HERO,
  HOME_FAQS,
  PLANS_NOTE,
  PLATFORM_STRIP,
  STEPS,
  TRANSLATION_COUNT,
  VALUE_STRIP,
} from "@/lib/marketing";

/**
 * Honesty invariants for the marketing homepage (Phase 7).
 * If any of these fail, the homepage is claiming something the product
 * is not — fix the copy, never the test.
 */
const BANNED = ["$", "100+", "10k", "copyright-free", "earn money", "guaranteed"];

function allCopy(): string[] {
  return [
    HERO.eyebrow,
    HERO.title,
    HERO.sub,
    HERO.reassurance,
    HERO.rightsNote,
    PLATFORM_STRIP,
    VALUE_STRIP.title,
    VALUE_STRIP.body,
    ...FEATURES.flatMap((f) => [f.title, f.body]),
    ...STEPS.flatMap((s) => [s.title, s.body, s.proof]),
    ...DEMO_STYLES.flatMap((d) => [d.name, d.caption]),
    DEMO_NOTE,
    PLANS_NOTE,
    ...HOME_FAQS.flatMap((f) => [f.q, f.a]),
  ];
}

describe("marketing copy honesty", () => {
  it("contains no prices, no inflated claims, no earnings promises", () => {
    for (const text of allCopy()) {
      for (const banned of BANNED) {
        expect(
          text.toLowerCase(),
          `banned phrase ${JSON.stringify(banned)} in: ${text}`,
        ).not.toContain(banned);
      }
    }
  });

  it("never promises a paste-any-link flow", () => {
    for (const text of allCopy()) {
      expect(text.toLowerCase()).not.toContain("paste a link");
      expect(text.toLowerCase()).not.toContain("paste any link");
    }
  });

  it("states the no-downloader rule on the hero", () => {
    expect(HERO.rightsNote).toContain("never downloads videos");
  });

  it("labels demo frames as illustrations, not real clips", () => {
    expect(DEMO_NOTE.toLowerCase()).toContain("illustrated");
  });
});

describe("marketing structure", () => {
  it("has 10 features, 3 steps, 5 homepage FAQs", () => {
    expect(FEATURES).toHaveLength(10);
    expect(STEPS).toHaveLength(3);
    expect(HOME_FAQS).toHaveLength(5);
    expect(DEMO_STYLES).toHaveLength(3);
  });

  it("derives the language count from the translation list, firsthand", () => {
    expect(TRANSLATION_COUNT).toBe(TRANSLATION_LANGUAGES.length);
    expect(TRANSLATION_COUNT).toBeGreaterThan(0);
    const captionFeature = FEATURES.find((f) =>
      f.title.toLowerCase().includes("languages"),
    );
    expect(captionFeature?.title).toContain(String(TRANSLATION_COUNT));
  });
});
