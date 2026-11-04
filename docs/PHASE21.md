# ClipForge Phase 21 — AI-combo backend pipeline + n8n workflow

Owner order: "write backend script with AI API combo with n8n
and everything". This phase adds the automation side of the
Phase 17/19 generator — the same topic-to-short chain as a
server-side pipeline plus an importable n8n workflow — and
builds NO new UI, NO new render path, and NO new provider.
Everything reuses the repo's own code.

## Shape decision (why a route + module, not a scripts/ caller)

The brief allowed two shapes: a webhook route, or a script
under `scripts/` that calls the site's own HTTP routes. This
phase builds the route shape, because the site's routes are
thin wrappers around library functions — calling the site's
own HTTP endpoints from inside the server would double the
rate limiting, need a base URL + auth for a call that never
leaves the process, and fail in exactly the ways the library
call cannot. So:

- `lib/ai-combo/pipeline.ts` — the pipeline module. It calls
  the same functions the routes call (`generateScript`,
  `searchCommonsVideos`, `segmentsToSrt`/`segmentsToVtt`,
  `combineAttributionLines`), so the backend chain cannot
  drift from what the `/generate` page does.
- `app/api/ai-combo/run/route.ts` — the single webhook call
  that runs the module. n8n users who do not want the
  step-by-step workflow call this one route instead.
- `n8n/ai-combo-workflow.json` — the step-by-step workflow,
  which DOES call the site's own HTTP routes (script,
  visuals, voiceover), because that is what n8n is for.

## What each piece does

### 1. Backend pipeline (`lib/ai-combo/pipeline.ts`)

Input: topic (1–200 chars), optional custom script (≤2000),
segment count (1–6, default 4), language (curated list,
English fallback), format (9:16/16:9/1:1), subtitle style
(resolved with Phase 19 defaults), voiceover flag (default
off). Steps, in order:

1. **Script.** Custom scripts split locally with no AI call
   (provider `"custom"`). AI scripts go through the exact
   existing Groq → Gemini → OpenRouter chain. No provider →
   `ai_not_connected`; unusable output → `script_failed`.
   Never a fake script.
2. **Licence-verified visuals, one per segment.** The exact
   Phase 17 search + Phase 11 verification path (Commons
   only, CC-BY / CC-BY-SA / CC0 / public domain, fail
   closed). A search failure stops the run
   (`visuals_failed`). Zero verified candidates is NOT a
   failure — it is the visuals route's own contract — so the
   segment is recorded with a null visual and counted in
   `segmentsWithoutVisuals`; the render step must fill it
   with own footage first.
3. **Subtitle files.** SRT + VTT from the same 5-second
   windows the browser composer plays (the window constant
   is pinned to `GENERATED_WINDOW_SEC` by test, so the two
   cannot drift).
4. **Voiceover slot.** The pipeline never synthesises audio
   and never stores audio bytes. Not requested →
   `not_requested`. Requested with no `ELEVENLABS_API_KEY` →
   `skipped` with the reason "voiceover skipped — key not
   configured", and the run continues. Requested with a key
   but a script over the voiceover route's 500-character
   limit → `skipped` with the limit reason (truncating
   narration mid-sentence would be a silent loss, so the
   record says so instead). Requested with a key and a
   fitting script → `pending_render`: generate the audio at
   render time via the existing voiceover route.
5. **Render-job record.** Status `needs_render`, with the
   job id, format + real dimensions, subtitle style,
   segments (text, keyword, timing, visual + licence +
   source URL), SRT/VTT text, attribution text, voiceover
   slot, and provenance (script provider, visual licences,
   source URLs). The record states in plain words that NO
   video has been produced: server-side rendering is not
   available on Vercel, so the job hands off to the browser
   renderer (which consumes exactly these segments, visuals,
   format, and subtitle style) or to the ffmpeg worker once
   its host exists.
6. **Post wiring.** A clip id, title, and hashtags in the
   exact shape the post panel needs — plus the rule that
   nothing has been posted. The pipeline writes NO activity
   row (there is no outcome to record: no share happened,
   and the activity enum has no "prepared" value — writing
   one would be a false record). When the rendered short is
   shared, the outcome is recorded via the existing
   `/api/post-activity` route, and it is never "published",
   because only the platform itself can confirm a live post.

Failures carry a stable kind (`invalid_input`,
`ai_not_connected`, `script_failed`, `visuals_failed`) that
the route maps to HTTP (400 / 503 / 502). No silent
fallbacks, no invented outputs anywhere.

### 2. Webhook route (`POST /api/ai-combo/run`)

Webhook-gated, mirroring the sweepers route: without
`AI_COMBO_WEBHOOK_SECRET` the route honestly 503s (not
configured); with it, only a matching
`Authorization: Bearer <value>` call runs, otherwise 401.
The value lives in the caller's automation — never in the
workflow file, never in this repo. Rate-limited per IP like
the other generate routes. The audit event (`ai-combo.run`)
is best-effort and never blocks the result. Returns the full
job record as JSON.

### 3. n8n workflow (`n8n/ai-combo-workflow.json` + README)

15 nodes, inactive on import (the owner activates it after
one manual test run): Trigger → Normalize Input → Generate
Script → Split Segments → Find Verified Visuals → Merge
Segments With Visuals → Attach Visual → Build Subtitles →
Voiceover Wanted? → Request Voiceover / Voiceover Not
Requested → Build Render-Job Record → Build Post Wiring →
Respond.

- HTTP steps call the site's own routes only (script,
  visuals, voiceover), all over https, all rate-limited.
- The Merge node rejoins segments with their visuals
  responses (HTTP steps replace items, so the segment text
  would otherwise be lost). The If node and the slot steps
  read the voiceover flag and subtitle data back from the
  Normalize Input / Build Subtitles nodes — n8n keeps every
  node's output for the run.
- The voiceover HTTP step continues on failure, so a missing
  voiceover never blocks the job; the slot step judges audio
  by binary data, never by assumption.
- The file contains NO credential values: no keys, no
  secrets, no passwords, no bearer values, no userinfo in
  URLs. If this file leaks, there is nothing to rotate.
- Two version-sensitive nodes are documented with fallbacks
  in `n8n/README.md`: the Merge node (re-pick Combine →
  Merge by Position) and the If node's two conditions
  (voiceover is true AND voiceoverTooLong is false).

## What changed (files)

- `lib/ai-combo/pipeline.ts` (new) — pipeline module.
- `app/api/ai-combo/run/route.ts` (new) — webhook route.
- `n8n/ai-combo-workflow.json` (new) — importable workflow.
- `n8n/README.md` (new) — import steps + limits.
- `tests/phase21-ai-combo.test.ts` (new) — 15 tests.
- `docs/PHASE21.md` (new) — this file.

## Verification (run before commit, all green)

- `npx vitest run` — full suite (see report; 15 new Phase
  21 tests: full-chain provenance, custom-script path,
  no-provider honesty, visuals-failure stop, invalid-input
  rejection, 16:9 dimensions, all three voiceover-slot
  branches, segment-window pin, route secret-gate pins,
  banned-promise + downloader greps, workflow parse +
  chain + secret hygiene + https-only routes).
- `npx tsc --noEmit` — 0 errors.
- `npx eslint` on all changed files — 0 errors.
- `npm run build` — 0 errors.
- `npx playwright test` — full suite green (no new spec:
  nothing browser-visible changed; the pipeline is
  server-side and pinned in vitest, not with fake browser
  renders).
- Workflow JSON parses; its node chain matches this doc.
- Downloader-term grep on changed files — zero.
  Banned-promise grep on new copy — zero. Secret-pattern
  grep on the workflow file — zero.
- No CSP change, no env change, no SQL, no new table, no
  deploy by the builder. `stash@{0}` (old Phase 4 publish
  WIP) untouched.

## Nothing else changed

Upload tool, CC paste, own-YouTube journey, clean audio,
rights panel, post panel, plan gates, billing binding, admin
gate, generate page, sweepers — all untouched. `/signin`
keeps working; logged-out `/admin` still redirects to
`/signin`.

## Honest gaps (not hidden)

- n8n cannot RUN this workflow until n8n itself has a home
  — the Oracle signup is the owner's tap. Importing the
  file is not running it.
- Server render needs the ffmpeg worker host
  (`WORKER_URL` + `WORKER_AUTH_SECRET`); until then the job
  record renders in the browser, exactly like a `/generate`
  run.
- Voiceover needs `ELEVENLABS_API_KEY`; without it the slot
  records a skip and the job continues without voiceover.
- The webhook route needs `AI_COMBO_WEBHOOK_SECRET` set in
  the site's environment before any caller can use it; until
  then it 503s honestly.
- A rendered short from a pipeline job has not been
  produced end-to-end yet (browser render of a job record
  is the live proof owed, after deploy).
- Real-phone share check is still owed (carried over).

## QA checklist (for the parent's live probe, after deploy)

- [ ] `POST /api/ai-combo/run` without the variable set →
      503 "not configured yet" (proves the gate, not a leak).
- [ ] With the variable set, no/wrong bearer → 401.
- [ ] With the bearer, a topic run returns a `needs_render`
      job record with script, visuals, SRT/VTT, attribution,
      voiceover slot, and post wiring — and no video bytes.
- [ ] `n8n/ai-combo-workflow.json` parses; node chain
      matches this doc; no credential values inside.
- [ ] Older flows unchanged: /generate, /create, CC paste,
      YouTube journey, /signin, logged-out /admin redirect.
