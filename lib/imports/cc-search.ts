import { assertAllowedFetchUrl, type DnsLookup } from "./ssrf";
import { verifyCcUrl } from "./cc-verify";
import type { GeneratedVisual } from "./cc-types";

export type { GeneratedVisual } from "./cc-types";

/**
 * Wikimedia Commons video search for generated shorts (ClipForge
 * Phase 17).
 *
 * The search itself finds candidate titles ONLY — it never decides
 * a licence. Every candidate is passed through the exact same
 * `verifyCcUrl` path as a pasted link (File: page URL), so a
 * search result with an NC/ND, reserved, or unknown licence is
 * refused exactly like a pasted link would be. Search never
 * bypasses verification, and an unverified licence never reaches
 * a render. The search uses only the source's public API (no key).
 */

export type CommonsSearchDeps = {
  fetchFn?: typeof fetch;
  lookup?: DnsLookup;
  /** Override for tests: replaces the verify step. */
  verifyFn?: typeof verifyCcUrl;
};

export type CommonsSearchResult =
  | { ok: true; visuals: GeneratedVisual[]; note: string | null }
  | { ok: false; message: string };

/**
 * Commons `gsrsearch` treats a bare multi-word query as loose AND
 * terms, which returned zero verified videos for "ocean waves"
 * while the same words as a phrase returned matches (live-verified
 * 2026-11-08). Multi-word keywords are therefore sent as a quoted
 * phrase; a keyword that already contains a quote is left alone.
 */
export function commonsSearchTerm(keyword: string): string {
  const trimmed = keyword.trim();
  if (trimmed.includes('"')) return trimmed;
  return /\s/.test(trimmed) ? `"${trimmed}"` : trimmed;
}

const SEARCH_LIMIT = 8;
const VERIFY_LIMIT = 5;
const RETURN_LIMIT = 3;

type SearchPage = {
  title?: string;
  imageinfo?: Array<{ url?: string; mime?: string }>;
};

/**
 * Search Commons for videos matching a keyword. Returns verified
 * visuals only. A search failure is an error (fail closed); zero
 * verified candidates is a successful empty result with an honest
 * note — the UI then offers another keyword or an own-footage
 * upload, never an invented visual.
 */
export async function searchCommonsVideos(
  keyword: string,
  deps: CommonsSearchDeps = {},
): Promise<CommonsSearchResult> {
  const fetchFn = deps.fetchFn ?? fetch;
  const verifyFn = deps.verifyFn ?? verifyCcUrl;
  const query =
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
    `&gsrsearch=${encodeURIComponent(`filetype:video ${commonsSearchTerm(keyword)}`)}` +
    `&gsrnamespace=6&gsrlimit=${SEARCH_LIMIT}` +
    `&prop=imageinfo&iiprop=url|mime&format=json&formatversion=2`;
  let checked: URL;
  try {
    checked = await assertAllowedFetchUrl(
      query,
      ["commons.wikimedia.org"],
      deps.lookup,
    );
  } catch {
    return {
      ok: false,
      message:
        "Wikimedia Commons could not be reached to search for footage — try again, or upload your own footage.",
    };
  }
  let res: Response;
  try {
    res = await fetchFn(checked.toString(), {
      headers: {
        "User-Agent": "AI-Video-Clipper Commons footage search",
        Accept: "application/json",
      },
    });
  } catch {
    return {
      ok: false,
      message:
        "Wikimedia Commons could not be reached to search for footage — try again, or upload your own footage.",
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      message:
        "Wikimedia Commons could not be reached to search for footage — try again, or upload your own footage.",
    };
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return {
      ok: false,
      message:
        "Wikimedia Commons answered in a form this search does not understand — try again, or upload your own footage.",
    };
  }
  const pages = (data as { query?: { pages?: SearchPage[] } }).query?.pages ?? [];
  const candidates = pages
    .filter(
      (p): p is Required<SearchPage> =>
        typeof p.title === "string" &&
        Array.isArray(p.imageinfo) &&
        p.imageinfo.length > 0 &&
        typeof p.imageinfo[0].mime === "string" &&
        p.imageinfo[0].mime.startsWith("video/"),
    )
    .slice(0, VERIFY_LIMIT);
  const visuals: GeneratedVisual[] = [];
  for (const page of candidates) {
    if (visuals.length >= RETURN_LIMIT) break;
    const pageUrl = `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`;
    let verified;
    try {
      verified = await verifyFn(pageUrl, { fetchFn, lookup: deps.lookup });
    } catch {
      continue;
    }
    if (!verified.ok) continue;
    const file = verified.verified.files[0];
    if (!file) continue;
    visuals.push({
      title: verified.verified.title,
      author: verified.verified.author,
      license: verified.verified.license,
      sourceUrl: verified.verified.sourceUrl,
      attribution: verified.verified.attribution,
      fileUrl: file.url,
      fileName: file.name,
    });
  }
  if (visuals.length === 0) {
    return {
      ok: true,
      visuals: [],
      note: `No free-licence video was found on Wikimedia Commons for "${keyword}" — try another keyword, or upload your own footage for this segment.`,
    };
  }
  return { ok: true, visuals, note: null };
}
