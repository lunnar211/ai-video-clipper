/**
 * CC-verified paste import (ClipForge Phase 11).
 *
 * A visitor pastes a video link; the server verifies the licence
 * BEFORE any video bytes move, using only the source's public API
 * (no key). This is NOT a downloader and never fetches video bytes
 * server-side: it reads licence metadata only, then hands the
 * browser a direct file URL on the source host. The browser loads
 * the file into the existing browser pipeline; if the host blocks
 * that direct load (CORS), the UI says so honestly.
 *
 * Closed allow-list, exact hosts only:
 *   - Wikimedia Commons: commons.wikimedia.org, upload.wikimedia.org
 *   - Internet Archive: archive.org, *.archive.org (download hosts)
 * Every other host is refused. Redirects are followed only while
 * each hop stays on the allow-list (SSRF guard reused, never
 * bypassed). An unreachable or ambiguous verification API is a
 * refusal (fail closed) — a licence is never assumed free.
 *
 * Accepted licences: CC-BY, CC-BY-SA, CC0, public domain. Anything
 * with NC or ND terms, "all rights reserved", or an unknown/missing
 * licence is refused with a specific reason.
 */

import { assertAllowedFetchUrl, hostAllowed, type DnsLookup } from "./ssrf";
import { buildAttribution } from "./index";
import type {
  CcImportMeta,
  CcLicense,
  CcVerifiedFile,
  CcVerifiedImport,
} from "./cc-types";

export type { CcLicense } from "./cc-types";

/** Exact hosts a pasted CC link may come from. Nothing else. */
export const CC_VERIFY_HOSTS = [
  "commons.wikimedia.org",
  "upload.wikimedia.org",
  "archive.org",
  "*.archive.org",
];

export type CcVerifyReason =
  | "INVALID_URL"
  | "HOST_NOT_ALLOWED"
  | "NOT_A_VIDEO"
  | "NOT_FOUND"
  | "LICENSE_NOT_FREE"
  | "LICENSE_UNKNOWN"
  | "VERIFY_UNAVAILABLE";

export type CcVerifyResult =
  | { ok: true; verified: CcVerifiedImport }
  | { ok: false; reason: CcVerifyReason; message: string };

export type CcVerifyDeps = {
  fetchFn?: typeof fetch;
  lookup?: DnsLookup;
};

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".webm",
  ".mov",
  ".mkv",
  ".ogv",
  ".m4v",
  ".avi",
]);

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function isVideoName(name: string): boolean {
  return VIDEO_EXTENSIONS.has(fileExtension(name));
}

/**
 * Classify a licence from its short name and/or licence URL.
 * NC/ND/reserved terms are checked FIRST so "CC BY-NC-SA" is never
 * misread as free via its "BY-SA" substring.
 */
export function classifyLicense(
  shortName: string | undefined,
  licenseUrl: string | undefined,
): CcLicense | "not-free" | "unknown" {
  const text = `${shortName ?? ""} ${licenseUrl ?? ""}`.toLowerCase();
  if (
    /by-nc|by-nd|noncommercial|non-commercial|noderivatives|no-derivatives|all[- ]rights[- ]reserved|copyrighted/.test(
      text,
    )
  ) {
    return "not-free";
  }
  if (/zero|cc0/.test(text)) return "CC0";
  if (/by-sa/.test(text)) return "CC-BY-SA";
  if (/publicdomain\/mark|public domain/.test(text)) return "public-domain";
  if (/\/by\/|cc by\b|cc-by/.test(text)) return "CC-BY";
  return "unknown";
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .trim();
}

function refuse(reason: CcVerifyReason, message: string): CcVerifyResult {
  return { ok: false, reason, message };
}

/** Fetch that follows redirects only while each hop stays allow-listed. */
async function fetchAllowed(
  rawUrl: string,
  deps: CcVerifyDeps,
): Promise<Response> {
  const fetchFn = deps.fetchFn ?? fetch;
  let current = rawUrl;
  for (let hop = 0; hop < 5; hop++) {
    let checked: URL;
    try {
      checked = await assertAllowedFetchUrl(current, CC_VERIFY_HOSTS, deps.lookup);
    } catch (err) {
      const message = err instanceof Error ? err.message : "URL rejected.";
      if (message.includes("allowed list")) {
        throw new Error("HOST_NOT_ALLOWED:" + message);
      }
      throw new Error("VERIFY_UNAVAILABLE:" + message);
    }
    const res = await fetchFn(checked.toString(), {
      redirect: "manual",
      headers: {
        "User-Agent": "AI-Video-Clipper CC-license verification",
        Accept: "application/json",
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new Error("VERIFY_UNAVAILABLE:That source redirected without a destination.");
      }
      current = new URL(location, checked.toString()).toString();
      continue;
    }
    return res;
  }
  throw new Error(
    "VERIFY_UNAVAILABLE:That source redirected too many times to check.",
  );
}

function mapFetchError(err: unknown): CcVerifyResult {
  const message = err instanceof Error ? err.message : "Verification failed.";
  const colon = message.indexOf(":");
  if (colon > 0) {
    const code = message.slice(0, colon);
    const rest = message.slice(colon + 1);
    if (code === "HOST_NOT_ALLOWED") {
      return refuse("HOST_NOT_ALLOWED", rest);
    }
    if (code === "VERIFY_UNAVAILABLE") {
      return refuse("VERIFY_UNAVAILABLE", rest);
    }
  }
  return refuse(
    "VERIFY_UNAVAILABLE",
    "The source could not be reached to check the licence — try again, or download the file and upload it directly.",
  );
}

// ---------------------------------------------------------------------------
// Wikimedia Commons
// ---------------------------------------------------------------------------

export type WikimediaTarget = { title: string };

/**
 * Parse a pasted Wikimedia URL into a Commons file title, or null
 * when it is not a Commons file link. Accepts File: pages
 * (including Special:FilePath), direct upload.wikimedia.org files,
 * and thumbnail URLs (the original filename is recovered).
 */
export function parseWikimediaUrl(url: URL): WikimediaTarget | null {
  const host = url.hostname.toLowerCase();
  if (host === "commons.wikimedia.org") {
    const path = decodeURIComponentSafe(url.pathname);
    if (path === null) return null;
    const filePage = path.match(/^\/wiki\/File:(.+)$/);
    if (filePage) return { title: `File:${filePage[1]}` };
    const special = path.match(/^\/wiki\/Special:FilePath\/(.+)$/);
    if (special) return { title: `File:${special[1]}` };
    const queryTitle = url.searchParams.get("title");
    if (queryTitle && queryTitle.startsWith("File:")) {
      return { title: queryTitle };
    }
    return null;
  }
  if (host === "upload.wikimedia.org") {
    const path = decodeURIComponentSafe(url.pathname);
    if (path === null) return null;
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) return null;
    let filename = segments[segments.length - 1];
    // Thumbnail URLs end in "<width>px-<original filename>".
    const thumb = filename.match(/^\d+px-(.+)$/);
    if (thumb) filename = thumb[1];
    if (!filename.includes(".")) return null;
    return { title: `File:${filename}` };
  }
  return null;
}

function decodeURIComponentSafe(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

type CommonsImageInfo = {
  url?: string;
  descriptionurl?: string;
  mime?: string;
  size?: number;
  user?: string;
  extmetadata?: {
    LicenseShortName?: { value?: string };
    LicenseUrl?: { value?: string };
    Artist?: { value?: string };
  };
};

async function verifyWikimedia(
  target: WikimediaTarget,
  deps: CcVerifyDeps,
): Promise<CcVerifyResult> {
  const api =
    `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo` +
    `&titles=${encodeURIComponent(target.title)}` +
    `&iiprop=url|extmetadata|size|mime&format=json&formatversion=2`;
  let res: Response;
  try {
    res = await fetchAllowed(api, deps);
  } catch (err) {
    return mapFetchError(err);
  }
  if (!res.ok) {
    return refuse(
      "VERIFY_UNAVAILABLE",
      "Wikimedia Commons could not be reached to check the licence — try again, or download the file and upload it directly.",
    );
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return refuse(
      "VERIFY_UNAVAILABLE",
      "Wikimedia Commons answered in a form this check does not understand — the licence could not be verified, so the link is refused.",
    );
  }
  const pages = (data as { query?: { pages?: Array<{ missing?: boolean; title?: string; imageinfo?: CommonsImageInfo[] }> } })
    .query?.pages;
  const page = pages?.[0];
  const info = page?.imageinfo?.[0];
  if (!page || page.missing || !info || !info.url) {
    return refuse(
      "NOT_FOUND",
      "That file was not found on Wikimedia Commons. Paste the file's own page or direct file link.",
    );
  }
  if (info.mime && !info.mime.startsWith("video/")) {
    return refuse(
      "NOT_A_VIDEO",
      `That Commons file is a ${info.mime} file, not a video. Only video files can be clipped.`,
    );
  }
  if (info.mime === undefined && !isVideoName(info.url)) {
    return refuse(
      "NOT_A_VIDEO",
      "That Commons file does not look like a video. Only video files can be clipped.",
    );
  }
  const license = classifyLicense(
    info.extmetadata?.LicenseShortName?.value,
    info.extmetadata?.LicenseUrl?.value,
  );
  if (license === "not-free") {
    return refuse(
      "LICENSE_NOT_FREE",
      "That file's licence does not allow reuse here (it restricts commercial use, derivatives, or all rights are reserved). Only CC-BY, CC-BY-SA, CC0, and public-domain files are accepted.",
    );
  }
  if (license === "unknown") {
    return refuse(
      "LICENSE_UNKNOWN",
      "That file's licence could not be confirmed as free — no usable licence was found on its Commons page, so the link is refused rather than assumed free.",
    );
  }
  const title = (page.title ?? target.title).replace(/^File:/, "");
  const authorRaw = info.extmetadata?.Artist?.value;
  const author = authorRaw
    ? stripHtml(authorRaw)
    : info.user
      ? info.user
      : "Unknown author";
  const sourceUrl = info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(target.title)}`;
  const filename = info.url.split("/").filter(Boolean).pop() ?? title;
  const meta: CcImportMeta = {
    license,
    author,
    title,
    sourceUrl,
    attribution: buildAttribution(title, author, license, sourceUrl),
  };
  return {
    ok: true,
    verified: {
      ...meta,
      files: [{ name: filename, url: info.url, size: info.size }],
    },
  };
}

// ---------------------------------------------------------------------------
// Internet Archive
// ---------------------------------------------------------------------------

export type ArchiveTarget =
  | { kind: "item"; identifier: string }
  | { kind: "file"; identifier: string; filename: string };

/**
 * Parse a pasted Internet Archive URL, or null when it is not an
 * Archive item or download link. Item pages offer every video file
 * in the item; download links pin one file.
 */
export function parseArchiveUrl(url: URL): ArchiveTarget | null {
  const host = url.hostname.toLowerCase();
  if (host !== "archive.org" && !host.endsWith(".archive.org")) return null;
  const segments = decodeURIComponentSafe(url.pathname)
    ?.split("/")
    .filter(Boolean);
  if (!segments || segments.length < 2) return null;
  if (segments[0] === "details") {
    const identifier = segments[1];
    if (!/^[A-Za-z0-9_.\-]+$/.test(identifier)) return null;
    return { kind: "item", identifier };
  }
  if (segments[0] === "download") {
    const identifier = segments[1];
    if (!/^[A-Za-z0-9_.\-]+$/.test(identifier)) return null;
    const filename = segments.slice(2).join("/");
    if (!filename) return null;
    return { kind: "file", identifier, filename };
  }
  return null;
}

type ArchiveMetadata = {
  metadata?: {
    title?: string | string[];
    creator?: string | string[];
    licenseurl?: string;
  };
  files?: Array<{
    name?: string;
    format?: string;
    size?: number | string;
    source?: string;
  }>;
};

function firstString(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return undefined;
}

async function verifyArchive(
  target: ArchiveTarget,
  deps: CcVerifyDeps,
): Promise<CcVerifyResult> {
  const api = `https://archive.org/metadata/${encodeURIComponent(target.identifier)}`;
  let res: Response;
  try {
    res = await fetchAllowed(api, deps);
  } catch (err) {
    return mapFetchError(err);
  }
  if (res.status === 404) {
    return refuse(
      "NOT_FOUND",
      "That Internet Archive item was not found. Check the link and try again.",
    );
  }
  if (!res.ok) {
    return refuse(
      "VERIFY_UNAVAILABLE",
      "The Internet Archive could not be reached to check the licence — try again, or download the file and upload it directly.",
    );
  }
  let data: ArchiveMetadata;
  try {
    data = await res.json();
  } catch {
    return refuse(
      "VERIFY_UNAVAILABLE",
      "The Internet Archive answered in a form this check does not understand — the licence could not be verified, so the link is refused.",
    );
  }
  const license = classifyLicense(undefined, data.metadata?.licenseurl);
  if (license === "not-free") {
    return refuse(
      "LICENSE_NOT_FREE",
      "That item's licence does not allow reuse here (it restricts commercial use, derivatives, or all rights are reserved). Only CC-BY, CC-BY-SA, CC0, and public-domain items are accepted.",
    );
  }
  if (license === "unknown") {
    return refuse(
      "LICENSE_UNKNOWN",
      "That item's licence could not be confirmed as free — no usable licence was found on its Archive page, so the link is refused rather than assumed free.",
    );
  }
  const title =
    firstString(data.metadata?.title) ?? target.identifier;
  const author =
    firstString(data.metadata?.creator) ?? "Unknown author";
  const sourceUrl = `https://archive.org/details/${target.identifier}`;
  const meta: CcImportMeta = {
    license,
    author,
    title,
    sourceUrl,
    attribution: buildAttribution(title, author, license, sourceUrl),
  };
  const allFiles = (data.files ?? []).filter(
    (f): f is { name: string; size?: number | string; source?: string } =>
      typeof f.name === "string" && isVideoName(f.name),
  );
  if (target.kind === "file") {
    if (!isVideoName(target.filename)) {
      return refuse(
        "NOT_A_VIDEO",
        "That Archive file is not a video. Only video files can be clipped.",
      );
    }
    const match = allFiles.find((f) => f.name === target.filename);
    if (!match) {
      return refuse(
        "NOT_FOUND",
        "That file was not found inside its Internet Archive item. Check the link and try again.",
      );
    }
    return {
      ok: true,
      verified: {
        ...meta,
        files: [toVerifiedFile(target.identifier, match)],
      },
    };
  }
  if (allFiles.length === 0) {
    return refuse(
      "NOT_A_VIDEO",
      "That Internet Archive item contains no video file to clip.",
    );
  }
  // Originals first, MP4 first, larger first — the best source wins,
  // and the UI still lets the visitor pick another file.
  const sorted = [...allFiles].sort((a, b) => {
    const orig = (x: { source?: string }) => (x.source === "original" ? 0 : 1);
    if (orig(a) !== orig(b)) return orig(a) - orig(b);
    const mp4 = (x: { name: string }) => (fileExtension(x.name) === ".mp4" ? 0 : 1);
    if (mp4(a) !== mp4(b)) return mp4(a) - mp4(b);
    return Number(b.size ?? 0) - Number(a.size ?? 0);
  });
  return {
    ok: true,
    verified: { ...meta, files: sorted.map((f) => toVerifiedFile(target.identifier, f)) },
  };
}

function toVerifiedFile(
  identifier: string,
  file: { name: string; size?: number | string },
): CcVerifiedFile {
  const encoded = file.name
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return {
    name: file.name,
    url: `https://archive.org/download/${identifier}/${encoded}`,
    size: typeof file.size === "string" ? Number(file.size) || undefined : file.size,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Verify a pasted link as a CC-licensed video import. Returns the
 * verified licence facts and the direct file URL(s) for the browser
 * to load, or a specific refusal. Never assumes a licence is free.
 */
export async function verifyCcUrl(
  rawUrl: string,
  deps: CcVerifyDeps = {},
): Promise<CcVerifyResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return refuse("INVALID_URL", "That is not a valid link. Paste a full video link.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return refuse("INVALID_URL", "Only http(s) links are accepted.");
  }
  if (!hostAllowed(url.hostname, CC_VERIFY_HOSTS)) {
    return refuse(
      "HOST_NOT_ALLOWED",
      "Only Wikimedia Commons and Internet Archive links are accepted here. Links from YouTube, TikTok, Instagram, Facebook, X, or other sites are refused — paste a link from one of those two free-licence sources, or upload a video file directly.",
    );
  }
  const wikimedia = parseWikimediaUrl(url);
  if (wikimedia) return verifyWikimedia(wikimedia, deps);
  const archive = parseArchiveUrl(url);
  if (archive) return verifyArchive(archive, deps);
  // Allow-listed host, but not a file or item link this check knows.
  if (url.hostname.toLowerCase().endsWith("wikimedia.org")) {
    return refuse(
      "NOT_FOUND",
      "That is not a Wikimedia Commons file link. Paste the file's own page (File:…) or its direct file link.",
    );
  }
  return refuse(
    "NOT_FOUND",
    "That is not an Internet Archive item or download link. Paste an item page or a download link from archive.org.",
  );
}
