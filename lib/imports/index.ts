/**
 * Allowed imports (ClipForge hard rules).
 *
 * Link import exists ONLY for:
 *  (a) videos from a YouTube channel the user proved they own via
 *      Google OAuth — live since Phase 8 at
 *      POST /api/imports/youtube-owned: the account must be
 *      connected while signed in, the pasted link must be a video
 *      on that exact channel, and ownership is verified through
 *      the YouTube Data API before any import receipt is issued
 *      (no video bytes are downloaded by that route);
 *  (b) Google Drive / Dropbox / Loom files from the user's own
 *      connected account — still "not connected" today (no
 *      per-provider import route yet);
 *  (c) content with a verified permissive licence (CC-BY, CC-BY-SA,
 *      CC0, public domain) — since Phase 11 the licence is verified
 *      server-side via POST /api/imports/cc-verify for Wikimedia
 *      Commons and Internet Archive links only (public APIs, no
 *      key), and the browser loads the file straight from the
 *      source host into the browser pipeline; attribution text is
 *      auto-built and travels into ZIP exports. Since Phase 12 the
 *      legacy POST /api/imports "cc-licensed" branch runs that same
 *      verification and ignores caller-declared licence facts — no
 *      route in this codebase answers "validated" for an unverified
 *      licence anymore;
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
  // Accepted for API compatibility but IGNORED since Phase 12: the
  // route verifies the licence itself and answers from verified
  // facts only (see app/api/imports/route.ts).
  license: z.enum(CC_LICENSES).optional(),
  author: z.string().min(1).max(200).optional(),
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
