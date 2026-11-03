# ClipForge Phase 11 — CC-verified paste import

Owner order: "from video link they can [make a] short video and make
viral clips." This is the guest-usable link→clips path. The Phase 8
own-YouTube import is signed-in-only and still needs the owner's
YouTube OAuth app to run at all; this phase gives every visitor a
link path that is legal without any account.

## What it is (and is not)

A visitor pastes a video link. The server checks the licence first,
using only the source's public API (no key). Only a verified free
licence reaches the "Load this video" step, and the file then loads
straight from the source host into the existing browser pipeline
(transcription → viral moments → clips). No video bytes pass
through this server, nothing is stored server-side, and there is no
R2 dependency.

This is NOT a downloader: the allow-list is closed and exact, the
server reads licence metadata only, and every other host is refused
with a specific reason. The Phase 8 own-YouTube ownership check and
the Phase 2 fingerprint/unscanned rules are untouched.

## Accepted hosts and licences

| Source | Accepted hosts | Verification | Accepted licences |
|---|---|---|---|
| Wikimedia Commons | `commons.wikimedia.org`, `upload.wikimedia.org` | `w/api.php` `imageinfo` (`url`, `extmetadata`, `size`, `mime`): `LicenseShortName` + `LicenseUrl`, `Artist` as author, canonical file page as source | CC-BY, CC-BY-SA, CC0, public domain |
| Internet Archive | `archive.org`, `*.archive.org` (download hosts) | `archive.org/metadata/<id>`: `licenseurl`, `title`, `creator`, video files list | CC-BY, CC-BY-SA, CC0, public domain (via `creativecommons.org/licenses/by/…`, `/by-sa/…`, `/publicdomain/zero/…`, `/publicdomain/mark/…`) |

Accepted link shapes: Commons `File:` pages (including
`Special:FilePath`), direct `upload.wikimedia.org` files (thumbnail
URLs are resolved to the original), Archive item pages
(`/details/<id>`, offering every video file in the item, originals
first, MP4 first) and Archive download links (`/download/<id>/<file>`,
pinning one file).

## Refusal reasons (never generic, never a silent fallback)

| Reason | Meaning |
|---|---|
| `HOST_NOT_ALLOWED` | Host is not Wikimedia Commons or Internet Archive, or a redirect left the allow-list |
| `INVALID_URL` | Not a valid http(s) link |
| `NOT_FOUND` | File/item not found on the source, or the link is not a file/item link the check knows |
| `NOT_A_VIDEO` | The file is not a video, or the item holds no video file |
| `LICENSE_NOT_FREE` | NC, ND, "all rights reserved", or another restrictive licence |
| `LICENSE_UNKNOWN` | No usable licence found — refused rather than assumed free |
| `VERIFY_UNAVAILABLE` | Source API unreachable, unreadable, or redirecting excessively (HTTP 502) |

NC/ND terms are checked before free terms, so "CC BY-NC-SA" is never
misread as free via its "BY-SA" substring. The Phase 1 SSRF guard is
reused for every server fetch (allow-list + public-IP-only DNS);
redirects are followed only while each hop stays allow-listed.

## Browser loading and CSP

The verified file loads with a plain browser `fetch` from the source
host. This phase found and fixed a real blocker: the site's CSP
`connect-src` did not include the CC hosts, so every load would have
been blocked before the network (the first e2e run proved it — the
CORS message appeared with no request ever issued). `next.config.ts`
now adds `upload.wikimedia.org`, `commons.wikimedia.org`,
`archive.org`, and `*.archive.org` to `connect-src` — nothing else
is opened. When a host still blocks the direct load (CORS), the UI
says so plainly and links the source page for a manual download +
direct upload.

## Rights integration (Phase 2 pattern)

The verified licence + author + title + source URL are recorded as
the loaded video's licence metadata in the tool. The ZIP export
combines attribution lines (`combineAttributionLines` in
`lib/rights/attribution.ts`): a CC-import credit joins the music
credit in a single `ATTRIBUTION.txt`. Switching to a direct upload
clears the CC facts, so a later upload never inherits a previous
link's licence. The rights-confirmation checkbox still gates
transcription — a verified licence does not skip the user's own
confirmation.

## UI entries

- Homepage hero and "See it work" boxes: an Upload / Paste-a-link
  tab pair (`HeroUploadBox`, distinct ids per box). The paste tab
  carries the link to `/create` in module memory
  (`setPendingCcUrl` / `takePendingCcUrl`), where the tool's paste
  panel auto-verifies it once.
- `/create` tool: a "Paste a video link" section beside the upload
  dropzone (`CcPasteImport`). Guests use it within the existing
  browser caps (10 min / 500 MB, enforced by the same file gates as
  a direct upload); signed-in users keep their plan gates at
  render/publish.

## Verification

- vitest: full suite green (new `tests/phase11-cc-verify.test.ts`:
  licence classification, URL parsing, mocked Commons/Archive
  verification flows, host refusal before any fetch, redirect
  escape, fail-closed unreachable API, attribution combining,
  route-level refusals).
- tsc: 0 errors. eslint: 0 on changed files. `next build`: 0.
- Playwright: `e2e/phase11.spec.ts` (hero paste tabs on both boxes,
  hero→clipper handoff with auto-verify, real-route YouTube refusal,
  mocked non-free refusal, mocked verified load into the tool) plus
  the full suite as regression (auth spec needs Playwright's own
  server env; a manually started server without the dummy Supabase
  values fails it for unrelated reasons — verified by rerun).
- Downloader-term grep on changed files: zero outside "NOT a
  downloader" statements and `archive.org/download` URL paths.

## Honest gaps (not hidden)

- The legacy `POST /api/imports` "cc-licensed" branch still accepts
  a caller-declared licence for API compatibility. No UI uses it,
  and it must not be presented as verified — follow-up: route it
  through the same verification or remove it.
- Real-world CORS behavior per host is untested live: Wikimedia
  media and Archive downloads are expected to allow direct browser
  loads, but if either blocks in practice, visitors fall back to
  download + direct upload (the UI already says so).
- Live verification against the real Commons/Archive APIs was not
  run from this sandbox (no live check of a real link) — the first
  real-link paste after deploy is the live proof owed.
- Pexels/Pixabay stay excluded (they need API keys); Drive /
  Dropbox / Loom stay at honest 503; paste-any-link stays refused.
- Phase 12 (professional identity pass) is next; it starts after
  this phase lands — no parallel clipper work.
