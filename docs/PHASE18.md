# ClipForge Phase 18 — Tool-fix slice: CSP blob-fetch break in the older clip tool

## The bug (pre-existing, NOT a Phase 17 regression)

The site's CSP `connect-src` does not list `blob:` (see
`next.config.ts`: `connect-src 'self' https://cdn.jsdelivr.net
https://storage.googleapis.com https://upload.wikimedia.org
https://commons.wikimedia.org https://archive.org
https://*.archive.org`). A browser `fetch()` of a `blob:` URL is
therefore refused. Phase 17's generator hit the same wall while
debugging its ZIP download and fixed it by keeping the rendered
bytes in state instead of fetching them back (proven by its
passing `generated-short.zip` download event). The older clip
tool still fetched its own rendered clip URL back in two places,
so ZIP download + post-panel sharing broke for
browser-rendered clips — the download button and the share
button silently failed (the fetch threw, caught as a generic
failure) instead of delivering the clip.

## Audit first (whole codebase, before fixing)

| Site | What it fetches | Verdict |
| --- | --- | --- |
| `components/ClipperTool.tsx` ~744 (`downloadAllZip`) | `fetch(out.url)` where `out.url` is an object URL of the rendered clip | **Broken — fixed here** |
| `components/ClipperTool.tsx` ~1654 (`PostClip getBlob`) | `fetch(out.url).then(r => r.blob())` | **Broken — fixed here** |
| `components/GenerateTool.tsx` ~396, ~738 | already state-based (`rendered.blob.arrayBuffer()`, `getBlob={() => rendered.blob}`) | Already correct (Phase 17 pattern) |
| `components/CcPasteImport.tsx:140` | `fetch(selectedUrl)` — an `https:` URL on the Phase 11 allow-listed CC hosts | Not a blob fetch; CSP already lists those hosts. Unchanged |
| `app/api/*` server routes (render jobs, publish, strikes review) | worker URLs / platform URLs, server-side | Server-side fetches are not governed by browser CSP `connect-src`. Unchanged |
| Every other client `fetch(` | `/api/...` routes (`'self'`) | Allowed by `connect-src`. Unchanged |
| `components/ClipperTool.tsx` download anchor (`href={out.url}`) | plain anchor download, not a fetch | Not governed by `connect-src`. Unchanged |

No other blob-fetching path exists in the client codebase.

## The fix (Phase 17 pattern, applied to the tool)

No CSP change. `connect-src` still does not list `blob:`, by
design — `img-src` and `media-src` list `blob:` so `<video>` /
`<img>` elements can play object URLs, but `fetch()` stays
refused, so any future fetch-back fails loudly instead of
silently shipping a broken button. The vitest pin below guards
it.

- `components/ClipperTool.tsx`, `Rendered` type: gains
  `blob: Blob` beside the existing `url`.
- Render completion stores `blob: result.blob` alongside the
  object URL — the same bytes the URL already referenced, so
  this pins no new memory (the URL pinned them already) and
  `resetForFile` still drops the state on a new file.
- ZIP export reads `await out.blob.arrayBuffer()` instead of
  `await (await fetch(out.url)).arrayBuffer()`.
- Post-panel `getBlob` returns `async () => out.blob` instead
  of `fetch(out.url).then(r => r.blob())`. `PostClip` itself
  is untouched apart from its prop comment (it said
  "browser-local blob URL"; it now says the bytes come from
  state and are never fetched back).

## Byte-identical, by construction

The ZIP path builds entries from `arrayBuffer()` of the exact
same `Blob` object the object URL pointed at — literally
identical bytes, not a re-encode. The entry names, SRT/VTT
generation, attribution joining (`ATTRIBUTION.txt`), and the
`clips.zip` filename are untouched code. The post panel builds
its `File` from the same blob with the same name/type, so the
share sheet receives the same file it received before (when
the fetch-back happened to work, e.g. before the CSP
tightened). Only the delivery mechanism changed.

## Verification (all green, before commit)

- **vitest: 441/441** (437 pre-existing + 4 new in
  `tests/phase18-blob-state.test.ts`: no `fetch(out.url)` in
  the tool, state bytes present, `connect-src` without `blob:`,
  post-panel comment contract).
- **tsc: 0 errors; eslint: 0 on changed files;
  `next build`: 0.**
- **Playwright: 50/50** (49 pre-existing + 1 new in
  `e2e/phase18.spec.ts`): the real tool, driven with a real
  2s fixture clip (`e2e/fixtures/test-clip.mp4`, ffmpeg
  test-pattern + tone, 57 KB, committed with the spec) —
  manual cut → browser render (center crop, no face
  detection) → ZIP download event fires as `clips.zip` with a
  valid stored-ZIP body (PK header, clip entry name
  readable) → share-sheet post receives one real file
  (`.mp4`/`.webm`, size > 0) via a stubbed `navigator.share`
  → a fetch wrapper records **zero** `fetch(blob:)` calls
  across the whole flow.
- Downloader-term grep on changed files — **zero** hits.
- Tree clean at commit; `git ls-remote` equals the reported
  HEAD; `stash@{0}` (old Phase 4 publish WIP) untouched.

## Nothing else changed

AI moments, clean-audio toggle, rights panel, generate flow,
plan gates, billing binding, admin gate, own-YouTube journey,
CC import, activity log, sweepers, Ink + Record identity —
all untouched. `/signin` keeps working; logged-out `/admin`
keeps redirecting to `/signin`.

## Honest gaps (not hidden)

- The spec's share assertion stubs `navigator.share` (desktop
  Chromium has no real share sheet), so the real-phone share
  check is still owed on a device — the spec proves the panel
  receives the real blob, not that a phone sheet opens.
- The fixture render uses synthetic footage, not a user's real
  video; the render path itself is the production browser
  renderer, unchanged.
- Rendered clip object URLs were never revoked before and
  still are not (pre-existing behavior, out of scope).

## QA checklist (for the parent's live probe, after deploy)

- [ ] /create renders; manual cut + render works on a real clip.
- [ ] "Download all clips + captions (ZIP)" downloads
      `clips.zip` with the rendered clip + captions inside.
- [ ] Post-panel share on a real phone receives the clip file.
- [ ] /signin works; logged-out /admin redirects to /signin.
- [ ] Generate flow, own-YouTube journey, CC import unchanged.
