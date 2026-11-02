/**
 * Allowed imports (ClipForge hard rules).
 *
 * Link import exists ONLY for:
 *  (a) videos from a YouTube channel the user proved they own via
 *      Google OAuth — no OAuth token store exists yet, so this path
 *      honestly reports "not connected" until Phase 3's account linking
 *      lands;
 *  (b) Google Drive / Dropbox / Loom files from the user's own
 *      connected account — same "not connected" state today;
 *  (c) content with a verified permissive licence (CC-BY, CC-BY-SA,
 *      CC0, public domain) — the URL host must be allow-listed, the
 *      licence must be declared, and attribution text is auto-built;
 *      the file itself still arrives via direct upload in Phase 1
 *      (server-side CC fetch arrives with the ffmpeg worker);
 *  (d) direct file upload — the normal browser flow.
 *
 * There is NO arbitrary-URL import endpoint anywhere in this codebase.
 * Any URL fetch on these paths goes through the SSRF guard.
 */

import { z } from "zod";

export const IMPORT_SOURCES = [
  "youtube-owned",
  "drive",
  "dropbox",
  "loom",
  "cc-licensed",
  "direct-upload",
] as const;

export type ImportSource = (typeof IMPORT_SOURCES)[number];

/** Hosts a CC-licensed file URL may come from. */
export const CC_ALLOWED_HOSTS = [
  "upload.wikimedia.org",
  "commons.wikimedia.org",
  "*.pexels.com",
  "images.pexels.com",
  "cdn.pixabay.com",
  "*.archive.org",
];

/** API hosts for connected-account imports (never arbitrary hosts). */
export const CONNECTED_API_HOSTS: Record<string, string[]> = {
  "youtube-owned": ["*.googleapis.com"],
  drive: ["www.googleapis.com"],
  dropbox: ["api.dropboxapi.com", "content.dropboxapi.com"],
  loom: ["api.loom.com"],
};

export const CC_LICENSES = ["CC-BY", "CC-BY-SA", "CC0", "public-domain"] as const;
export type CcLicense = (typeof CC_LICENSES)[number];

export const ccImportSchema = z.object({
  source: z.literal("cc-licensed"),
  url: z.string().url().max(2048),
  license: z.enum(CC_LICENSES),
  author: z.string().min(1).max(200),
  title: z.string().min(1).max(300).optional(),
});

export const connectedImportSchema = z.object({
  source: z.enum(["youtube-owned", "drive", "dropbox", "loom"]),
  fileId: z.string().min(1).max(500),
});

export const importRequestSchema = z.union([
  ccImportSchema,
  connectedImportSchema,
]);

/** Attribution line auto-added to any CC-licensed clip's metadata. */
export function buildAttribution(
  title: string | undefined,
  author: string,
  license: CcLicense,
  url: string,
): string {
  const work = title?.trim() ? `"${title.trim()}"` : "This work";
  return `${work} by ${author} is licensed under ${license}. Source: ${url}`;
}

export const IMPORT_NOT_CONNECTED =
  "That connected account is not linked yet — connect it from the account page once linking is available, or upload the file directly.";
