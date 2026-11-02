/**
 * Platform limits validator (ClipForge Phase 3).
 *
 * Runs BEFORE any publish attempt: a clip that violates a platform's
 * documented limits is refused with a specific message, never uploaded
 * to be rejected. Limits live in lib/publish/platforms.ts; this module
 * only compares facts against them, so it is trivially testable.
 */

import { PLATFORMS, type PlatformId } from "./platforms";

export type ClipFacts = {
  durationSec: number;
  sizeBytes: number;
  /** Aspect ratio as "9:16" or "16:9". */
  aspect: string;
  title?: string | null;
  description?: string | null;
  tags?: string[];
};

export type ValidationResult = {
  ok: boolean;
  errors: string[];
};

/** Validate clip facts against one platform's limits. */
export function validateForPlatform(
  platform: PlatformId,
  facts: ClipFacts,
): ValidationResult {
  const def = PLATFORMS[platform];
  const limits = def.limits;
  const errors: string[] = [];
  if (facts.durationSec > limits.maxDurationSec) {
    errors.push(
      `${def.label} accepts at most ${limits.maxDurationSec} seconds ` +
        `(got ${facts.durationSec}s).`,
    );
  }
  if (facts.sizeBytes > limits.maxSizeBytes) {
    errors.push(
      `${def.label} accepts at most ${formatBytes(limits.maxSizeBytes)} ` +
        `(got ${formatBytes(facts.sizeBytes)}).`,
    );
  }
  if (!limits.aspects.includes(facts.aspect)) {
    errors.push(
      `${def.label} accepts aspect ${limits.aspects.join(" or ")} ` +
        `(got ${facts.aspect}).`,
    );
  }
  if (
    limits.maxTitleChars !== null &&
    facts.title != null &&
    facts.title.length > limits.maxTitleChars
  ) {
    errors.push(
      `${def.label} titles are at most ${limits.maxTitleChars} characters ` +
        `(got ${facts.title.length}).`,
    );
  }
  if (
    facts.description != null &&
    facts.description.length > limits.maxCaptionChars
  ) {
    errors.push(
      `${def.label} captions are at most ${limits.maxCaptionChars} characters ` +
        `(got ${facts.description.length}).`,
    );
  }
  if (
    limits.maxTags !== null &&
    facts.tags != null &&
    facts.tags.length > limits.maxTags
  ) {
    errors.push(
      `${def.label} accepts at most ${limits.maxTags} tags ` +
        `(got ${facts.tags.length}).`,
    );
  }
  return { ok: errors.length === 0, errors };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  }
  return `${bytes} B`;
}
