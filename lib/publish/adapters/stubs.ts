/**
 * Upload adapters pending platform approval (ClipForge Phase 3).
 *
 * YouTube is the first live adapter (see adapters/youtube.ts). The
 * other platforms' upload functions deliberately refuse with
 * PLATFORM_NOT_IMPLEMENTED: their auth + token flows are implemented,
 * but their media-upload protocols are NOT faked. In practice the
 * publisher's gate refuses these platforms first (their approval flag
 * is off); this stub is defense-in-depth so a bypassed gate still
 * cannot produce a fake post id.
 */

import { PLATFORMS, type PlatformId } from "../platforms";
import type { PlatformUploader, UploadResult } from "../publisher";

const PENDING: PlatformId[] = [
  "tiktok",
  "instagram",
  "facebook",
  "x",
  "linkedin",
];

/** Uploader that always refuses honestly for a pending platform. */
export function stubUploader(platform: PlatformId): PlatformUploader {
  return {
    async upload(): Promise<UploadResult> {
      return {
        ok: false,
        code: "PLATFORM_NOT_IMPLEMENTED",
        message:
          `${PLATFORMS[platform].label} upload is not implemented yet. ` +
          "It stays off until app review is approved and the adapter " +
          "is implemented and verified.",
        retryable: false,
      };
    },
  };
}

/** True when the platform's upload adapter is still a stub. */
export function isStubPlatform(platform: PlatformId): boolean {
  return (PENDING as string[]).includes(platform);
}
