import { describe, expect, it } from "vitest";
import { TRANSLATION_LANGUAGES } from "@/lib/ai/languages";
import {
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
 * Honesty invariants for the marketing homepage (Phase 7, revised
 * Phase 10: the illustrated demo section was deleted entirely, so no
 * demo export exists anymore and no test may reference one).
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
      expect(text.toLowerCase()).not.toContain("paste any link");
      // "Paste a link" may appear ONLY with the CC scope stated in
      // the same text (Phase 11 feature, Phase 12 copy fix): the
      // two verified sources and the word "verified" must be there,
      // so the phrase can never read as paste-any-link.
      if (text.toLowerCase().includes("paste a link")) {
        expect(text).toContain("Wikimedia Commons");
        expect(text).toContain("Internet Archive");
        expect(text.toLowerCase()).toContain("verified");
      }
    }
  });

  it("states the no-downloader rule on the hero", () => {
    expect(HERO.rightsNote).toContain("never downloads videos");
    expect(HERO.rightsNote).toContain("verified free licence");
  });

  it("homepage FAQ states the CC paste scope and the platform refusal", () => {
    const faq = HOME_FAQS.find((f) =>
      f.q.toLowerCase().includes("youtube"),
    );
    expect(faq).toBeDefined();
    expect(faq!.a).toContain("Wikimedia Commons");
    expect(faq!.a).toContain("Internet Archive");
    expect(faq!.a.toLowerCase()).toContain("refused");
    expect(faq!.a.toLowerCase()).not.toContain("no link box");
  });
});

describe("marketing structure", () => {
  it("has 10 features, 3 steps, 5 homepage FAQs", () => {
    expect(FEATURES).toHaveLength(10);
    expect(STEPS).toHaveLength(3);
    expect(HOME_FAQS).toHaveLength(5);
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
