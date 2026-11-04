# ClipForge Phase 17 — "AI Generate Short": topic in, original short out

Owner order: add MoneyPrinterTurbo's features to the site, and "fix
link fetching so AI recognizes and auto-makes shorts for social
accounts, anyhow do it". Follow-ups confirmed: (1) this is AI video
generation as an extra feature inside the site, with a nav bar
button labelled "AI Video Generation" linking to the new /generate
entry; (2) the FULL MoneyPrinterTurbo feature set is the TARGET
roadmap, built phase by phase — Phase 17 itself stays one
verifiable slice, and the parity checklist below carries the rest
with honest statuses. Nothing on that list is presented as working
before its phase lands green.

## The framing correction (verified from the repo's public README first)

MoneyPrinterTurbo does NOT fetch YouTube links. It GENERATES a
brand-new short from a topic/keyword: AI script → voiceover →
matched stock/AI visuals → subtitles → music → composed vertical
video → cross-platform publish. That is the legal shape of this
phase: a topic-to-short generator that needs NO link at all. It
does NOT fix link-downloading, because link-downloading someone
else's video is not fixable within the law or the platform rules —
and this phase does not pretend otherwise. The link flows
(Phase 14/16 own-YouTube journey, Phase 11 CC box) are UNTOUCHED:
no refusal changed, no ownership check changed, no copy about
links changed.

## Audit first (what actually exists)

### Script / text AI — wired, live keys

- Groq chat (`openai/gpt-oss-20b` default, `GROQ_TEXT_MODEL`
  override) + Gemini text (`gemini-3.8-flash`) + OpenRouter
  free-text fallback. The chain pattern in `pickHighlights`
  (Groq → Gemini → OpenRouter, skip absent keys,
  `AI_NOT_CONNECTED` when none) is the template.
- NO script-generation route exists yet. The highlights route
  pattern (zod body, per-IP rate limit, audit event, 503 on
  `AI_NOT_CONNECTED`, 502 on provider failure) is the template
  for `POST /api/generate/script`.
- Voiceover route exists (`POST /api/clips/voiceover`,
  ElevenLabs, `ELEVENLABS_API_KEY`-gated, 503 without the key).
  ElevenLabs is NOT in this repo's env, so voiceover is honestly
  ABSENT live: the UI calls the route and, on 503, says "not
  connected yet" and continues without voiceover — the exact
  pattern the clipper tool already uses. No voiceover provider is
  claimed.
- NVIDIA text-safety (`checkTextSafety`) no-ops without its key
  (`{checked:false, flagged:false}`) and never blocks; when
  configured it flags per segment, and flagged segments are
  dropped (never silently kept).

### Renderer — one source video, reused unchanged

- `lib/browser/render.ts` `renderClip` renders ONE source video
  to a 9:16 canvas (720×1280) with burned-in captions
  (`drawWrappedText` / `drawCaptionWithHighlight`), MediaRecorder
  MP4/WebM, and a Web Audio mix (original + voiceover + music).
  It cannot compose several source videos sequentially, so Phase
  17 adds a small composer beside it (`lib/browser/render-generated.ts`)
  that reuses the same canvas/MediaRecorder pattern and the
  exported caption drawing — it does NOT fork the renderer.
- Generated sources are MUTED by design: a generated short's
  soundtrack is voiceover (when connected) + an optional
  user-licensed music upload, never a random CC clip's audio.
  The composer therefore never mixes source audio at all.
- Crop is a centred 9:16 window (`windowForCenterX`, centre 0.5).
  No face tracking per segment in this slice (slow, and stock
  footage has no single subject to track) — a documented later
  improvement, not a silent gap.

### Visuals — CC verification exists, CC search does not

- Phase 11 verification (`verifyCcUrl`) reads licence metadata
  only from Wikimedia Commons + Internet Archive, SSRF-guarded,
  fail-closed; `classifyLicense` is exported and NC/ND-checked
  first. `buildAttribution` (lib/imports/index) builds the credit
  line; `combineAttributionLines` joins lines into
  `ATTRIBUTION.txt`.
- NO search API exists anywhere. Phase 17 adds Commons search
  (`lib/imports/cc-search.ts`): the public Commons API
  (`generator=search`, `filetype:video`, namespace 6) returns
  candidate titles, and EACH candidate is passed through the
  exact same `verifyCcUrl` path (File: page URL) — search never
  bypasses verification, and an unverified licence never reaches
  a render. Cap: 8 search hits, verify up to 5, return up to 3
  verified per keyword.
- CSP needs NO change: Commons hosts are already in
  `connect-src`, so the browser loads verified Commons files
  directly. Internet Archive search (advancedsearch) is a later
  slice, not this one. Pexels/Pixabay/Coverr need keys nobody has
  supplied: env-gated slots only, honestly disabled, no UI path
  claims them, and no CSP host is opened for them.
- Fallback when no CC visual matches a keyword: the user uploads
  their own footage for that segment (browser-local object URL,
  never uploaded anywhere). A segment with no visual at all
  cannot render — the UI says so instead of inventing one.

### Post / export — reused as-is

- `PostClip` (Phase 13) takes clip id, title, hashtags, mime
  type, and a blob getter — the generate page feeds it the
  rendered blob exactly like the tool does. Share sheet /
  deep links / activity-only log, never "published".
- `buildZip` (stored ZIP, dependency-free) + `segmentsToSrt` /
  `segmentsToVtt` (lib/captions) build the export: video + SRT +
  VTT + `ATTRIBUTION.txt` (visual credits + music credit when a
  user track is picked + an "AI-generated script" note line).
- Guest caps are the tool's own: `FREE_CLIPS_PER_DAY = 3` via
  localStorage (`canRenderToday` / `recordRenderToday`), free
  watermark (`shouldWatermark("free")`). The generate page
  applies them identically; a signed-in user gets the same
  browser caps in this slice, and a best-effort
  `POST /api/projects` (session-bound, project-count gate
  enforced server-side when the billing DB resolves) records
  the short without ever blocking the render (401 = guest,
  ignored; 503 = no DB, ignored; 403 gate refusal = shown as a
  notice, render continues browser-local).

### Gating decision for /generate

- The page is visible to signed-out visitors (nav button, page
  itself — no redirect), because the existing tool allows guests
  and this flow stays inside the same caps. No new server gate
  is invented: script + visuals routes are rate-limited per IP
  and guest-accessible, mirroring the highlights and cc-verify
  routes. Server-side minute metering for browser renders is a
  later slice (the tool has the same shape today).

## Slice decision (what Phase 17 actually builds)

1. `POST /api/generate/script` — topic (1–200 chars) or custom
   script (up to 2000 chars, split into segments by sentences,
   no AI call) → `{title, hashtags, segments: [{text,
   visualKeyword}], provider}`. AI path: Groq → Gemini →
   OpenRouter chain, JSON-only, zod-validated, segments clamped
   to 1–6, text 1–280 chars, keyword 1–80 chars. Empty/invalid
   output → 502, never a fake script. Flagged segments dropped
   (NVIDIA when configured); all dropped → 502.
2. `POST /api/generate/visuals` — keyword → up to 3
   licence-verified Commons videos (title, author, licence,
   source URL, attribution line, direct file URL). Search
   failure → 502; zero verified → 200 with an empty list and
   the honest "no free-licence video found" message.
3. `POST /api/clips/voiceover` — reused, NOT rebuilt. Voiceover
   toggle enabled only when the joined script fits its 500-char
   limit; 503 → "not connected yet" notice, render continues
   without voiceover.
4. `lib/browser/render-generated.ts` — sequential composer:
   per segment, load its visual, play a 5-second window from
   the start (or to video end, whichever comes first; a video
   ending early advances the segment), draw the centred 9:16
   crop + segment caption, mix voiceover + optional
   user-licensed music soundtrack at full volume. Total short
   = 5s × segments (15–30s typical). Pure helpers
   (caption-track building, window math) are unit-tested.
5. `/generate` page (`components/GenerateTool.tsx`) — topic →
   script (editable segment text + keywords) → visuals per
   segment (pick a candidate, or upload own footage) →
   voiceover/music options → render (guest-cap + watermark
   rules) → preview + downloads (video, SRT, VTT, ZIP with
   ATTRIBUTION.txt) + `PostClip` + a rights summary (reusing
   `RightsPanel`: source = AI-generated script + visual
   licences, treatment = muted sources, attribution = the exact
   ZIP text). The standing sentence is on the page: AI
   generation does not grant rights in anyone else's material —
   these visuals are CC-licensed or user-uploaded only.
6. Entries: nav bar button "AI Video Generation" → /generate
   (layout, same classes as the Create link: 44px touch
   target, Ink + Record tokens, dark-mode safe, visible
   signed-out); a link banner on /create; a secondary link in
   the homepage final call-to-action.

## What is honestly ABSENT in Phase 17 (and why)

- Voiceover: no provider key live (ElevenLabs route exists but
  503s without `ELEVENLABS_API_KEY`). Browser speech synthesis
  is NOT used as a fake "AI voice" — it is a device voice, and
  claiming it as the voiceover provider would be dishonest.
- Stock APIs (Pexels/Pixabay/Coverr): no keys supplied.
- AI video/image generation: no provider wired, and all such
  calls are paid — needs spend approval + a key.
- 16:9 and 1:1 formats, batch generation, task history, script
  rewrite, multi-language scripts, subtitle style controls,
  Archive search, face-tracked crops: later slices (see
  roadmap). Nothing here is presented as working.

## Full parity checklist (MoneyPrinterTurbo feature set — the TARGET roadmap)

Statuses: IN PHASE 17 = built + verified this phase. LATER PHASE
= real future work, not built. NEEDS OWNER KEY = blocked on a
key the owner has not supplied. NEEDS SPEND APPROVAL = paid call
needing his yes. NOT APPLICABLE = deliberately not built, with
the reason. Nothing marked working before its phase lands green.

| Feature | Status | Notes |
|---|---|---|
| Topic → script | IN PHASE 17 | Groq/Gemini/OpenRouter chain; custom script supported |
| Custom script input | IN PHASE 17 | Split into segments locally, no AI call |
| Script rewrite | LATER PHASE | Needs a second AI pass + UI; not in this slice |
| Multi-language scripts | LATER PHASE | Prompt + language picker; translation machinery exists for captions, not scripts |
| LLM providers: Groq, Gemini | IN PHASE 17 | Keys live in this repo's env |
| LLM providers: OpenRouter | IN PHASE 17 | Free-text tier fallback in the chain |
| LLM providers: all others (OpenAI, Claude, etc.) | NEEDS OWNER KEY | Env-gated + honestly disabled without keys; never claimed |
| Materials: own uploads | IN PHASE 17 | Per-segment footage upload (browser-local) + user-licensed music upload |
| Materials: Wikimedia Commons search | IN PHASE 17 | Public API, licence-verified per candidate |
| Materials: Internet Archive search | LATER PHASE | advancedsearch + per-item verification; Commons covers this slice |
| Materials: Pexels | NEEDS OWNER KEY | Env-gated slot; no key supplied, no UI path claims it |
| Materials: Pixabay | NEEDS OWNER KEY | Same as Pexels |
| Materials: Coverr | NEEDS OWNER KEY | Same as Pexels |
| Materials: AI video generation providers | NEEDS OWNER KEY + NEEDS SPEND APPROVAL | No provider wired; all such calls are paid |
| Materials: text-to-image → motion | LATER PHASE + NEEDS SPEND APPROVAL | Image gen + motion are both paid paths |
| TTS: ElevenLabs route | IN PHASE 17 (route) / NEEDS OWNER KEY (live) | Route exists and is wired; live use needs `ELEVENLABS_API_KEY`, which is not in this repo's env, so it 503s honestly today |
| TTS: other providers (Edge TTS style, etc.) | NEEDS OWNER KEY | Env-gated + disabled without keys; browser speech synthesis is NOT presented as a TTS provider |
| Subtitles (burned-in captions) | IN PHASE 17 | Same caption system as the tool |
| Subtitle font/position/color/size/stroke/background controls | LATER PHASE | Preset system exists for the tool; per-short controls are a later slice |
| Background music: user-licensed upload | IN PHASE 17 | Via the existing music picker; credit flows into ATTRIBUTION.txt |
| Background music: bundled/royalty-free catalogue | NEEDS OWNER KEY | Site ships no tracks; catalogue needs licensed tracks + licence text from the owner |
| Format 9:16 | IN PHASE 17 | 720×1280, same as the tool |
| Formats 16:9 + 1:1 | LATER PHASE | Composer canvas size + crop are parameterised in design, not yet exposed |
| Batch generation | LATER PHASE | One short per run in this slice; queue + multi-topic runs need a job system |
| Task history | LATER PHASE | Browser-local history list; server history needs the project record wiring |
| Publish: share sheet + deep links | IN PHASE 17 | Phase 13 PostClip reused; activity-only log, never "published" |
| Publish: OAuth auto-publish | NEEDS OWNER KEY (app approvals) | Platform OAuth apps + app reviews are owner taps; never faked live |
| API entry | IN PHASE 17 (existing) | The site's existing read-only REST API v1 stands; no new API in this slice |
| WebUI entry | IN PHASE 17 | The site itself is the WebUI; /generate is the new entry |
| CLI entry | NOT APPLICABLE | A CLI is a different product from this website; deliberately not built |
| Agent entry | LATER PHASE | An agent/MCP surface for generation would extend the existing read-only MCP server; not in this slice |

## What changed (files)

- `lib/ai/script.ts` — script chain + parsing + custom-script splitting (new).
- `app/api/generate/script/route.ts` — script route (new).
- `lib/imports/cc-search.ts` — Commons video search + per-candidate verification (new).
- `app/api/generate/visuals/route.ts` — visuals route (new).
- `lib/browser/render-generated.ts` — sequential generated-short composer (new).
- `lib/browser/render.ts` — `drawWrappedText` exported for the composer (one-line change, no behaviour change).
- `components/GenerateTool.tsx` — the /generate flow (new).
- `app/generate/page.tsx` — /generate entry (new).
- `app/layout.tsx` — "AI Video Generation" nav button (new).
- `app/page.tsx` — secondary /generate link in the final call-to-action.
- `app/create/page.tsx` — /generate link banner above the tool.
- `tests/phase17-generate.test.ts`, `e2e/phase17.spec.ts` — tests (new).

## Verification (run 2026-11-04, before commit)

- `npx vitest run` — **437/437** (49 files; 20 new Phase 17 tests).
- `npx tsc --noEmit` — **0 errors**.
- `npx eslint` on all changed files — **0 errors, 0 warnings**
  (one `react-hooks/exhaustive-deps` warning found and fixed by
  memoizing the captions before commit).
- `npm run build` — **0 errors**; `/generate` listed as a static
  route, `/api/generate/script` + `/api/generate/visuals` as
  dynamic routes.
- `npx playwright test` — **49/49** (42 prior + 7 new Phase 17
  specs). The 7 cover: nav button present + links to `/generate`;
  `/generate` visible signed out with no redirect; `/create` +
  homepage links to `/generate`; mocked topic → script → visuals
  → real canvas-recorded render → video + SRT + VTT + ZIP download
  event (`generated-short.zip`) + rights panel attribution +
  post panel; guest cap refusing a 4th render; voiceover 503
  degrading to a notice while rendering continues; unmatched
  keyword showing the honest empty message and disabling render.
- Downloader-term grep on changed files — **zero** hits.
- Banned-promise grep on new UI copy — **zero** hits
  (`copyright-free`, `copyright removed`, `no copyright strikes`).
- Tree clean at commit; `git ls-remote` equals the reported HEAD;
  `stash@{0}` (old Phase 4 publish WIP) untouched.

## Finding for a later phase (not fixed here — out of scope)

While debugging the generated ZIP download, the run proved the
site's CSP `connect-src` does not list `blob:`, so `fetch()` of a
blob: URL is refused. The generator keeps its rendered bytes in
state and never fetches them back, so its ZIP + share paths are
unaffected. The older clipper tool (`components/ClipperTool.tsx`)
uses the same fetch-back pattern for its own ZIP export
(~line 744) and its post-panel blob (~line 1654) — those two
spots will hit the same CSP refusal for browser-rendered clips.
That is a pre-existing tool bug, not a Phase 17 regression, and
fixing it belongs to a tool-fix slice, not this phase: either
the tool keeps its rendered blob in state (the pattern proven
here) or `blob:` is added to `connect-src` deliberately.

## Honest gaps (not hidden)

- The live flow needs the owner's AI keys to already be live
  (Groq/Gemini are in this repo's env since Phase 7; without
  them the script route 503s honestly).
- Voiceover is absent live until `ELEVENLABS_API_KEY` is
  supplied; the toggle degrades to a notice, never a fake voice.
- A rendered generated short has never been produced from a
  real Commons video in this sandbox (no internet for Chromium
  here): the Playwright render spec uses a canvas-recorded test
  video blob, which proves the composer end-to-end but is not a
  real stock-footage render. The first real render after deploy
  (topic → script → Commons visual → short) is the live proof
  owed.
- The composer cannot prove a user-uploaded file is the footage
  the user claims it is — same standing rule as the tool: the
  user declares their own upload, and the record says so.
- Link flows are untouched: this phase adds generation BESIDE
  clipping; it does not change any refusal, ownership check, or
  link copy.

## QA checklist (for the parent's live probe, after deploy)

- [ ] Nav bar shows "AI Video Generation" → /generate, signed out.
- [ ] /generate renders signed out (no redirect to /signin).
- [ ] Topic → script returns segments + keywords (or 503 with
      the honest message when AI keys are absent).
- [ ] Visuals search returns licence-verified Commons videos
      (or the honest empty message for an unmatched keyword).
- [ ] Render produces a vertical captioned short; downloads
      (video, SRT, VTT, ZIP with ATTRIBUTION.txt) work; PostClip
      shows share + platform links.
- [ ] Guest cap: a 4th render in one day is refused honestly.
- [ ] Voiceover toggle with no key shows "not connected yet"
      and rendering continues without it.
- [ ] Sign-in flow unchanged; logged-out /admin still redirects
      to /signin with no admin UI.
