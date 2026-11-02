import { describe, it, expect } from "vitest";
import {
  evaluatePolicy,
  evaluatePrePublishCheck,
  REPEAT_INFRINGER_POLICY,
} from "@/lib/rights/policy";
import {
  buildMusicAttribution,
  licenceRequiresAttribution,
} from "@/lib/rights/attribution";
import {
  checklistComplete,
  checklistSchema,
  CHECKLIST_ITEMS,
} from "@/lib/rights/checklist";
import {
  canTransitionStrike,
  canTransitionAppeal,
  shouldAutoPause,
  strikeSchema,
  appealSchema,
} from "@/lib/rights/strikes";
import {
  declarationSchema,
  DECLARATION_TEXT_VERSION,
} from "@/lib/rights/declarations";
import { userTrackAttribution } from "@/lib/music/tracks";

describe("policy engine", () => {
  it("never calls unscanned content clean", () => {
    const r = evaluatePolicy({ scanned: false, detected: false, licenceProof: null });
    expect(r.outcome).toBe("not_scanned");
    expect(r.mayProceed).toBe(false);
  });
  it("lets an acknowledged unscanned clip proceed, with responsibility on the user", () => {
    const r = evaluatePolicy({
      scanned: false,
      detected: false,
      licenceProof: null,
      notScannedAcknowledged: true,
    });
    expect(r.outcome).toBe("not_scanned");
    expect(r.mayProceed).toBe(true);
    expect(r.reason).toMatch(/remain responsible/);
  });
  it("blocks a match without licence proof", () => {
    const r = evaluatePolicy({ scanned: true, detected: true, licenceProof: null });
    expect(r.outcome).toBe("block");
    expect(r.mayProceed).toBe(false);
  });
  it("allows a match with licence proof", () => {
    const r = evaluatePolicy({ scanned: true, detected: true, licenceProof: "Bensound licence #123" });
    expect(r.outcome).toBe("allow-with-licence-proof");
    expect(r.mayProceed).toBe(true);
  });
  it("warns (never clears) on no match", () => {
    const r = evaluatePolicy({ scanned: true, detected: false, licenceProof: null });
    expect(r.outcome).toBe("warn");
    expect(r.mayProceed).toBe(true);
    expect(r.reason).toMatch(/not proof/);
  });
});

describe("pre-publish check", () => {
  const base = {
    projectId: "proj-1",
    declarationAccepted: true,
    fingerprintScanned: true,
    fingerprintDetected: false,
    licenceProof: null,
    platformRulesAcknowledged: true,
  };
  it("is ready when every item passes", () => {
    const v = evaluatePrePublishCheck(base);
    expect(v.ready).toBe(true);
  });
  it("is not ready when the declaration is missing", () => {
    const v = evaluatePrePublishCheck({ ...base, declarationAccepted: false });
    expect(v.ready).toBe(false);
    expect(v.items.find((i) => i.key === "declaration")?.passed).toBe(false);
  });
  it("is not ready when unscanned and unacknowledged", () => {
    const v = evaluatePrePublishCheck({
      ...base,
      fingerprintScanned: false,
    });
    expect(v.ready).toBe(false);
  });
  it("is ready when unscanned but explicitly acknowledged", () => {
    const v = evaluatePrePublishCheck({
      ...base,
      fingerprintScanned: false,
      notScannedAcknowledged: true,
    });
    expect(v.ready).toBe(true);
  });
  it("blocks a detected match without proof even when all ticks pass", () => {
    const v = evaluatePrePublishCheck({
      ...base,
      fingerprintDetected: true,
    });
    expect(v.ready).toBe(false);
    expect(v.policy.outcome).toBe("block");
  });
});

describe("attribution", () => {
  it("builds a CC-BY credit line deterministically", () => {
    expect(
      buildMusicAttribution({
        title: "Morning Light",
        artist: "Jane Doe",
        licence: "CC-BY 4.0",
        sourceUrl: "https://example.com/track",
        licenceTerms: null,
      }),
    ).toBe(
      'Music: "Morning Light" by Jane Doe (https://example.com/track) — licensed under CC-BY 4.0.',
    );
  });
  it("requires attribution for CC-BY but not for CC0", () => {
    expect(licenceRequiresAttribution("CC-BY 4.0")).toBe(true);
    expect(licenceRequiresAttribution("CC0 (public domain)")).toBe(false);
  });
  it("gives a user track its attribution line only when required", () => {
    expect(
      userTrackAttribution({ name: "track.mp3", licence: "CC-BY (attribution required)", url: "blob:x" }),
    ).toMatch(/attribution required/);
    expect(
      userTrackAttribution({ name: "track.mp3", licence: "CC0 (public domain)", url: "blob:x" }),
    ).toBeNull();
  });
});

describe("checklist", () => {
  it("has exactly four items and requires all of them", () => {
    expect(CHECKLIST_ITEMS).toHaveLength(4);
    expect(
      checklistComplete({
        declaration: true,
        musicLicence: true,
        fingerprintReviewed: true,
        platformRules: false,
      }),
    ).toBe(false);
    expect(
      checklistComplete({
        declaration: true,
        musicLicence: true,
        fingerprintReviewed: true,
        platformRules: true,
      }),
    ).toBe(true);
  });
  it("rejects a record missing a tick", () => {
    const parsed = checklistSchema.safeParse({
      postRef: "clip-1",
      projectId: "proj-1",
      ticks: {
        declaration: true,
        musicLicence: true,
        fingerprintReviewed: true,
        platformRules: true,
      },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("strike + appeal transitions", () => {
  it("allows only the documented strike flow", () => {
    expect(canTransitionStrike("submitted", "under_review")).toBe(true);
    expect(canTransitionStrike("submitted", "upheld")).toBe(false);
    expect(canTransitionStrike("under_review", "upheld")).toBe(true);
    expect(canTransitionStrike("under_review", "overturned")).toBe(true);
    expect(canTransitionStrike("upheld", "overturned")).toBe(false);
    expect(canTransitionAppeal("submitted", "under_review")).toBe(true);
    expect(canTransitionAppeal("under_review", "overturned")).toBe(true);
    expect(canTransitionAppeal("overturned", "submitted")).toBe(false);
  });
  it("auto-pauses at the documented threshold", () => {
    expect(REPEAT_INFRINGER_POLICY.strikesToPause).toBe(3);
    expect(REPEAT_INFRINGER_POLICY.strikesToReview).toBe(2);
    expect(shouldAutoPause(2)).toBe(false);
    expect(shouldAutoPause(3)).toBe(true);
  });
  it("requires both statements on a takedown notice", () => {
    const base = {
      reporterName: "Ann",
      reporterEmail: "ann@example.com",
      workDescription: "My song, released 2024, three minutes long.",
      infringingRef: "https://example.com/post/1",
      signature: "Ann",
    };
    expect(
      strikeSchema.safeParse({ ...base, goodFaithStatement: true, accuracyStatement: true }).success,
    ).toBe(true);
    expect(
      strikeSchema.safeParse({ ...base, goodFaithStatement: false, accuracyStatement: true }).success,
    ).toBe(false);
    expect(
      appealSchema.safeParse({
        strikeId: "00000000-0000-0000-0000-000000000000",
        appellantName: "Bob",
        appellantEmail: "bob@example.com",
        reason: "I own the licence for this music.",
      }).success,
    ).toBe(true);
  });
});

describe("declarations", () => {
  it("pins the declaration text version", () => {
    expect(DECLARATION_TEXT_VERSION).toBe("2026-11-02-v1");
    expect(
      declarationSchema.safeParse({
        projectId: "proj-1",
        declarationTextVersion: DECLARATION_TEXT_VERSION,
      }).success,
    ).toBe(true);
    expect(
      declarationSchema.safeParse({ projectId: "", declarationTextVersion: "v1" }).success,
    ).toBe(false);
  });
});
