# ClipForge Phase 3 — Social account linking + publishing

Phase 3 adds the publisher: connect your own social accounts via
OAuth, compose a post per platform, schedule it, publish it to every
linked account with per-platform status, and sync post-publish
analytics. It consumes the Phase 2 hooks on every publish attempt:

- the per-post compliance checklist must be complete, otherwise the
  publish is refused;
- `isPublishingPaused()` blocks publishing for paused accounts;
- the fingerprint pre-publish check is re-evaluated from the stored
  draft, and a blocking verdict refuses the publish.

Nothing here downloads anything from any platform. Publishing uploads
the user's own rendered clip outward through each platform's official
API only. No fake posts, view counts, or connected accounts anywhere:
without credentials, approval, or a database, every surface answers
honestly (503 / "not enabled" / "no connected accounts").

## Files changed

### Publish core library (`lib/publish/`)

- `lib/publish/platforms.ts` — Platform registry: the six platforms,
  their per-platform feature-flag and approval env names, the minimal
  OAuth scopes each upload flow needs, and their documented limits.
- `lib/publish/tokens.ts` — Envelope-encryption interface plus the
  env-key AES-256-GCM adapter (key id + rotation field on the record).
  Tokens are encrypted before storage and decrypted only server-side.
- `lib/publish/oauth.ts` — Per-platform OAuth config resolution from
  env, authorization-URL builders (YouTube offline + consent, TikTok
  client_key, X PKCE S256), code exchange, refresh, and revoke.
- `lib/publish/validator.ts` — Platform limits validator: duration,
  size, aspect ratio, title length, caption length, tag count. A
  violation refuses the publish with a specific message; an upload
  known to be rejected is never attempted.
- `lib/publish/publisher.ts` — Publish engine: idempotency keys
  (sha256 of post:platform:account), exponential backoff (1s base,
  ×2, capped at 60s, plus jitter), Retry-After honoring, 429/5xx as
  the only retryable failures, max 4 attempts, per-target statuses.
- `lib/publish/gates.ts` — Pure gate composition in fixed order:
  platform flag → limits → checklist → pause → pre-publish verdict.
- `lib/publish/schedule.ts` — Schedule validation: parseable time,
  real IANA timezone, future-only; `isDue` for the queue.
- `lib/publish/adapters/youtube.ts` — The one live upload adapter:
  YouTube Data API v3 videos.insert, multipart upload, Shorts URL back.
- `lib/publish/adapters/stubs.ts` — TikTok, Instagram, Facebook, X,
  and LinkedIn adapters that honestly refuse (`PLATFORM_NOT_IMPLEMENTED`)
  until their real adapters and approvals land.
- `lib/publish/store.ts` — PostgREST helpers for accounts, posts,
  targets, analytics, and notifications. `toPublicAccount` strips
  tokens; nothing token-shaped ever leaves the server.
- `lib/publish/analytics.ts` — Analytics sync: YouTube videos.list
  statistics; every other platform honestly reports unsupported.
- `lib/publish/notify.ts` — In-app failure notifications; the email
  adapter is deliberately inert (no working mail provider is wired —
  the owner's Brevo key is known-bad and is NOT presented as working).
- `lib/publish/tempmedia.ts` — Temp-media lifecycle: `tmp/publish/`
  prefix, 24h TTL, best-effort immediate delete after a full publish.

### API routes (`app/api/`, all Zod-validated, 5/min per-IP limited)

- `app/api/accounts/route.ts` — Lists connected accounts (status-only)
  and per-platform flag/approval status.
- `app/api/accounts/[platform]/connect/route.ts` — Returns the provider
  auth URL; sets short-lived httpOnly state (+ PKCE verifier for X)
  cookies. 503 without OAuth config, no auth URL when disabled.
- `app/api/accounts/[platform]/callback/route.ts` — Verifies state,
  exchanges the code, encrypts tokens immediately, stores only the
  encrypted record, redirects to `/accounts?connected=…` or `?error=…`.
- `app/api/accounts/[id]/disconnect/route.ts` — Revokes at the provider
  (best-effort), then deletes the stored row.
- `app/api/accounts/[id]/refresh/route.ts` — Decrypts the refresh token,
  exchanges it, stores the new encrypted tokens, returns the public view.
- `app/api/publish/posts/route.ts` — Creates a post: enforces the
  checklist record, pause flag, schedule validation, and per-target
  gates, then stores post + targets with idempotency keys. Lists posts.
- `app/api/publish/posts/[id]/route.ts` — Returns one post's status.
- `app/api/publish/posts/[id]/publish/route.ts` — Publishes a post now:
  re-enforces every gate, loads staged media once, publishes each
  pending target with retries + idempotency, records per-target status,
  notifies on failure, deletes temp media only when every target
  published. Already-published posts return their status (idempotent).
- `app/api/publish/queue/route.ts` — Groups posts into scheduled, due,
  drafts, published, partial, and failed.
- `app/api/publish/analytics/route.ts` — Unified analytics rows with
  honest empty messages ("no connected accounts", etc.).
- `app/api/publish/analytics/sync/route.ts` — Syncs published targets
  from each platform's API; unsupported platforms listed, never faked.

### UI pages

- `app/accounts/page.tsx` — Per-platform cards (status, scopes,
  connect), status-only account list, refresh/disconnect actions.
- `app/publish/page.tsx` — Composer (clip ref, project, staged media
  key, checklist ref, schedule + timezone, clip facts, per-target
  metadata) plus publish-now and the queue view.
- `app/analytics/page.tsx` — Unified analytics table with a Sync button
  and honest empty states.
- `app/layout.tsx` — Footer nav gains Publish, Accounts, Analytics.
- `app/sitemap.ts` — The three new pages added (admin excluded, as before).
- `app/faq/page.tsx` — Publishing data-flow Q&As (what leaves the site,
  temp-media 24h rule, analytics honesty, approval gating) and a
  corrected sign-in answer (sign-in exists when the server is
  configured; the clipper still works without an account).

### Supporting changes

- `lib/rights/checklist.ts` — Added `getChecklistRow` (lookup by
  post ref) so publish routes can enforce the Phase 2 checklist.
- `lib/rights/declarations.ts` — Exported `restHeaders` for reuse by
  the publish store (no duplicated header logic).
- `lib/publish/posts` post row — `PublishPostRow` gained `pre_publish`
  (stored draft) and `checklist_post_ref` columns.
- `lib/storage/r2.ts` — Presign now supports DELETE, so temp-media
  deletion reuses the Phase 1 storage interface.
- `supabase/migrations/003_clipforge_phase3.sql` — **FILE ONLY, NOT
  APPLIED.** Additive tables (`publish_accounts`, `publish_posts`,
  `publish_targets`, `publish_analytics`, `publish_notifications`),
  RLS on, owner-only policies. Apply order: `clipper-schema.sql`,
  then 001, then 002, then 003 — in the Supabase SQL editor, by the
  owner, after choosing the project.
- `.env.example` — Names only (see env list below); no values.
- `docs/APP_REVIEW_CHECKLIST.md` — Per-platform app-review checklist.

### Tests (all mocked, zero real platform or paid calls)

- `tests/phase3-platforms.test.ts` — Registry statuses + limits.
- `tests/phase3-tokens.test.ts` — Envelope encrypt/decrypt, rotation,
  expiry/refresh timing.
- `tests/phase3-oauth.test.ts` — Config resolution, auth URLs, PKCE.
- `tests/phase3-publisher.test.ts` — Backoff math, idempotency keys,
  retryable vs refused outcomes, Retry-After.
- `tests/phase3-adapters.test.ts` — YouTube multipart shape; stub refusals.
- `tests/phase3-gates.test.ts` — Gate order + refusal reasons, including
  checklist-incomplete → refused and paused → refused.
- `tests/phase3-store.test.ts` — Store helpers against mocked PostgREST;
  encrypt-then-store never contains the plaintext token.
- `tests/phase3-routes.test.ts` — Route level: 503 without a database,
  503 without OAuth config, 400 on invalid bodies, 400 with no
  checklist record, 201 create, 404 missing post, 200 YouTube publish.

## Environment variables (names only — values live in Vercel, never here)

| Variable | Purpose | Where the owner gets it |
|---|---|---|
| `PUBLISH_TOKEN_KEY` | Base64 of 32 random bytes; the envelope key that encrypts stored OAuth tokens. Required for connect/publish. | Generate: `openssl rand -base64 32`. Never commit it. |
| `PUBLISH_TOKEN_KEY_ID` | Key id stamped on encrypted records (rotation). Default `env-v1`. | Chosen by the owner; bump on rotation. |
| `PUBLISH_YOUTUBE_ENABLED`, `PUBLISH_TIKTOK_ENABLED`, `PUBLISH_INSTAGRAM_ENABLED`, `PUBLISH_FACEBOOK_ENABLED`, `PUBLISH_X_ENABLED`, `PUBLISH_LINKEDIN_ENABLED` | Per-platform feature flags. Default off. | Set to `true` only after that platform's app review passes. |
| `YOUTUBE_APP_APPROVED`, `TIKTOK_APP_APPROVED`, `INSTAGRAM_APP_APPROVED`, `FACEBOOK_APP_APPROVED`, `X_APP_APPROVED`, `LINKEDIN_APP_APPROVED` | Per-platform approval flags. Publishing is refused until both the flag and the approval flag are true. | Set to `true` only when the provider approved the app. |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` (+ `YOUTUBE_REDIRECT_URI` optional) | Google Cloud OAuth client for the YouTube Data API. | Google Cloud Console → APIs & Services → Credentials. Redirect defaults to `<NEXT_PUBLIC_SITE_URL>/api/accounts/youtube/callback`. |
| `TIKTOK_CLIENT_ID` / `TIKTOK_CLIENT_SECRET` (+ redirect optional) | TikTok for Developers app (Content Posting API). | TikTok for Developers portal. |
| `INSTAGRAM_CLIENT_ID` / `INSTAGRAM_CLIENT_SECRET` (+ redirect optional) | Meta app for Instagram Graph API Reels publishing. | Meta for Developers. |
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` (+ redirect optional) | Meta app for Facebook Graph API Reels publishing. | Meta for Developers (same app may serve both). |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` (+ redirect optional) | X developer app (media upload + post). | X Developer Portal. |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` (+ redirect optional) | LinkedIn developer app (video post). | LinkedIn Developer Portal. |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Database for accounts/posts/targets/analytics (reused from Phases 1–2). | Supabase project settings / API keys. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (Phase 1 vars) | Object storage for staged media. | Cloudflare R2 dashboard. |
| `NEXT_PUBLIC_SITE_URL` | Base URL for OAuth redirect defaults and share links. | The live site URL. |

Production hardening (documented, not built): replace the env-key
adapter with a KMS-backed envelope adapter (key per record, rotation
via the key id field already on every record). No code change is needed
to the record shape when that lands.

## Setup steps (owner taps — nothing here is done by the agent)

1. **Choose the Supabase project** (same one as Phases 1–2, or a new
   one) and apply, in order, `supabase/clipper-schema.sql`, then
   `supabase/migrations/001_clipforge_phase1.sql`, then
   `supabase/migrations/002_clipforge_phase2.sql`, then
   `supabase/migrations/003_clipforge_phase3.sql` — in the Supabase
   SQL editor. Nothing in the app applies migrations.
2. **Generate the token key**: `openssl rand -base64 32`, paste it as
   `PUBLISH_TOKEN_KEY` (Production) in Vercel, redeploy. Without it,
   connect and publish answer 503 honestly.
3. **Create one OAuth app per platform** (see
   `docs/APP_REVIEW_CHECKLIST.md` for scopes, redirect URIs, and review
   assets), paste each client id + secret into Vercel, redeploy.
4. **Work each platform's app review** until approved, then set that
   platform's `PUBLISH_<PLATFORM>_ENABLED=true` and
   `<PLATFORM>_APP_APPROVED=true`, redeploy. Until then, connect shows
   the honest status and publish refuses with the reason.
5. **R2 lifecycle rule**: in the Cloudflare R2 dashboard, add a rule on
   the `tmp/` prefix expiring objects after 1 day. This is the
   backstop for the 24h temp-media guarantee; immediate delete on
   publish is best-effort and never fails a publish.
6. **Mail provider (optional, later)**: failure notifications are
   in-app only today. Wiring email needs a working provider key; the
   owner's Brevo key is known-bad and is not wired.
7. **Assign owner/admin roles** in the Supabase Table Editor
   (`clipper_users.role`) if the admin strike queue is used — unchanged
   from Phase 2.

## Manual QA checklist

Run these against a deployed build with a test database (never
against production data), one item at a time:

- [ ] **Connect**: with no OAuth config, the Accounts page reports
  setup needed and no auth URL is offered. With config + flags on,
  Connect navigates to the provider's OAuth page; after approval the
  callback lands on `/accounts?connected=<platform>` and the account
  appears with status only (no token anywhere in the page or API).
- [ ] **Disconnect**: disconnect revokes at the provider, deletes the
  stored row, and the account disappears from the list.
- [ ] **Token refresh**: with an expired token and a valid refresh
  token, publishing refreshes automatically and stores the new
  encrypted tokens; with no refresh token, the target fails with a
  clear error (not a silent pass).
- [ ] **Schedule + queue**: a future schedule creates a `scheduled`
  post shown in the queue; a past schedule or bad timezone is refused
  with a specific message.
- [ ] **Publish-to-all**: a post with two targets shows per-target
  status (published / failed / refused) and the post status follows
  (published / partial / failed). No target is retried after success.
- [ ] **Retry/backoff**: force a 429/5xx from the provider (mock or
  staging app); the attempt backs off (1s, 2s, 4s… capped 60s),
  honors Retry-After, and stops after 4 attempts with the error kept.
- [ ] **Idempotency**: re-publish an already-published post returns
  its stored status without a second upload; duplicate create calls
  with the same post + platform + account reuse one target row.
- [ ] **Rate-limit handling**: a 429 from a platform is treated as
  retryable and never as a success; the per-IP 5/min limiter answers
  429 on the sixth quick request.
- [ ] **Validator refusals**: a 95-second clip to YouTube, an
  over-long caption, and a wrong aspect ratio are each refused with
  the specific limit named — and no upload is attempted.
- [ ] **Analytics sync**: after a real YouTube publish, Sync shows the
  platform's own numbers; with no connected accounts the page says
  "no connected accounts"; unsupported platforms are listed, never
  numbered.
- [ ] **Failure notifications**: a failed target creates an in-app
  notification row; a successful target creates none.
- [ ] **Temp-media deletion**: after a full publish, the staged key is
  gone from storage; after a partial publish, the key is kept for
  retry and the 24h lifecycle rule still removes it.
- [ ] **Paused-account refusal**: pause an account (3 upheld strikes,
  Phase 2 admin flow) and confirm publish is refused with the pause
  reason, while other accounts still publish.
- [ ] **Checklist refusal**: submit a post whose checklist ticks are
  incomplete and confirm the create/publish is refused naming the
  checklist, not a generic error.

## Honest gaps (what is interface-only until credentials/approval land)

- **Non-YouTube upload adapters are stubs.** TikTok, Instagram,
  Facebook, X, and LinkedIn refuse with `PLATFORM_NOT_IMPLEMENTED`
  even if their flags were forced on — their real adapters are a later
  slice, after each platform's app review passes. The gates refuse
  these first anyway, since approval flags default off.
- **Analytics sync works for YouTube only.** Other platforms report
  unsupported until their adapters land.
- **Email notifications are inert.** In-app notifications work; email
  needs a working mail provider, which the owner has not supplied.
- **No scheduled worker runs due posts yet.** The queue lists due
  posts honestly, but nothing auto-publishes them on schedule — that
  needs a cron/worker (Phase 4+ candidate) and is deliberately not
  faked with a browser timer.
- **Diarization, server render execution, and CC server-side fetching**
  remain Phase 1 gaps (see `docs/PHASE1.md`); unchanged by this phase.
- **KMS is documented, not built.** The env-key adapter is the shipped
  encryption; KMS is the named production hardening step.
- **Browser-only clips need staging first.** Publish requires a staged
  media key (Phase 1 resumable upload); a clip that only exists in the
  browser cannot be published until it is uploaded through that flow.
