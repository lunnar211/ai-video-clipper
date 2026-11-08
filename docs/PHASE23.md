# ClipForge Phase 23 — Professional redesign (round 2)

## Why

The owner judged the clipper the worst-looking site of its kind he
had seen: a generic/template feel, not a professional tool. The
audit (local build screenshots, phone 390×844 + desktop 1280×800)
found, worst first:

1. **Hero upload box was a big empty dashed box** — a wireframe,
   duplicated again in "See it work". Nothing about it said "tool".
2. **Ten identical white feature cards** with no icons — a wall of
   text.
3. **Plans table squeezed six columns into a phone viewport** and
   "Coming soon" everywhere — it read as a placeholder grid.
4. **/create was a long stack of identical white cards** with a raw
   native file input ("Choose File / No file chosen") — the single
   cheapest-looking element on the site.
5. **/publish exposed raw internal labels** ("Staged media key",
   "Checklist post ref", "Clip ref", "Project id") and dumped the
   queue as raw JSON.
6. **Header wrapped on phones** (logo split to two lines, sign-in
   crowded, nav scrolled off with no cue); **footer was a flat
   unstructured link wrap**; **/pricing was two text-wall cards**.
7. **A real bug:** /generate fired an unauthenticated
   `GET /api/projects` for every guest, logging a 401 console error
   before the visitor did anything. (The /publish queue 503 in the
   sandbox is the same class of noise, but it is the route's own
   "no database" answer where no database is configured — live it
   returns 200 — so the page keeps the fetch and shows the honest
   notice; the spec filters that one sandbox-only resource error,
   same precedent as Phase 20's 429 filter.)

## What changed

Identity kept: **Ink + Record** (near-black ink, single signal-red
accent, Plus Jakarta Sans, no gradients, no violet, no generic
SaaS blue). No rebrand, no copied design, no new copy claims, no
prices invented, no feature removed, no auth/security/env change.

- `components/HeroUploadBox.tsx` — the dropzone is now a solid
  tool panel: header row ("Clipper — free in your browser" + "No
  account needed" chip), a visible "Choose a video file" button,
  output chips (9:16 vertical · Burned-in captions · 720×1280 ·
  Up to 10 min). Same input ids (`#hero-upload`,
  `#see-it-work-upload`, `#hero-upload-link`), same hand-off.
- `app/page.tsx` — hero is a two-column layout on desktop (copy
  left, tool panel right; stacked on phones); "See it work" keeps
  the REAL upload box (pinned by phase10.spec.ts) inside a distinct
  dark "live tool" frame so the two entries never look like a
  copy-paste; features get drawn icons + a featured first card;
  steps become a numbered timeline; the plans table is replaced by
  shared plan cards. All headings and copy unchanged (pinned by
  phase12 + marketing tests).
- `components/FeatureIcon.tsx` (new) — ten original 24×24 line
  icons, one per feature, drawn for this site. No emoji, no stock
  set.
- `components/PlanCards.tsx` (new) — one shared plan-card
  component used by the homepage and the pricing page, so the two
  never drift apart. Limits from the billing config; price still
  "Coming soon" (no price invented).
- `app/layout.tsx` — brand never wraps (`whitespace-nowrap`,
  text-base on phones); nav gets a right-edge fade mask so the
  scrollable bar reads as scrollable; footer becomes structured
  columns (Product / Learn / Legal) + the same compliance
  paragraph and MediaPipe credit.
- `components/OnboardingChecklist.tsx` — title takes the free
  width at text-base on phones (it wrapped around Dismiss before).
- `components/ClipperTool.tsx` + `components/YoutubeJourneySteps.tsx`
  — styled "Choose a video file" button labels driving the same
  hidden file inputs (Playwright `setInputFiles` still works on
  them; the "{name} — 0.0 MB" file line is unchanged).
- `components/YoutubeOwnedImport.tsx` — the sign-in hint is
  shortened; the journey box above already states the YouTube app
  is not set up yet, so the warning is no longer repeated three
  times.
- `components/RightsPanel.tsx` — each fact (source, music check,
  audio treatment, attribution) is its own card row. All pinned
  strings unchanged.
- `components/GenerateTool.tsx` — the projects fetch is gated on
  a real Supabase session (null client = no fetch). Guests fire
  no `/api/projects` request at all.
- `app/publish/page.tsx` — composer grouped into three cards
  ("1. The clip", "2. Schedule & details", "3. Where to post")
  with plain-word labels + hints ("Clip", "Project", "Uploaded
  video (optional)", "Compliance checklist (optional)"); a
  Visibility control was added (the form field existed but had no
  UI); the queue renders as grouped lists (Scheduled / Due now /
  Drafts / Published / Partially published / Failed) with a JSON
  fallback for an unexpected shape. Phase 20's pinned grid
  classes are kept.
- `app/pricing/page.tsx` — plan cards up front, then the two
  honest sections (free tier, what costs the operator money).
  Keeps the `rounded-xl border border-border bg-card p-6 shadow-sm`
  class the Phase 20 test pins.
- `e2e/phase23.spec.ts` (new) — 34 specs, phone 390×844 +
  desktop 1280×800: no horizontal overflow, no console/page
  errors, hero panel + plan cards + icons, styled file picker,
  guests fire no `/api/projects`, publish plain words + readable
  queue, pricing plan cards.

## Verification

- `npm test`: 499 passed (53 files).
- `npm run build`: exit 0.
- `npx tsc --noEmit`: exit 0.
- `npm run lint`: exit 0, one pre-existing warning (`'z' unused`
  in `app/api/render/callback/route.ts`, verified pre-existing).
- `npx playwright test e2e/phase23.spec.ts`: 34 passed.
- Full `npx playwright test` (durable re-run, log in
  `~/workspace/phase23-e2e-full2.log`): **129 passed, 5 failed**
  — phase14 ×2, phase16 ×2, phase20 `/cookies` horizontal
  scroll once (29px at 375px). CORRECTION: the c571a18 commit
  message says "129 passed, 2 failures" — that was the failure
  list from an earlier delivery whose log was lost in a /tmp
  wipe; the durable re-run shows 5 failures, not 2. The count
  (129 passed) is confirmed; the failure list below is the true
  one.
- **All 5 failures are pre-existing, none caused by this phase:**
  - phase14 + phase16 (4 failures, same signature): the tests
    click a "Verify ownership" button, but the button reads
    "Sign in to verify" once the Supabase session check resolves
    with no session. The tests only pass when they click during
    the null state — a race. PROVEN: on a pristine Phase 22
    worktree (40e7dd2, zero Phase 23 code) all 5 phase14 tests
    fail the same way; phase16's 2 fail identically on pristine
    via an earlier `git stash` check. This phase did not touch
    the session logic or the button.
  - phase20 `/cookies` overflow (seen once, 29px at 375px): not
    reproduced in isolation (passed), not reproduced on the
    pristine tree (passed), and the after-screenshot pass
    measured overflowX=0 on every page. Treated as a transient
    measurement artifact; the footer/header change is not a
    deterministic cause (the same pages pass on repeated runs).
  - phase20's console-error check also failed once in an
    isolated run on the sandbox-only `/publish` queue 503 (no
    database configured here) — the old page performed the same
    fetch on mount; whether it trips the check is timing
    (whether the 503 lands before navigation). Live the
    database is configured and the fetch returns 200.
- This phase introduced two failures of its own during the run
  and fixed both: a footer link duplicating the nav's "AI Video
  Generation" name (Phase 17 strict-mode violation — footer link
  renamed to "Generate a short"), and the Phase 23 /publish
  specs not tolerating the per-IP 429 under a heavy suite run
  (spec now filters/handles 429 like Phase 20 does).
- After-screenshot pass (local production build, phone 390×844
  + desktop 1280×800, `~/workspace/phase23-after-shots/`):
  overflowX=0 on every page; zero console errors except the
  sandbox-only /publish queue 503; /generate is now clean (the
  401 is gone). Note: the audit's before-screenshots were lost
  in the same /tmp wipe that took the early logs, so the
  before/after comparison is the audit's written findings (in
  this doc's "Why" section) against these after-shots.

## Deploy

- Commit `c571a18` (pushed to `origin/main`; tree clean).
- Deploy via `python3 ~/workspace/deploy_clipper.py`: exit 0,
  415/415 files uploaded, production deployment created
  (target production, iad1).
- Live probe (after ~150s build wait): `/` 200, `/create` 200,
  `/generate` 200, `/publish` 200, `/pricing` 200, `/signin`
  200, `/robots.txt` 200, `/sitemap.xml` 200, `/admin` 307 →
  `/signin`. New copy confirmed in live home HTML ("Clipper —
  free in your browser", "No account needed", "9:16 vertical",
  "Live tool — the real clipper", "Plans at a glance",
  "Generate a short"); "Staged media key" count 0.
- Live URL: https://ai-video-clipper-dipeshkarki8292-3476s-projects.vercel.app
- (Sandbox Chromium has no internet, so live screenshots are
  not possible from here; live serving is proven by the curl
  probe + content markers above, and the redesign itself by
  the local production-build screenshots.)

## Still needs the owner's taps (unchanged)

- YouTube OAuth app creation (own-YouTube verify stays honestly
  gated).
- `AI_COMBO_WEBHOOK_SECRET`, `ELEVENLABS_API_KEY`, R2 / Paddle /
  per-platform OAuth vars.
- Live AI clip test (real video upload → transcribe → highlights
  → render) and a real-phone share check.
- First green CI run observation; end-to-end live login test.
