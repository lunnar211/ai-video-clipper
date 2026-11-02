/**
 * Social platform registry (ClipForge Phase 3).
 *
 * Every platform sits behind its own feature flag, default OFF, and its
 * own approval flag, default OFF:
 * - flag off            → status "disabled" (connect + publish refused)
 * - flag on, not approved → status "pending_approval" (connect may be
 *   shown for testing, but publish is refused with the reason stated)
 * - flag on + approved  → status "live"
 *
 * Scopes are the MINIMUM each platform's upload/publish flow needs.
 * Platforms change scope requirements during app review — re-verify
 * each list when creating the OAuth app (see docs/APP_REVIEW_CHECKLIST.md).
 *
 * Limits are the documented per-platform limits as of implementation.
 * Platforms change limits; the validator refuses only what it knows
 * would be rejected, and the review checklist asks the owner to
 * re-verify them at app-review time.
 */

export const PLATFORM_IDS = [
  "youtube",
  "tiktok",
  "instagram",
  "facebook",
  "x",
  "linkedin",
] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

export type PlatformStatus = "disabled" | "pending_approval" | "live";

export type PlatformLimits = {
  /** Maximum video duration in seconds. */
  maxDurationSec: number;
  /** Maximum upload size in bytes. */
  maxSizeBytes: number;
  /** Accepted aspect ratios (e.g. "9:16"). */
  aspects: string[];
  /** Maximum title length, or null when the platform has no title field. */
  maxTitleChars: number | null;
  /** Maximum caption/description length. */
  maxCaptionChars: number;
  /** Maximum tag count, or null when tags ride inside the caption. */
  maxTags: number | null;
};

export type PlatformDef = {
  id: PlatformId;
  label: string;
  /** Env var enabling this platform (default off). */
  flagEnv: string;
  /** Env var marking app review as approved (default off). */
  approvalEnv: string;
  /** Minimal OAuth scopes for upload/publish. */
  scopes: string[];
  authUrl: string;
  tokenUrl: string;
  revokeUrl: string | null;
  limits: PlatformLimits;
  /** Short note on what the upload flow needs. */
  notes: string;
};

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

export const PLATFORMS: Record<PlatformId, PlatformDef> = {
  youtube: {
    id: "youtube",
    label: "YouTube Shorts",
    flagEnv: "PUBLISH_YOUTUBE_ENABLED",
    approvalEnv: "YOUTUBE_APP_APPROVED",
    scopes: [
      "https://www.googleapis.com/auth/youtube.upload",
      // Read-only, added in Phase 8 for own-video import verification
      // (channels.list(mine=true)): proving a pasted link belongs to
      // the connected channel. Accounts connected before this scope
      // must reconnect to grant it; the import route refuses those
      // honestly instead of silently passing.
      "https://www.googleapis.com/auth/youtube.readonly",
    ],
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    limits: {
      maxDurationSec: 60,
      maxSizeBytes: 256 * GB,
      aspects: ["9:16"],
      maxTitleChars: 100,
      maxCaptionChars: 5000,
      maxTags: 15,
    },
    notes:
      "YouTube Data API v3, videos.insert with uploadType=multipart. " +
      "Shorts must be vertical and 60 seconds or shorter.",
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    flagEnv: "PUBLISH_TIKTOK_ENABLED",
    approvalEnv: "TIKTOK_APP_APPROVED",
    scopes: ["user.info.basic", "video.upload", "video.publish"],
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    revokeUrl: "https://open.tiktokapis.com/v2/oauth/revoke/",
    limits: {
      maxDurationSec: 600,
      maxSizeBytes: 4 * GB,
      aspects: ["9:16"],
      maxTitleChars: null,
      maxCaptionChars: 4000,
      maxTags: null,
    },
    notes:
      "TikTok Content Posting API (direct post). Hashtags ride inside " +
      "the caption; there is no separate tag field.",
  },
  instagram: {
    id: "instagram",
    label: "Instagram Reels",
    flagEnv: "PUBLISH_INSTAGRAM_ENABLED",
    approvalEnv: "INSTAGRAM_APP_APPROVED",
    scopes: [
      "instagram_basic",
      "instagram_content_publish",
      "pages_show_list",
    ],
    authUrl: "https://www.facebook.com/v18.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v18.0/oauth/access_token",
    revokeUrl: null,
    limits: {
      maxDurationSec: 180,
      maxSizeBytes: 4 * GB,
      aspects: ["9:16"],
      maxTitleChars: null,
      maxCaptionChars: 2200,
      maxTags: null,
    },
    notes:
      "Instagram Graph API Reels: create a media container, then publish " +
      "it. Requires a Facebook Page linked to the Instagram account.",
  },
  facebook: {
    id: "facebook",
    label: "Facebook Reels",
    flagEnv: "PUBLISH_FACEBOOK_ENABLED",
    approvalEnv: "FACEBOOK_APP_APPROVED",
    scopes: ["pages_manage_posts", "pages_read_engagement"],
    authUrl: "https://www.facebook.com/v18.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v18.0/oauth/access_token",
    revokeUrl: null,
    limits: {
      maxDurationSec: 90,
      maxSizeBytes: 4 * GB,
      aspects: ["9:16"],
      maxTitleChars: null,
      maxCaptionChars: 2200,
      maxTags: null,
    },
    notes:
      "Facebook Graph API Reels via a Page access token. Revocation is " +
      "by deleting the stored token (no provider revoke endpoint).",
  },
  x: {
    id: "x",
    label: "X (Twitter)",
    flagEnv: "PUBLISH_X_ENABLED",
    approvalEnv: "X_APP_APPROVED",
    scopes: ["tweet.write", "users.read", "offline.access"],
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    revokeUrl: "https://api.twitter.com/2/oauth2/revoke",
    limits: {
      maxDurationSec: 140,
      maxSizeBytes: 512 * MB,
      aspects: ["9:16", "16:9"],
      maxTitleChars: null,
      maxCaptionChars: 280,
      maxTags: null,
    },
    notes:
      "X API v2 with OAuth 2.0 + PKCE. Video uses chunked upload; the " +
      "upload adapter is a stub until app approval (see adapters).",
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    flagEnv: "PUBLISH_LINKEDIN_ENABLED",
    approvalEnv: "LINKEDIN_APP_APPROVED",
    scopes: ["openid", "profile", "w_member_social"],
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    revokeUrl: "https://www.linkedin.com/oauth/v2/revoke",
    limits: {
      maxDurationSec: 600,
      maxSizeBytes: 5 * GB,
      aspects: ["9:16", "16:9"],
      maxTitleChars: null,
      maxCaptionChars: 3000,
      maxTags: null,
    },
    notes:
      "LinkedIn Share API: register an upload, PUT the bytes, then " +
      "create the post. The upload adapter is a stub until approval.",
  },
};

function flagOn(env: NodeJS.ProcessEnv, name: string): boolean {
  return env[name] === "true" || env[name] === "1";
}

/** Status of one platform under the current env (injectable for tests). */
export function platformStatus(
  platform: PlatformId,
  env: NodeJS.ProcessEnv = process.env,
): PlatformStatus {
  const def = PLATFORMS[platform];
  if (!flagOn(env, def.flagEnv)) return "disabled";
  if (!flagOn(env, def.approvalEnv)) return "pending_approval";
  return "live";
}

/** True only when the platform is fully enabled AND approved. */
export function publishAllowed(
  platform: PlatformId,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return platformStatus(platform, env) === "live";
}

/** Human-readable refusal reason when publishing is not allowed. */
export function publishRefusalReason(
  platform: PlatformId,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const status = platformStatus(platform, env);
  if (status === "live") return null;
  if (status === "disabled") {
    return (
      `${PLATFORMS[platform].label} publishing is not enabled. ` +
      `Set ${PLATFORMS[platform].flagEnv}=true to enable it.`
    );
  }
  return (
    `${PLATFORMS[platform].label} is pending platform approval. ` +
    "Publishing stays off until app review is approved and " +
    `${PLATFORMS[platform].approvalEnv}=true is set.`
  );
}
