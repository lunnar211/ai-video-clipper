# Phase 22 — Fix-and-polish sweep (diagnosis issues 1–7 + Commons search)

Overnight fix sweep, 2026-11-08. All fixes live-verified against the
diagnosis from the same night; nothing else changed.

## Issue 1 — CC file names carried a `?utm_source=…` query string

- `lib/imports/cc-verify.ts`: the Commons filename is now derived
  from `new URL(info.url).pathname` only (fallback strips `?`/`#`),
  and `fileExtension()` strips the query before reading the
  extension (a `.webm?utm_source=…` URL used to fail the video
  check when `mime` was absent).
- `components/CcPasteImport.tsx`: `displayName()` strips `?`/`#`
  as defence in depth.
- Test: `tests/phase11-cc-verify.test.ts` pins a Commons
  `imageinfo.url` with the utm query → file name
  `Example_video.mp4`.

## Issue 2 — Home said MCP "Reads are open" (they need an API key)

- `lib/marketing.ts`: "Reads need an API key (created in the admin
  console); writes stay off unless the owner enables them."

## Issue 3 — /publish first paint claimed the DB was missing

- `app/publish/page.tsx`: renders "Loading queue…" while
  `queue === null && !queueError`; the "needs database setup"
  message is shown only when the fetch actually returns 503
  (other failures get their own message; 429 keeps its own).

## Issue 4 — /create YouTube journey invited a verify that cannot succeed

- `components/YoutubeJourneySteps.tsx`: up-front amber notice —
  connecting a YouTube channel isn't available yet (owner hasn't
  set up the YouTube app); verification needs a signed-in account
  with a connected channel; direct upload still works in step 3.
- `components/YoutubeOwnedImport.tsx`: same notice was added then
  removed again as a duplicate — the journey box carries it.
  The Verify button is disabled for logged-out visitors
  ("Sign in to verify", with a sign-in hint below) via a Supabase
  session check, and the hero-handoff auto-verify only fires for
  a signed-in visitor, so nobody hits the 401 blind anymore.

## Issue 5 — /robots.txt 404; sitemap omitted /generate

- New `app/robots.ts` (allow all + sitemap reference).
- `app/sitemap.ts`: `"/generate"` added to the pages list.

## Issue 6 — Stale README; missing AGENTS.md

- `README.md`: the "No auth, no database, no payments in MVP"
  paragraph now states the current Supabase Auth / Postgres /
  billing / admin reality; follow-ups updated (sign-in and paid
  plans no longer listed as missing — prices stay unset).
- New root `AGENTS.md`: points at `docs/PHASE*.md` and states the
  compliance boundary, honesty rules, security rules, and the
  build/test/deploy commands.

## Issue 7 — Free "3 renders/day" stated as if server-enforced

- Chose the smaller change: `app/pricing/page.tsx` now says
  "3 rendered clips per day, per browser — the count is kept in
  your browser, so clearing browser data resets it". No
  half-built server enforcement. `lib/usage/quota.ts` already
  documented the localStorage fair-use nature.

## Observation — Commons multi-word search returned zero (verified)

- Live-verified before changing anything: `POST
  /api/generate/visuals {"keyword":"ocean waves"}` → 200, zero
  candidates; the same words quoted → a verified CC-BY-SA video.
- `lib/imports/cc-search.ts`: multi-word keywords are now sent
  as a quoted phrase in `gsrsearch` (`commonsSearchTerm()`; a
  keyword that already contains a quote is left alone).
- Test: `tests/phase17-generate.test.ts` pins the query string
  for single- and multi-word keywords.

## Observation — Pricing/FAQ sign-in copy was stale

- `app/pricing/page.tsx`: sign-in is available on the sign-in
  page (Google, or email and password); accounts are created by
  the owner. No claim that Google OAuth works end-to-end (that
  cannot be verified without owner credentials).
- `app/faq/page.tsx` and `lib/marketing.ts` home FAQ: sign-in and
  publishing are configured on this server; paid tiers are not
  configured yet.

## UI/UX polish (phone-first, Playwright against the local build)

- All 6 checked pages (`/`, `/create`, `/generate`, `/pricing`,
  `/publish`, `/faq`): no horizontal overflow at 390×844 or
  1280×800. No clipped or overlapping elements found.
- Fixed while looking: the YouTube notice appeared twice in a row
  (journey box + import box) — the import box's copy was removed;
  the CC paste section stuttered ("Paste a video link" heading +
  identical label) — the label is now "Video link".
- `/publish` on the local build shows the DB-setup message only
  after the queue fetch actually 503s (no DB in the sandbox) —
  correct behaviour, not a defect.
- "Sign-in is not configured yet" in the local header is also a
  sandbox artefact (no Supabase env vars locally); live it is
  configured.
- Still owed (not verifiable from here): a real-phone share
  check; a real video upload → transcribe → highlights → render
  run (needs a real file and consumes Groq Whisper — not run).

## QA

- `npm test`: 499 passed (53 files). `npm run build`: exit 0.
- `npm run lint`: exit 0; the single remaining warning
  (`'z' is defined but never used` in
  `app/api/render/callback/route.ts`) is pre-existing on the
  pristine tree (verified via `git stash`).

## Honest gaps (unchanged)

- YouTube OAuth app, `AI_COMBO_WEBHOOK_SECRET`,
  `ELEVENLABS_API_KEY`, R2/Paddle/OAuth vars: owner's taps.
- Groq script generation still live; admin gating unchanged.
