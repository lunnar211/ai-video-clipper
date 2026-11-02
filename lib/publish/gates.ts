/**
 * Publish gate assembly (ClipForge Phase 3).
 *
 * One function composes every Phase 2 + platform gate so routes and
 * tests share the same enforcement order. It is pure: the caller
 * supplies the checklist ticks, the paused flag, and the pre-publish
 * draft; this module only decides. Order:
 *  1. platform enabled + approved
 *  2. clip facts pass the platform limits validator
 *  3. per-post compliance checklist complete
 *  4. account not publishing-paused
 *  5. fingerprint pre-publish check ready
 * The first failure wins, with a specific reason. Nothing here touches
 * a network, a database, or a token.
 */

import {
  PLATFORMS,
  publishRefusalReason,
  type PlatformId,
} from "./platforms";
import { validateForPlatform, type ClipFacts } from "./validator";
import {
  checklistComplete,
  type ChecklistRecord,
} from "@/lib/rights/checklist";
import {
  evaluatePrePublishCheck,
  type PrePublishDraft,
} from "@/lib/rights/policy";
import type { GateVerdict } from "./publisher";

export type PublishGateInputs = {
  platform: PlatformId;
  clipFacts: ClipFacts;
  /** Checklist ticks for this post (from the stored record). */
  checklistTicks: ChecklistRecord["ticks"] | null;
  paused: boolean;
  /** Pre-publish draft evaluated at post creation; re-checked at publish. */
  prePublish: PrePublishDraft | null;
  env?: NodeJS.ProcessEnv;
};

/** Compose all publish gates for one target. */
export function buildPublishGates(
  inputs: PublishGateInputs,
): GateVerdict {
  const refusal = publishRefusalReason(inputs.platform, inputs.env);
  if (refusal) return { ok: false, reason: refusal };
  const validation = validateForPlatform(inputs.platform, inputs.clipFacts);
  if (!validation.ok) {
    return { ok: false, reason: validation.errors.join(" ") };
  }
  if (!inputs.checklistTicks || !checklistComplete(inputs.checklistTicks)) {
    return {
      ok: false,
      reason:
        "Per-post compliance checklist is incomplete. Complete all four " +
        "ticks for this post before publishing.",
    };
  }
  if (inputs.paused) {
    return {
      ok: false,
      reason:
        "This account's publishing is paused (strike review). " +
        "Publishing stays blocked until the pause is lifted.",
    };
  }
  if (!inputs.prePublish) {
    return {
      ok: false,
      reason:
        "Run the fingerprint pre-publish check for this post before publishing.",
    };
  }
  const verdict = evaluatePrePublishCheck(inputs.prePublish);
  if (!verdict.ready) {
    const failed = verdict.items
      .filter((i) => !i.passed)
      .map((i) => i.detail)
      .join(" ");
    return { ok: false, reason: `Pre-publish check not ready: ${failed}` };
  }
  return { ok: true };
}

/** Label helper for the UI (which platform a refusal came from). */
export function platformLabel(platform: PlatformId): string {
  return PLATFORMS[platform].label;
}
