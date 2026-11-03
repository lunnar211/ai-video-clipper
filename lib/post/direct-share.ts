/**
 * Post without connecting (ClipForge Phase 13).
 *
 * The honest equivalent of "post directly" on the open web. Platforms
 * block their login pages inside other websites (X-Frame-Options /
 * frame-ancestors), so this site never embeds a platform login, never
 * proxies one, and never asks for a platform login at all. Instead:
 *
 *  (a) the device-native share sheet (navigator.share with the clip
 *      file) where the device supports it, and
 *  (b) deep links to each platform's own upload page, opened in a new
 *      tab, where the user is already signed in on the platform
 *      itself.
 *
 * This module is pure and client-safe: it contains no credential
 * handling of any kind — no login, no stored grant, no session of
 * any platform. The only thing the site records about this flow is
 * an activity event (clip id, platform, outcome) via
 * /api/post-activity; see lib/post/activity.ts.
 *
 * Deep-link honesty: platforms move their upload pages around, and
 * Instagram offers no public web page for uploading Reels at all
 * (Reels finish in the Instagram app). Instagram therefore has no
 * upload URL here — its path is the share sheet (or a download +
 * in-app upload). Every other link below is the platform's public
 * upload entry point as of this phase; the UI carries a hedge note
 * for the case where a link lands on a home page instead of the
 * upload screen.
 */

export const DIRECT_POST_PLATFORM_IDS = [
  "youtube",
  "tiktok",
  "instagram",
  "facebook",
  "x",
  "linkedin",
] as const;

export type DirectPostPlatformId =
  (typeof DIRECT_POST_PLATFORM_IDS)[number];

/** The platform half of an activity event; "share_sheet" is the device path. */
export type PostActivityPlatform = DirectPostPlatformId | "share_sheet";

/**
 * Activity outcomes. Deliberately no "published": a share or a
 * deep-link click is never a confirmed live post — only the platform
 * itself can confirm that.
 */
export type PostActivityOutcome =
  | "shared"
  | "cancelled"
  | "opened"
  | "unsupported";

export type DirectPostPlatform = {
  id: DirectPostPlatformId;
  label: string;
  /**
   * Public upload entry point, or null when the platform offers no
   * public web upload page (Instagram Reels: app-only).
   */
  uploadUrl: string | null;
  /** Plain-words note shown next to the button. */
  note: string;
};

export const DIRECT_POST_PLATFORMS: DirectPostPlatform[] = [
  {
    id: "youtube",
    label: "YouTube Shorts",
    uploadUrl: "https://www.youtube.com/upload",
    note: "Opens YouTube's upload page in a new tab, where you are already signed in.",
  },
  {
    id: "tiktok",
    label: "TikTok",
    uploadUrl: "https://www.tiktok.com/upload",
    note: "Opens TikTok's upload page in a new tab, where you are already signed in.",
  },
  {
    id: "instagram",
    label: "Instagram Reels",
    uploadUrl: null,
    note: "Instagram has no public web page for uploading Reels — Reels finish in the Instagram app. On your phone, use the share sheet; on a computer, download the clip and upload it in the app.",
  },
  {
    id: "facebook",
    label: "Facebook Reels",
    uploadUrl: "https://www.facebook.com/reels/create",
    note: "Opens Facebook's Reels composer in a new tab, where you are already signed in.",
  },
  {
    id: "x",
    label: "X",
    uploadUrl: "https://x.com/compose/post",
    note: "Opens X's post composer in a new tab, where you are already signed in.",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    uploadUrl: "https://www.linkedin.com/post-new/",
    note: "Opens LinkedIn's post composer in a new tab, where you are already signed in.",
  },
];

export function directPostPlatform(
  id: DirectPostPlatformId,
): DirectPostPlatform {
  const found = DIRECT_POST_PLATFORMS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown direct-post platform: ${id}`);
  return found;
}

/** Plain-words honesty copy, shared by the tool, accounts, and publish pages. */
export const POST_NO_LOGIN_NOTE =
  "No login is saved anywhere for this. Sharing opens your device's share sheet or the platform's own upload page, where you are already signed in. This site never sees your platform login.";

export const POST_NOT_PUBLISHED_NOTE =
  "Only the platform itself can confirm a live post. This site records 'shared' or 'opened' — never 'published'.";

export const POST_UPLOAD_PAGE_HEDGE =
  "If a link lands on the platform's home page instead of its upload screen, tap Create there — platforms move these pages around.";

export const POST_COPYRIGHT_SENTENCE =
  "AI editing does not remove copyright — safety comes from the source video, which is why this tool only clips your own video or verified free-licence video.";

/** Minimal navigator shape for the share flow (injectable for tests). */
export type ShareNavigator = {
  share?: (data: {
    files?: File[];
    title?: string;
    text?: string;
  }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
};

/** True when the device can share this file via its native sheet. */
export function shareSupported(
  nav: ShareNavigator,
  file: File,
): boolean {
  try {
    if (typeof nav.share !== "function") return false;
    if (typeof nav.canShare === "function") {
      return nav.canShare({ files: [file] });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Share one clip file through the device sheet.
 *  - "shared": the sheet completed.
 *  - "cancelled": the user dismissed the sheet.
 *  - "unsupported": no usable share path (caller falls back to
 *    download + deep links; a failed share is never reported as a
 *    post).
 */
export async function shareClipFile(
  nav: ShareNavigator,
  file: File,
  title: string,
  text: string,
): Promise<"shared" | "cancelled" | "unsupported"> {
  if (!shareSupported(nav, file)) return "unsupported";
  try {
    await nav.share!({ files: [file], title, text });
    return "shared";
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return "cancelled";
    }
    return "unsupported";
  }
}
