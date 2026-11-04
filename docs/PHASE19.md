# ClipForge Phase 19 — Parity slice 2: rewrite, languages, subtitle styles, formats, history

Owner order (2026-11-04): finish the MoneyPrinterTurbo features
"anyhow", using the AI API already connected — no new keys, no new
spend. This slice covers the next five roadmap items that need
neither: script rewrite, multi-language scripts, subtitle style
controls, 16:9 + 1:1 formats, and generation history. (The
professional redesign + full-site bug check is Phase 20, a
separate slice after this one.)

## What each feature does

### 1. Script rewrite — `POST /api/generate/rewrite`

The existing script (generated or pasted, as edited) goes back
through the exact same Groq → Gemini → OpenRouter chain
(`rewriteScript` in `lib/ai/script.ts`): fresh wording, same
segment count, same order, same meaning, fresh visual keywords.
Same failure contract as the script route — no provider → 503
"AI is not connected yet", unusable output → 502, never a fake
script. Safety filtering still drops flagged segments, so a
rewrite can come back with fewer segments than the original; the
UI shows both versions, so the difference is visible, never
hidden. The UI keeps original + rewrite side by side ("Script
versions") and the user picks which one renders; a fresh rewrite
becomes active immediately, the original stays one click away.
Switching versions resets visuals, because the keywords changed
— the UI says so.

### 2. Multi-language scripts

The script route and the rewrite route both accept `language`, a
code from the existing curated `TRANSLATION_LANGUAGES` list
(28 languages, same list the caption-translation UI offers).
Unknown codes are rejected by the route (400) and fall back to
English inside the library — the chain is never asked for a
language the site has not wired, and copy says quality varies by
language and is not guaranteed. Rendered captions follow the
chosen script automatically, because captions are the segment
text. Custom scripts are used as written: when a custom script
is pasted and a non-English language is picked, the UI says
language applies to AI-written scripts only.

### 3. Subtitle style controls (`lib/browser/subtitles.ts`)

Font (Sans / Serif / Mono / Casual), position (top / middle /
bottom), color (6 swatches), size (28–72px slider), stroke
(outlined letters), background (dark box / light box / no box).
All real: the composer draws burned-in captions from the
resolved style (`drawStyledCaption`), with the Phase 17 look
(white sans, bottom, dark box, 46px, no stroke) as the default —
existing shorts render exactly as before when nothing is
changed. Font size scales with canvas width so captions keep
their relative size across formats. The stroke color contrasts
automatically (dark stroke on light text, light stroke on dark
text). A preview box shows the chosen style approximately, and
the rendered section states the exact style used
("Captions: Serif, top, Yellow, 54px, Dark box.").

### 4. Formats 16:9 + 1:1 — real output sizes

`FORMAT_DIMENSIONS`: 9:16 → 720×1280, 16:9 → 1280×720,
1:1 → 720×720. The composer sizes its canvas from the format
and crops each visual to the matching aspect with the new
`windowForAspect` helper (`lib/crop.ts`; for 9:16 it is exactly
the old centred window, so the default format is byte-for-byte
the Phase 17 behaviour). This is not a CSS letterbox: the
rendered section states the real size, and the specs assert the
preview video's own dimensions (1280×720, 720×720).

### 5. Generation history (`lib/browser/generation-history.ts`)

Every successful render is recorded in the browser
(localStorage key `clipper-generate-history`, newest first,
capped at 20, malformed entries dropped on load). An entry
holds topic, title, hashtags, language, format, subtitle style,
segments, and sources/licences. "Reopen" restores the script,
format, language, and style, and restores licence-verified
visuals (their file URLs persist). A user's own uploaded
footage does NOT survive — a blob URL dies with the page — so
reopened upload segments come back marked "upload again", never
with a broken link. The section is honestly labelled "Saved on
this device only". Signed-in users additionally see their
server project records (titles + dates from the existing
GET /api/projects) under a plain label: titles only, not
reopenable, because segment details are not stored
server-side. Full server-side generation history would need a
new table + migration — that is a later slice, documented here
as the gap, not pretended into existence. No migration file was
needed for this slice, and none was written.

## What changed (files)

- `lib/ai/script.ts` — `generateScript` gains a language
  parameter; new `rewriteScript` on the same chain;
  `scriptSchema` exported for the rewrite route;
  `resolveScriptLanguage` (curated list, English fallback).
  The chain still stops at the first provider that returns
  usable, safety-passing output — no extra provider spend.
- `app/api/generate/script/route.ts` — accepts + validates
  `language`; returns the effective language on AI paths.
- `app/api/generate/rewrite/route.ts` — new route (rate limit,
  audit `generate-rewrite`, 503/502 contract identical to the
  script route).
- `lib/crop.ts` — new `windowForAspect` (centred window for
  any aspect; `windowForCenterX` untouched for the tool).
- `lib/browser/subtitles.ts` — new: formats, style type +
  defaults + option lists, `resolveSubtitleStyle` (clamps +
  fallbacks), `strokeColorFor`, `drawStyledCaption`.
- `lib/browser/render-generated.ts` — accepts `format` +
  `subtitleStyle`; canvas + crop + captions follow them;
  result reports real `width`/`height`/`format`. The old
  `captionPreset` option is gone (it was only used here).
- `lib/browser/generation-history.ts` — new: entry types,
  defensive load, capped record.
- `components/GenerateTool.tsx` — language picker, script
  versions block, format picker, subtitle controls + preview,
  rendered format/caption lines, history section + server
  project list, reopen flow.
- `tests/phase19-generate.test.ts`, `e2e/phase19.spec.ts` —
  tests (new).

## Verification (run 2026-11-04, before commit)

- `npx vitest run` — **468/468** (51 files; 441 pre-existing +
  27 new Phase 19 tests: chain + language prompts, style
  resolution, styled-caption drawing via a recording-stub
  canvas context, aspect windows, history storage rules,
  UI + route source pins).
- `npx tsc --noEmit` — **0 errors**.
- `npx eslint` on all changed files — **0 errors, 0 warnings**
  (three real finds fixed during the run: a `useVersion`
  callback name that ESLint read as a Hook — renamed to
  `switchVersion`; a synchronous setState in an effect — now
  the repo's `queueMicrotask` pattern from OnboardingChecklist;
  an unused import).
- `npm run build` — **0 errors**; `/api/generate/rewrite`
  listed as a dynamic route.
- `npx playwright test` — **56/56** (50 prior + 6 new Phase 19
  specs: rewrite keeps both versions and the pick switches
  segments; rewrite 503 degrades honestly; language picker sends
  the chosen language; subtitle controls + 16:9 change the
  rendered short with real 1280×720 preview dimensions; 1:1
  renders a real 720×720 short; history lists a render and
  reopens it with its visual restored). One first-run failure
  was spec-flow imprecision, not the product: after a rewrite
  the rewrite is already active, so "Use rewritten version" is
  disabled — the spec now asserts the active state first, then
  switches both ways.
- Downloader-term grep on changed files — **zero in product
  files** (the only literal hits are the test file's own
  `not.toContain` assertion strings, the same pattern Phase 18
  uses for its pins).
- Banned-promise grep on new UI copy — **zero**
  (`copyright-free`, `copyright removed`, `no copyright
  strikes`).
- No CSP change, no env change, no SQL, no deploy by the
  builder. Tree clean at commit; `git ls-remote` equals the
  reported HEAD; `stash@{0}` (old Phase 4 publish WIP)
  untouched.

## Nothing else changed

Upload tool, CC paste, own-YouTube journey, clean audio, rights
panel, post panel, plan gates, billing binding, admin gate,
sweepers, Ink + Record identity — all untouched. `/signin`
keeps working; logged-out `/admin` keeps redirecting to
`/signin`. The 9:16 default render path is unchanged in
behaviour (same canvas size, same crop, same default caption
look).

## Honest gaps (not hidden)

- Voiceover is still key-gated (`ELEVENLABS_API_KEY` not in
  this repo's env): the toggle degrades to a notice, never a
  fake voice — unchanged from Phase 17.
- A rendered short in 16:9/1:1 has been proven from a
  canvas-recorded test visual, not from a real Commons video
  (no internet for Chromium in this sandbox). The first real
  render after deploy (topic → script → Commons visual →
  16:9 short) is the live proof owed.
- Real-phone share check is still owed (Phase 18 gap, carried
  over — desktop specs stub `navigator.share`).
- Server-side generation history needs a future migration; the
  history section says plainly what is device-only today.
- Rendered clip object URLs are still never revoked
  (pre-existing, out of scope).

## QA checklist (for the parent's live probe, after deploy)

- [ ] /generate renders signed out; language picker lists the
      curated languages.
- [ ] Topic → script in a non-English language returns segments
      in that language (or 503 with the honest message when AI
      keys are absent).
- [ ] Rewrite shows both versions; picking each one switches
      the editable segments; visuals reset on switch.
- [ ] Subtitle controls change the burned-in captions; the
      rendered section states the style used.
- [ ] 16:9 renders wide, 1:1 renders square (check the video
      shape, not just the label).
- [ ] History lists the render; Reopen restores script, format,
      language, style, and CC visuals; upload segments ask to
      upload again.
- [ ] Older flows unchanged: /create, CC paste, YouTube journey,
      /signin, logged-out /admin redirect.
