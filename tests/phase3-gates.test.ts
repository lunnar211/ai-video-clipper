import { describe, it, expect } from "vitest";
import { buildPublishGates } from "@/lib/publish/gates";
import type { PrePublishDraft } from "@/lib/rights/policy";

const liveEnv = {
  PUBLISH_YOUTUBE_ENABLED: "true",
  YOUTUBE_APP_APPROVED: "true",
} as unknown as NodeJS.ProcessEnv;

const facts = { durationSec: 45, sizeBytes: 50 * 1024 * 1024, aspect: "9:16" };
const ticks = {
  declaration: true,
  musicLicence: true,
  fingerprintReviewed: true,
  platformRules: true,
};
const prePublish: PrePublishDraft = {
  projectId: "proj-1",
  declarationAccepted: true,
  fingerprintScanned: true,
  fingerprintDetected: false,
  licenceProof: null,
  platformRulesAcknowledged: true,
};

describe("publish gate assembly (order + reasons)", () => {
  it("passes when every gate is green", () => {
    expect(
      buildPublishGates({
        platform: "youtube",
        clipFacts: facts,
        checklistTicks: ticks,
        paused: false,
        prePublish,
        env: liveEnv,
      }),
    ).toEqual({ ok: true });
  });
  it("refuses in order: flag, then limits, then checklist, then pause, then pre-publish", () => {
    const base = {
      platform: "youtube" as const,
      clipFacts: facts,
      checklistTicks: ticks,
      paused: false,
      prePublish,
      env: liveEnv,
    };
    const flagOff = buildPublishGates({
      ...base,
      env: {} as unknown as NodeJS.ProcessEnv,
    });
    expect(flagOff.ok).toBe(false);
    if (!flagOff.ok) expect(flagOff.reason).toMatch(/not enabled/);
    const badClip = buildPublishGates({
      ...base,
      clipFacts: { ...facts, durationSec: 95 },
    });
    expect(badClip.ok).toBe(false);
    if (!badClip.ok) expect(badClip.reason).toMatch(/60 seconds/);
    const badTicks = buildPublishGates({
      ...base,
      checklistTicks: { ...ticks, platformRules: false },
    });
    expect(badTicks.ok).toBe(false);
    if (!badTicks.ok) expect(badTicks.reason).toMatch(/checklist/);
    const paused = buildPublishGates({ ...base, paused: true });
    expect(paused.ok).toBe(false);
    if (!paused.ok) expect(paused.reason).toMatch(/paused/);
    const noDraft = buildPublishGates({ ...base, prePublish: null });
    expect(noDraft.ok).toBe(false);
    if (!noDraft.ok) expect(noDraft.reason).toMatch(/pre-publish check/);
    const blocked = buildPublishGates({
      ...base,
      prePublish: {
        ...prePublish,
        fingerprintDetected: true,
        licenceProof: null,
      },
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toMatch(/not ready/);
    const unscanned = buildPublishGates({
      ...base,
      prePublish: {
        ...prePublish,
        fingerprintScanned: false,
        notScannedAcknowledged: false,
      },
    });
    expect(unscanned.ok).toBe(false);
  });
  it("lets an acknowledged unscanned clip through with user responsibility", () => {
    const res = buildPublishGates({
      platform: "youtube",
      clipFacts: facts,
      checklistTicks: ticks,
      paused: false,
      prePublish: {
        ...prePublish,
        fingerprintScanned: false,
        notScannedAcknowledged: true,
      },
      env: liveEnv,
    });
    expect(res).toEqual({ ok: true });
  });
});
