/**
 * Rights policy engine + pre-publish check (ClipForge Phase 2).
 *
 * Three real outcomes — plus the honest fourth state:
 * - "block": a fingerprint match with no licence proof supplied.
 * - "warn": no match found (databases are incomplete, so this is a
 *   caution, never a clearance) or another cautionary item.
 * - "allow-with-licence-proof": a match exists BUT the user supplied
 *   licence proof for that music.
 * - "not_scanned": no provider ran. This is NEVER mapped to clean,
 *   and the checklist cannot treat it as a reviewed-clean result
 *   unless the user explicitly acknowledges the gap (see checklist).
 *
 * The pre-publish check evaluates a draft (no posts exist yet — Phase
 * 3 consumes this against real posts). It writes nothing; recording
 * ticks is the checklist route's job.
 */

import { z } from "zod";

export type PolicyOutcome =
  | "block"
  | "warn"
  | "allow-with-licence-proof"
  | "not_scanned";

export type PolicyInput = {
  scanned: boolean;
  detected: boolean;
  /** Free-text licence proof (licence name, order/invoice ref, URL). */
  licenceProof: string | null;
  /**
   * True when the user explicitly acknowledged that no scan ran.
   * Only then may an unscanned clip proceed — with the user, not
   * the tool, accepting responsibility for the music.
   */
  notScannedAcknowledged?: boolean;
};

export type PolicyResult = {
  outcome: PolicyOutcome;
  reason: string;
  /** True when publishing may proceed (with the stated caveat). */
  mayProceed: boolean;
};

export function evaluatePolicy(input: PolicyInput): PolicyResult {
  if (!input.scanned) {
    if (input.notScannedAcknowledged === true) {
      return {
        outcome: "not_scanned",
        reason:
          "This clip has not been fingerprint-scanned, and you acknowledged the gap. You — not this tool — remain responsible for the music.",
        mayProceed: true,
      };
    }
    return {
      outcome: "not_scanned",
      reason:
        "This clip has not been fingerprint-scanned: no recognition key is connected. Unscanned does not mean clear.",
      mayProceed: false,
    };
  }
  if (input.detected && !input.licenceProof) {
    return {
      outcome: "block",
      reason:
        "A fingerprint match was found and no licence proof was supplied. Add licence proof for the matched music, or replace the music, before publishing.",
      mayProceed: false,
    };
  }
  if (input.detected && input.licenceProof) {
    return {
      outcome: "allow-with-licence-proof",
      reason:
        "A fingerprint match was found, but licence proof was supplied. Keep that proof with the project; the platform may still flag the clip.",
      mayProceed: true,
    };
  }
  return {
    outcome: "warn",
    reason:
      "No fingerprint match was found. That is not proof the clip is clear — recognition databases are incomplete, and you remain responsible for the music you publish.",
    mayProceed: true,
  };
}

/** Repeat-infringer policy (also written on the Copyright page). */
export const REPEAT_INFRINGER_POLICY = {
  /** Upheld strikes at which publishing is auto-paused. */
  strikesToPause: 3,
  /** Upheld strikes at which the account is flagged for review. */
  strikesToReview: 2,
  /** Days a pause lasts before an admin must review (0 = indefinite). */
  pauseReviewDays: 0,
} as const;

/** Draft object the pre-publish check evaluates (Phase 3: real posts). */
export const prePublishDraftSchema = z.object({
  projectId: z.string().min(1).max(200),
  clipRef: z.string().min(1).max(200).optional(),
  declarationAccepted: z.boolean(),
  fingerprintScanned: z.boolean(),
  fingerprintDetected: z.boolean(),
  licenceProof: z.string().max(1000).nullable(),
  musicChoice: z
    .enum(["original", "royalty-free", "licensed-upload", "none"])
    .optional(),
  platformRulesAcknowledged: z.boolean(),
  notScannedAcknowledged: z.boolean().optional(),
});

export type PrePublishDraft = z.infer<typeof prePublishDraftSchema>;

export type PrePublishItem = {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type PrePublishVerdict = {
  items: PrePublishItem[];
  policy: PolicyResult;
  /** True only when every item passes AND policy allows proceeding. */
  ready: boolean;
};

export function evaluatePrePublishCheck(
  draft: PrePublishDraft,
): PrePublishVerdict {
  const policy = evaluatePolicy({
    scanned: draft.fingerprintScanned,
    detected: draft.fingerprintDetected,
    licenceProof: draft.licenceProof,
    notScannedAcknowledged: draft.notScannedAcknowledged,
  });
  const items: PrePublishItem[] = [
    {
      key: "declaration",
      label: "Ownership declared for this project",
      passed: draft.declarationAccepted,
      detail: draft.declarationAccepted
        ? "Declaration accepted."
        : "Accept the ownership declaration before publishing.",
    },
    {
      key: "fingerprint",
      label: "Fingerprint result reviewed",
      passed:
        draft.fingerprintScanned ||
        draft.notScannedAcknowledged === true,
      detail: draft.fingerprintScanned
        ? `Scan result: ${policy.outcome}.`
        : draft.notScannedAcknowledged === true
          ? "Not scanned — you acknowledged the gap. You remain responsible for the music."
          : "No scan ran. Run a scan, or explicitly acknowledge that this clip was not scanned.",
    },
    {
      key: "policy",
      label: "Music policy allows publishing",
      passed: policy.mayProceed,
      detail: policy.reason,
    },
    {
      key: "platform-rules",
      label: "Platform rules acknowledged",
      passed: draft.platformRulesAcknowledged,
      detail: draft.platformRulesAcknowledged
        ? "Platform rules acknowledged."
        : "Acknowledge the target platform's rules before publishing.",
    },
  ];
  return {
    items,
    policy,
    ready: items.every((i) => i.passed),
  };
}
