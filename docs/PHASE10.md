# ClipForge Phase 10 — "No demo, real only"

Owner order: no demo features, add real features. The homepage
previously carried an illustrated demo section that admitted, in its
own note, that "real demo videos from the site owner will replace
these drawings." That section is gone. Nothing on the site now
pretends a preview is output.

## What was removed

- The demo section from `app/page.tsx`: the three illustrated
  caption-style figures, the `DEMO_NOTE` paragraph, the
  `DEMO_STYLES`/`DEMO_NOTE` imports, and the comments describing
  demo frames.
- `DemoStyle`, `DEMO_STYLES`, and `DEMO_NOTE` from `lib/marketing.ts`.
- The demo assertions from `tests/marketing.test.ts` and the old
  demo-heading assertion from `e2e/home.spec.ts`.
- A repo-wide grep for `illustrat`, `demo`, `placeholder`, `lorem`,
  and `sample video` in user-facing code (`app/`, `components/`,
  `lib/`, `public/`) found nothing else to remove:
  - No `lorem` and no `sample video` anywhere.
  - `placeholder=` attributes on form inputs (admin, publish,
    billing forms) are legitimate input hints, not demo content —
    kept.
  - "Placeholders" wording for plan limits is disclosed honestly
    ("coming soon", owner-approved wording) — kept.
  - `CONTACT_EMAIL_PLACEHOLDER` on the contact/privacy/copyright/
    report pages is a pre-existing gap (the owner must publish a
    real mailbox), not demo content, and no address was invented —
    kept, listed under gaps.
  - Test/fixture hits are excluded from the user-facing sweep and
    are listed here: `e2e/home.spec.ts` uses `demo.mp4` as a test
    file name only (a minimal MP4 header, never shown to visitors).

## What is real now

1. **"See it work" section** (`app/page.tsx`, same position the demo
   section held): a heading, plain-words copy stating this is the
   real tool and not a preview, and a second `HeroUploadBox`. Picking
   a file there opens the actual clipper on `/create` with the file
   handed off in module memory — exactly like the hero box. No
   simulated output, no pre-baked results. `HeroUploadBox` takes an
   `id` prop now (`hero-upload` by default,
   `see-it-work-upload` for the second box) so two boxes on one page
   never share an input id.
2. **Server staging, wired into the real upload UI**
   (`lib/storage/stage-upload.ts` + a "Server copy (optional)" block
   in `components/ClipperTool.tsx`): the FIRST UI caller of the Phase 7
   chunked-upload client. Pressing the button attempts the R2
   multipart path; on success it reports the save. When R2 is not
   configured (today's live state), the initiate route answers 503
   with the shared `STORAGE_NOT_CONFIGURED` message and the UI says
   plainly that server storage is not set up yet and the video stays
   in the browser — the browser flow stays the live path. Any other
   failure throws an honest error; a failed staging is never
   reported as saved.
   - Why opt-in, not automatic: the homepage promises the video
     never leaves the browser (only the audio track goes out for
     transcription). Auto-staging on file pick would break that
     promise. Staging runs only when the user presses the button
     after reading that it uploads the full video.
   - `STORAGE_NOT_CONFIGURED` moved to the tiny client-safe module
     `lib/storage/not-configured.ts`; `lib/storage/r2.ts` re-exports
     it, so the server message is byte-identical and both server
     routes keep working.
3. **Real demo-asset slot** (`public/demo/README.md`): documents
   where real owner-provided clips will live and the rule that
   nothing generated, stock, or borrowed ever goes there. The folder
   is empty until the owner sends a video — no content was invented
   to fill it.

## Card-by-card audit (homepage claims vs. code)

Every feature-grid card and step proof point was checked against the
code. Verdicts:

| Card / step | Code evidence | Verdict |
|---|---|---|
| AI finds the moments | `lib/pipeline/virality.ts` scores hook 40% / pacing 35% / engagement 25%; manual clips (`addManualClip`) + honest no-key notices in the tool | LIVE — copy corrected: moments are 15–60s (search windows `minLen 15, maxLen 60`), not 30–60s |
| Word-level captions | `lib/captions.ts`; brand kit in `lib/brandkit.ts` + `BrandKitPanel` | LIVE |
| Face-centered vertical crop | `lib/browser/face.ts`; tool defaults to `cropMode "face"` with content-aware fallback | LIVE |
| Captions in 29 languages | `TRANSLATION_LANGUAGES` has 29 entries; count derived, never hardcoded; translation keeps the original as fallback | LIVE |
| Thumbnails that fit the clip | `lib/browser/thumbnails.ts`: best frame by luminance variance + optional text overlay, from the clip itself | LIVE |
| Share links with real view counts | `app/api/share/[token]` bumps the DB view count on fetch; counts never invented; DB-backed (503 honestly without DB) | LIVE |
| Multi-platform export | 720×1280 render; `lib/publish/validator.ts` enforces per-platform `maxDurationSec` | LIVE — nuance: length limits are enforced at the publish checklist, not at render |
| Schedule and queue posts | Phase 3 publisher (schedule + timezone + queue); per-platform `PUBLISH_*_ENABLED` / `*_APP_APPROVED` flags resolve OFF unless env is exactly `"true"`/`"1"` | LIVE, gated exactly as stated |
| Chat-driven clip tools (MCP) | `app/api/mcp`: read tools always; the one write tool only when `INTEGRATION_MCP_WRITES_ENABLED=true` + write scope; 503 without DB | LIVE, gated exactly as stated |
| Search your own clips | `lib/pipeline/search.ts` + `app/api/clips/search` | LIVE |
| Step 1: upload a video you own | Tool enforces 10 min / 500 MB; file stays in browser | CORRECTED — the old "bring a video from your own connected YouTube channel" clause was removed: the Phase 8 import verifies ownership only, has no UI, and the file still arrives via direct upload |
| Step 2: AI finds the moments | Transcript + highlights + viral score; keep (select) / trim (`ClipEditor`) / re-pick (re-run or manual); manual path verified | LIVE |
| Step 3: render, share, schedule | 720×1280, MP4 first with WebM fallback (`lib/browser/render.ts`); local download; DB-backed share links; publisher queue | LIVE |
| Hero + FAQs | Reassurance + step proofs state the no-key path; rights note true at UI level (the import API verifies metadata only and never downloads); voiceover honest message verified; clips capped at 180s (`MAX_CLIP_SEC`) | LIVE |
| Plans comparison | "Coming soon" prices — owner-approved wording, unchanged | KEPT AS IS |

## Verification

- vitest: full suite green (see parent report for counts).
- tsc: 0 errors. eslint: 0 on changed files. `next build`: 0.
- Playwright: `e2e/phase10.spec.ts` (no demo section text; "See it
  work" heading + both upload inputs present with distinct ids;
  see-it-work upload hands a file to the tool) plus existing home,
  polish, theme, auth specs as regressions.
- Downloader-term grep on changed files: zero. The own-YouTube
  import route still states it is NOT a downloader.
- No Supabase dashboard changes, no SQL, no Vercel env changes, no
  deploy by the builder. Old Phase 4 stash untouched.

## Honest gaps (not in this phase's scope)

- The own-YouTube import has an API but no UI — step 1 no longer
  advertises it. Import UI is a follow-up slice.
- R2 is unconfigured, so the staging fallback (browser-local) is the
  live path today; staged copies exist only once the owner
  configures R2.
- `CONTACT_EMAIL_PLACEHOLDER` still needs the owner's real mailbox.
- Older content pages are still unreskinned (Phase 9 gap).
- The demo-clips slot is empty until the owner sends a video.
- The worker still does not call `/api/render/callback` (Phase 8
  gap); publish post rows still carry caller-supplied userId
  (follow-up slice).

## QA checklist (run after deploy)

- [ ] Homepage shows no demo-section text and no "Illustrated
      previews" wording; "See it work — for real" is visible.
- [ ] Both upload inputs exist with distinct ids; picking a file in
      either opens `/create` with the file name shown.
- [ ] Tool shows the "Server copy (optional)" block once a file is
      loaded; pressing it with R2 unconfigured shows the
      not-configured message (not an error, not a fake save);
      clipping, transcription, and rendering still work.
- [ ] Sign-in flow unchanged; logged-out `/admin` still redirects
      to `/signin` with no admin UI.
