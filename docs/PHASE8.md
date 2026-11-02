# ClipForge Phase 8 — "all remaining buildable features"

Code-only phase: everything buildable without an account, a key, or a
dashboard tap. No new infrastructure, no SQL, no env changes, no
deploy by this phase (the parent deploys). Base: remote main `93b4962`
(Phase 7 + CI activation).

## What changed

### 1. Own-YouTube paste-link import (legal version ONLY)

`POST /api/imports/youtube-owned` — the only paste feature in this
phase, and it is not a downloader:

- The caller must be signed in and have exactly one connected YouTube
  account bound to their user id (accounts connected before this
  phase, or connected while signed out, have `user_id` null and are
  refused with a reconnect message — never silently accepted).
- The pasted link must parse to a video id (watch, shorts, embed,
  live, `/v/`, youtu.be; 11 characters; playlist/channel/other-host
  links are rejected).
- Ownership is verified through the YouTube Data API: the video's
  channel id must exactly equal the channel behind the stored OAuth
  token (`channels.list(mine=true)`). A mismatch is a 403, a missing
  video is a 404, a grant without channel-read permission is a
  reconnect refusal — never a silent pass, never a label-match guess.
- The route NEVER downloads video bytes: only Data API metadata
  calls happen. The file itself still arrives via direct upload,
  exactly like the CC-licensed flow, and the import receipt then
  flows through the existing rights pipeline.
- `lib/imports/youtube.ts` holds the parsing, the two API readers,
  and the token helper (decrypt, refresh when expired, persist the
  refreshed tokens).

Supporting change: YouTube connect scopes are now upload +
`youtube.readonly` (`lib/publish/platforms.ts`). Upload-only cannot
prove channel ownership — `channels.list(mine=true)` needs the
read-only scope — so the old scope list was a real blocker, not a
nit. Accounts connected before this change need a reconnect to gain
the scope; the import route says so plainly.

Supporting change: the OAuth callback now binds a new connected
account to the signed-in user when a session exists
(`app/api/accounts/[platform]/callback/route.ts`). Guest connects
still get `user_id` null, unchanged.

Stale comments fixed: `lib/imports/index.ts` and
`app/api/imports/route.ts` no longer say "no OAuth token store
exists yet" (false since Phase 3). Drive / Dropbox / Loom stay at
honest 503 — no per-provider import route exists yet.

### 2. Scheduled sweepers

`GET /api/cron/sweepers` (registered in `vercel.json` as a daily
03:00 UTC cron) runs both sweeps with the same rules as the manual
runs — never auto-charge, never auto-block:

- Webhook retry (`lib/integrations/sweepers.ts`): replays due
  deliveries through the same replay path the manual admin replay
  uses (same signing, same backoff, same row updates). A delivery is
  due when it is not delivered, has attempts left (max 5), and its
  `next_attempt_at` is unset or past. Delivered rows are never
  retried. Batch 20, oldest first.
- Dunning retry (`lib/billing/sweepers.ts`, shared with the manual
  admin route, which was refactored onto it with the same response
  shape): retries bump the attempt count and the in-app notice, and
  cancel only after the grace period. The cron run audits each
  dunning step as actor "cron".

Auth: `CRON_SECRET` bearer only. When `CRON_SECRET` is unset the
route 503s — never open. No IP rate limit on this route; the secret
is the gate. (Vercel Cron sends the secret automatically when set;
until the owner sets it, the sweepers simply do not run — the manual
admin runs still work.)

### 3. Plan hard-gating for render/publish

`lib/billing/gates.ts` — separate checks, not one conflated check:

- Minutes for render (`POST /api/render/jobs`) and publish
  (`POST /api/publish/posts`): clip duration → whole minutes
  (rounded up, minimum 1).
- Project count ONLY for project creation (`POST /api/projects`).
  A user at their project limit can still render and publish
  existing projects.
- Target count for publish (1/3/10 by tier).

Limits come from `BILLING_PLANS_JSON` (placeholder limits
unchanged — no prices invented). Gating applies only when a session
and the billing database both resolve; guests keep the browser caps
(3 free renders/day, 500 MB, 10 min) and pass through unmetered.
Refusals are 403 with a plain message naming the limit and usage —
no upsell copy.

Boundary correction (found while writing the gates):
`withinLimit` in `lib/billing/plans.ts` used strict `<`, so a
30-minute plan refused the 30th minute and a 3-target plan refused
the 3rd target. The metering route already refuses on
`used + minutes > cap` (inclusive), so the helper now uses `<=` to
match: plan numbers are inclusive. The Phase 6 helper test was
updated to the inclusive rule with the metering precedent cited.
`withinLimit` has no other callers, so nothing else moved.

Follow-up noted honestly: the publish post row still carries the
caller-supplied `userId` (legacy). The gate itself uses the session
user, so for a signed-in caller the two agree; binding post
ownership to the session is a separate slice, not smuggled in here.

### 4. Billing session binding

Every billing route that took a caller-asserted `userId` now uses
the authenticated session user (`lib/auth/session-user.ts` —
`getSessionUserId` via the Supabase server client, never throws):

- GET subscriptions, POST cancel, GET invoices, GET invoice by id,
  GET limits, GET notifications, POST coupons/redeem, POST
  referrals/code, POST referrals/attribute — all 401 without a
  session; the body/query `userId` is ignored.
- POST checkout keeps its documented guest path: session user when
  signed in, otherwise the constant `"anonymous"` — never a
  caller-chosen id. The webhook later binds the paid subscription
  by email (unchanged).

The Phase 6 route tests were updated to mock the session user
(`"user-1"`, restored in `beforeEach` because the file's `afterEach`
runs `vi.resetAllMocks()`), plus a new signed-out → 401 case.

### 5. PDF invoices

`GET /api/billing/invoices/[id]/pdf` — session-bound like the JSON
record (the caller must own the invoice), returns a real PDF as a
download (`application/pdf`, filename `<number>.pdf`). The
printable HTML record stays as fallback.

`lib/billing/pdf.ts` hand-rolls the PDF (catalog, pages, Helvetica
regular + bold, computed xref) with no new dependency — the deploy
uploads exclude `package-lock.json`, so a new dependency risks
install drift. Integer minor units are unchanged; zero-decimal
currencies (JPY, KRW, …) render without a decimal part.

Real bug fixed while testing this: the header line contains an
em-dash, and UTF-8 multi-byte characters silently shift every later
xref byte offset (and render garbled in Helvetica). The content
stream now sanitizes to ASCII first (em-dash → `-`, anything else
→ `?`), so string length always equals byte length. A test pins
this with a non-ASCII line item and a byte-level xref check.

### 6. Server project API + audit wiring

- `POST /api/projects` (GET own list + POST create): 401 without a
  session, 503 without a database, project-count gate on creation,
  and a `project.created` audit event. Guest project creation does
  not exist here — guests use the browser flow; the server API is
  for signed-in users.
- `auth.signup` wiring: the auth callback now checks the caller's
  `clipper_users` row (readable under the "own user row" RLS policy)
  after a successful sign-in; a positive "no rows" result
  (`PGRST116`) emits `auth.signup`. Any other read failure skips
  quietly, so a denied read never fakes a signup. Email sign-ins
  have no server hook — same pre-existing gap as `auth.login` for
  email — documented, not papered over.
- `clip.rendered` wiring: `POST /api/render/callback` verifies the
  worker's HMAC-SHA256 signature (`verifyWorkerRequest`, added to
  `lib/server-render/contract.ts`, mirroring `signWorkerRequest`)
  and audits `clip.rendered` with actor "worker" on `"done"` only.
  Failed reports are acknowledged without audit — no render-failed
  audit action exists, and none was invented. Note: `worker/`
  does not call back yet, so this endpoint waits on the worker-side
  call (a gap, stated plainly).
- Guest flows still log actor `"guest"` where they already did
  (render job creation, scheduled posts).

### 7. AI fallback hardening (verified, no code change needed)

The AI routes already implement Groq → Gemini → OpenRouter
correctly, and this phase verified it rather than rebuilding it:

- `lib/ai/highlights.ts`, `lib/ai/metadata.ts`, `lib/ai/translate.ts`
  all build the attempt list in that order, skip a provider when its
  key is absent, fall through to the next on error, and throw
  `AI_NOT_CONNECTED` only when no provider is configured.
- With Groq + Gemini now in Vercel, the chain has two live
  fallbacks. OpenRouter / NVIDIA / ElevenLabs stay env-gated and
  503 honestly when absent. Transcribe stays Groq-only (Whisper has
  no Gemini equivalent server-side); voiceover stays ElevenLabs-only;
  NVIDIA stays a text-safety check only.
- NOT added, per the brief: fal.ai (paid, no spend approval) and
  Hugging Face (token still 401-bad). `lib/ai/providers.ts` already
  states both as not wired.

## Verification

- vitest: **320/320 across 40 files** (new `tests/phase8-features.test.ts`:
  gates, PDF bytes/structure + ASCII sanitization, YouTube parse +
  ownership verdicts with mocked fetch, sweeper due-selection,
  worker signature round-trip, session-helper contract).
- tsc: **0 errors**. eslint: **0 on changed files**.
- next build: **0** (exit 0).
- Downloader-term grep on changed files: **zero** — the only hit is
  a comment in the import route stating it is NOT a downloader.
- Playwright NOT re-run (no UI touched) — the Phase 7 e2e suite
  still stands.
- CI: active on main (`.github/workflows/ci.yml` since `93b4962`);
  whether a CI run was observable for this push is checked after
  push — do not claim a green CI run until one is observed.
- Git: tree clean after commit; HEAD verified against `ls-remote`
  before reporting (see parent report).
- Stash `@{0}` (old Phase 4 publish WIP): untouched.
- SQL 001–006: NOT re-applied (already applied).

## Honest gaps (not hidden)

- The cron sweepers need `CRON_SECRET` set in Vercel before they
  run; until then only the manual admin runs work.
- The worker (`worker/`) does not call `/api/render/callback` yet,
  so `clip.rendered` fires only once that call lands.
- Email sign-ins emit no `auth.login`/`auth.signup` audit (no
  server hook) — OAuth sign-ins do.
- Publish post rows still carry the caller-supplied `userId`;
  session-binding post ownership is a follow-up slice.
- The own-YouTube import verifies ownership but does not download
  or transcode the video — the file still arrives via direct
  upload. Drive / Dropbox / Loom imports stay at honest 503.
- No live test yet: this phase was not deployed by the builder.
  Live probes owed after the parent deploys (new routes:
  `/api/projects` → 401 logged-out, `/api/imports/youtube-owned` →
  401 logged-out, `/api/billing/invoices/[id]/pdf` → 401
  logged-out, `/api/cron/sweepers` → 401/503 without the secret).
- Account-gated items remain untouched by design: R2, Paddle,
  OAuth apps, SSO IdP, diarization, AUDD/ACRCloud, Brevo, Docker
  worker host, KMS, public sign-up, paste-any-link.

## QA checklist (for the parent's live probe, after deploy)

- [ ] Signed out: `GET /api/projects` → 401; `POST /api/imports/youtube-owned` → 401; `GET /api/billing/invoices/<id>/pdf` → 401.
- [ ] Signed in, no YouTube connected: paste any YouTube link → 400 honest "not connected" refusal (not a download, not a pass).
- [ ] Signed in, YouTube connected (new scope): paste own video link → 200 receipt; paste someone else's video link → 403.
- [ ] Signed in, YouTube connected before this phase: paste own link → reconnect message (old scope), then reconnect + retry → 200.
- [ ] Free user at 30/30 minutes: render job → 403 naming the limit; user at 29/30 rendering a 1-minute clip → allowed.
- [ ] Free user creating a 4th project → 403; same user rendering an existing project → allowed.
- [ ] Publish with 2 targets on Free → 403; with 1 → passes the gate.
- [ ] Invoice PDF downloads, opens in a reader, shows number + total; non-ASCII descriptions render without garbling.
- [ ] `GET /api/cron/sweepers` without the secret → 401/503, never a sweep.
- [ ] AI clip flow with Groq + Gemini live: highlights return (Groq first, Gemini on Groq failure); with both keys removed → honest 503, never a fake result.
