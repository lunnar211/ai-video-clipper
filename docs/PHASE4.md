# ClipForge Phase 4 — Admin console (activity visibility, privacy-respecting)

Phase 4 observes and administers what Phases 1–3 built. It changes no
Phase 1–3 behavior: every audit call is additive (background,
swallowed on failure), every gate refuses only the new admin paths or
view-as writes, and no existing route, flow, or test was altered in
behavior.

## What landed, per scope item

1. **Role-based access + MFA.** Roles owner, admin, support, analyst,
   viewer, read from the `clipper_users` row. Role assignment stays a
   database-level setup step (Table Editor) — there is deliberately no
   in-app role granting. Owner/admin sessions require TOTP MFA:
   enrolment (secret shown once, stored encrypted) + verification
   (12-hour marker cookie). Without MFA configured, admin pages
   honestly report that setup is needed (403 + `mfaSetupRequired`).
2. **Immutable audit log.** Every entry: actor, action, target,
   metadata, IP, user-agent, timestamp. Storage is append-only: the
   app has no update/delete helper for `clipper_audit_log`, and the
   migration grants INSERT + SELECT policies only (owner/admin rows
   for direct PostgREST access). The single deletion path is the
   retention purge, which itself writes an audit entry. API: list
   with filters, CSV/JSON export (file download), purge. Wired into
   Phase 1–3 flows at their natural points (see "Audit wiring").
3. **Dashboards.** DAU/MAU, funnel (signup → first clip → first
   publish → paid), queue health, AI/provider cost per user and per
   feature, revenue/plan counts, publish success per platform, top
   errors, strike stats, anomaly alerts. Every number is a real
   aggregate over database rows. Without a configured database the
   API 503s and the dashboard shows setup instructions. MRR is
   reported as unavailable until subscription data exists — never
   estimated. Costs are recorded only when a provider reports them;
   AI-job audit entries carry `cost_usd: null` (never invented).
4. **User drill-down.** Profile, plan, usage minutes (summed clip
   durations), projects, connected accounts (STATUS ONLY — never
   tokens or token material, enforced in the store layer and in the
   API response shape), posts timeline, compliance record
   (declarations, fingerprint scans, strikes), support notes
   (admin-authored, attributed, timestamped, insert-only), credit
   adjustments (reason + audit entry; balance = sum of adjustments).
   Admin actions: suspend/restore, credit adjust, and view-as.
5. **Privacy by default.** Admins never see video content,
   transcripts, or tokens anywhere in the console. Content access
   requires a separate break-glass grant: one item, one reason
   (10–500 chars), 15 minutes, single use, admin-ownership checked,
   grant + consumption both audited, and only safe metadata columns
   returned (project id/title/created_at; clip
   id/title/start/end/created_at — never media keys or content, and
   the content is never copied into any log). The Privacy Policy's
   admin-activity section was extended to cover this console.
6. **Real-time feed + alerting.** SSE feed of recent audit entries
   (snapshot + heartbeat + configurable lifetime, default 60s).
   Alert rules: unusual volume (default 100 events/hour/user) and
   many accounts per IP (default 5), evaluated over audit rows.
   Slack/Discord/email webhook adapters are env-gated and honestly
   inert until a webhook URL is configured; in-console alerts always
   work. Webhook URLs are never returned to the client (only
   configured/not booleans and channel names).

## Audit wiring (additive, background, never changes responses)

| Flow | Action | Actor |
|---|---|---|
| Auth callback success | `auth.login` | signed-in user id |
| Upload initiate success | `upload.created` | `guest` (uploads are guest-capable) |
| Transcribe / highlights / metadata success | `ai.job_run` (cost null) | `guest` |
| Render job accepted by worker | `render.job_created` | `guest` |
| Publish post created with a schedule | `post.scheduled` | body userId or `guest` |
| Publish-now fully published / fully failed | `post.published` / `post.failed` | post user_id or `guest` |
| Declaration stored | `rights.declaration` | session user or `guest` |
| Fingerprint scan (either verdict) | `rights.fingerprint` | `guest` |
| Checklist stored | `rights.checklist` | `guest` |
| Strike filed / reviewed / appealed | `strike.created` / `strike.reviewed` / `strike.appeal` | `guest` / reviewing admin / `guest` |
| Social account connected / disconnected | `account.linked` / `account.unlinked` | `guest` |
| Billing checkout created | `billing.checkout` | body userId or `guest` |
| Admin actions (all admin routes) | `admin.*` (awaited, not background) | acting admin |

View-as write guards (403, before any work): publish post creation,
publish-now, and billing checkout refuse any request carrying a valid
view-as cookie. Normal requests without a valid marker are unaffected.

## Files changed

- `lib/admin/roles.ts` — role sets + view/act/MFA predicates.
- `lib/admin/totp.ts` — base32 + RFC 6238 TOTP (SHA-1, 30s, 6 digits, ±1 step).
- `lib/admin/session.ts` — MFA marker crypto (HMAC, 12h), admin session resolution, MFA requirement verdicts, issuer helper.
- `lib/admin/guard.ts` — route guards: full (role + MFA) and identity-only (MFA setup/verify only).
- `lib/admin/audit.ts` — action list, metadata sanitizer (drops token/secret/transcript keys, truncates long strings), record/list/export/purge, retention helper, background-safe emitters.
- `lib/admin/store.ts` — PostgREST helpers: users, MFA rows, notes, credit adjustments, impersonation rows, break-glass grants, alerts, drill-down sources (status-only accounts), metric sources, compliance counts.
- `lib/admin/metrics.ts` — pure aggregates: DAU/MAU, funnel, queue health, cost, revenue (MRR unavailable), publish success, top errors, strikes, anomaly detection.
- `lib/admin/alerts.ts` — threshold config + webhook dispatch (channel names only, 10s timeout, failures swallowed).
- `lib/admin/impersonation.ts` — signed view-as markers (HMAC, 2h), request schema, cookie helpers, write guard.
- `lib/admin/breakglass.ts` — grant request schema + 15-minute single-use usability check.
- `lib/admin/sse.ts` — SSE headers, frame format, lifetime config.
- `lib/admin/users.ts` — drill-down assembly (usage minutes, credit balance).
- `app/api/admin/session/route.ts` — session info + active view-as (target id + reason only).
- `app/api/admin/mfa/setup/route.ts` — TOTP enrolment (secret shown once, stored encrypted).
- `app/api/admin/mfa/verify/route.ts` — TOTP verification + 12h marker cookie.
- `app/api/admin/mfa/status/route.ts` — enrolment/verification flags.
- `app/api/admin/audit/route.ts` — filtered audit list.
- `app/api/admin/audit/export/route.ts` — CSV/JSON file download.
- `app/api/admin/audit/purge/route.ts` — retention purge (only deletion path).
- `app/api/admin/metrics/route.ts` — dashboard aggregates.
- `app/api/admin/users/route.ts` — user list.
- `app/api/admin/users/[id]/route.ts` — drill-down.
- `app/api/admin/users/[id]/suspend/route.ts` — suspend + audit.
- `app/api/admin/users/[id]/restore/route.ts` — restore + audit.
- `app/api/admin/users/[id]/credits/route.ts` — credit adjust + audit.
- `app/api/admin/users/[id]/notes/route.ts` — notes list + insert-only create.
- `app/api/admin/impersonate/start/route.ts` — view-as start + cookie + audit.
- `app/api/admin/impersonate/end/route.ts` — view-as end + cookie clear + audit.
- `app/api/admin/break-glass/route.ts` — break-glass grant request + audit.
- `app/api/admin/break-glass/[id]/route.ts` — grant consume + safe-metadata fetch + audit.
- `app/api/admin/events/route.ts` — SSE feed of recent audit entries.
- `app/api/admin/alerts/route.ts` — anomaly evaluation + dispatch + stored alerts.
- `app/admin/layout.tsx` — console layout + nav (also wraps the Phase 2 strikes queue).
- `app/admin/AdminBanner.tsx` — view-as banner (refetches on navigation).
- `app/admin/page.tsx` — dashboard (honest empty/setup states).
- `app/admin/users/page.tsx` — user list.
- `app/admin/users/[id]/page.tsx` — drill-down + admin actions + view-as start.
- `app/admin/audit/page.tsx` — audit viewer + export + purge.
- `app/admin/alerts/page.tsx` — anomalies + thresholds + dispatch.
- `app/admin/mfa/page.tsx` — MFA enrol/verify UI.
- `app/admin/break-glass/page.tsx` — grant request + single-use fetch UI.
- `app/admin/events/page.tsx` — SSE feed viewer.
- `app/layout.tsx` — Admin nav link.
- `app/privacy/page.tsx` — admin console + break-glass + monitoring disclosure extended.
- `app/auth/callback/route.ts` — audit wiring only (auth.login).
- `app/api/uploads/initiate/route.ts` — audit wiring only.
- `app/api/clips/transcribe/route.ts` — audit wiring only.
- `app/api/clips/highlights/route.ts` — audit wiring only.
- `app/api/clips/metadata/route.ts` — audit wiring only.
- `app/api/render/jobs/route.ts` — audit wiring only.
- `app/api/publish/posts/route.ts` — view-as guard + audit wiring only.
- `app/api/publish/posts/[id]/publish/route.ts` — view-as guard + audit wiring only.
- `app/api/rights/declarations/route.ts` — audit wiring only.
- `app/api/rights/scan/route.ts` — audit wiring only.
- `app/api/rights/checklist/route.ts` — audit wiring only.
- `app/api/rights/strikes/route.ts` — audit wiring only.
- `app/api/rights/strikes/[id]/review/route.ts` — audit wiring only.
- `app/api/rights/strikes/[id]/appeal/route.ts` — audit wiring only.
- `app/api/billing/checkout/route.ts` — view-as guard + audit wiring only.
- `app/api/accounts/[platform]/callback/route.ts` — audit wiring only.
- `app/api/accounts/[id]/disconnect/route.ts` — audit wiring only.
- `tests/phase4-admin.test.ts` — unit tests: roles, TOTP vectors, markers, audit sanitize/export/purge, metrics, alerts, break-glass, SSE, drill-down.
- `tests/phase4-admin-routes.test.ts` — route tests (mocked session + fetch): every admin route incl. 401/403/404/503 paths, MFA flow, impersonation, break-glass ownership/reuse, SSE frames, alerts without URLs.
- `tests/phase4-viewas-guard.test.ts` — view-as 403 on publish create + checkout; guard pass-through without a cookie.
- `tests/phase4-audit-wiring.test.ts` — scheduleAudit posts when configured, no-ops when not.
- `.env.example` — Phase 4 variable names only (no values).
- `docs/PHASE4.md` — this file.

## DB migration files (NOT APPLIED — files only)

Nothing in the app applies SQL. The owner chooses the Supabase
project and applies, in order, in the Supabase SQL editor:

1. `supabase/clipper-schema.sql` (base, Phase 1 prerequisite)
2. `supabase/migrations/001_clipforge_phase1.sql`
3. `supabase/migrations/002_clipforge_phase2.sql`
4. `supabase/migrations/003_clipforge_phase3.sql`
5. `supabase/migrations/004_clipforge_phase4.sql` (NEW — audit log
   append-only INSERT + SELECT policies only; admin MFA; support
   notes; credit adjustments; impersonation sessions; break-glass
   grants; admin alerts; `clipper_users.status` for suspend/restore)

The remaining Phase 4 tables intentionally have NO policies: with RLS
enabled and no policy, direct PostgREST access is denied and only the
service-role API routes (which enforce role gates in code) can read
or write them. The service-role key bypasses RLS in raw SQL, as with
earlier migrations — the guarantee is at the API layer.

## Env vars (names only — values never committed)

| Name | Purpose | Where the owner gets it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (reused) | Supabase project settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side DB access (reused) | Supabase project settings → API (service role; never in client code) |
| `PUBLISH_TOKEN_KEY` | ALSO encrypts MFA secrets + signs MFA/view-as markers (reused from Phase 3) | `openssl rand -base64 32` (already set for Phase 3) |
| `ADMIN_MFA_ISSUER` | Name in authenticator apps (default `ClipForge`) | Owner's choice |
| `ADMIN_AUDIT_RETENTION_DAYS` | Audit retention window, days (default 365) | Owner's choice |
| `ADMIN_ALERT_VOLUME_THRESHOLD` | Events/hour/user anomaly threshold (default 100) | Owner's choice |
| `ADMIN_ALERT_IP_USERS_THRESHOLD` | Distinct users/IP anomaly threshold (default 5) | Owner's choice |
| `SLACK_ALERT_WEBHOOK_URL` | Slack incoming webhook (optional) | Slack app → Incoming Webhooks |
| `DISCORD_ALERT_WEBHOOK_URL` | Discord channel webhook (optional) | Discord channel → Integrations → Webhooks |
| `EMAIL_ALERT_WEBHOOK_URL` | Generic email webhook (optional) | Owner's mail provider / webhook service |
| `ADMIN_SSE_MAX_SECONDS` | Live-feed lifetime, seconds (default 60; 0 = close at once) | Owner's choice |

## Setup steps (owner taps — nothing here is done by the agent)

1. Choose the Supabase project (the same one as Phases 1–3, or a new
   one) and apply the SQL files in the order above.
2. In the Supabase Table Editor, set `clipper_users.role` for the
   owner's row to `owner` (and any other admins to `admin`,
   `support`, `analyst`, or `viewer`). No UI can grant roles, by
   design. Default role is `user` (no console access).
3. In Vercel (Production + Preview), confirm
   `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
   `PUBLISH_TOKEN_KEY` are set (Phase 3 values are reused), then
   redeploy.
4. Sign in, open `/admin/mfa`, enrol TOTP (scan the secret once),
   verify a live code. Owner/admin pages refuse access until then.
5. Optional: set retention (`ADMIN_AUDIT_RETENTION_DAYS`), alert
   thresholds, and any webhook URLs, then redeploy.
6. Verify with the MANUAL QA CHECKLIST below.

## MANUAL QA CHECKLIST

- [ ] Role gating: a `user`-role account gets 403 on `/admin` APIs;
  owner/admin/support/analyst/viewer can view; only owner/admin can
  suspend, adjust credits, impersonate, break-glass, purge, dispatch.
- [ ] MFA: without enrolment, owner/admin API calls return 403 with
  `mfaSetupRequired`; after enrol + verify, the same calls succeed
  for 12 hours; a wrong code returns 401; re-enrolment replaces the
  secret.
- [ ] Audit entries across flows: sign in, start an upload, run
  transcribe/highlights/metadata, create a render job, schedule a
  post, publish a post (success + failure), store a declaration, run
  a fingerprint scan, store a checklist, file + review + appeal a
  strike, connect + disconnect an account, create a checkout — each
  appears in `/admin/audit` with actor/action/target/metadata/IP/
  user-agent/timestamp, and never with transcripts, tokens, emails,
  or reporter details in metadata.
- [ ] Export CSV/JSON: both downloads contain the same entries as the
  list view; the CSV header row lists every field.
- [ ] Dashboards incl. honest empty states: with no database, the
  dashboard shows setup instructions (not zeros presented as data);
  with a database but no rows, every aggregate is zero/empty; MRR
  reads "not available", never an estimate.
- [ ] Drill-down incl. status-only accounts: a connected account
  shows platform/label/status only — the page and API response
  contain no ciphertext, access_token, or refresh_token anywhere.
- [ ] Suspend/restore: suspending blocks the admin gate for that
  user; restoring re-allows; both write audit entries.
- [ ] Credit adjust: a positive and a negative adjustment change the
  shown balance by exactly those amounts; a zero delta is refused;
  a missing reason is refused; the adjustment is audited.
- [ ] Impersonation banner + audit: starting view-as with a reason
  shows the amber banner on every admin page; publish/checkout
  attempts during view-as return 403; ending view-as clears the
  banner; start and end both appear in the audit log.
- [ ] Break-glass flow: a grant request without a 10+ char reason is
  refused; fetching with another admin's grant returns 403; a second
  fetch of the same grant returns 410; a fetched item shows only
  id/title/dates (never media keys or content); grant + consumption
  are both audited with the reason.
- [ ] SSE feed: `/admin/events` streams recent audit entries as
  `data:` frames, heartbeats, then closes after the configured
  lifetime; reloading reconnects.
- [ ] Alert rules: with thresholds lowered, a burst of events
  produces an anomaly in `/admin/alerts`; dispatch with no webhook
  configured reports "not configured" (in-console alerts still
  listed); with a webhook configured, the payload arrives and the
  response names the channel, never the URL.

## Honest gaps (interface-only until setup lands, or later phases)

- **Database-gated everything.** Until the owner applies migration
  004 and sets the Supabase env vars, every admin API 503s honestly
  and every console page shows setup instructions. No metric, user,
  or audit row exists before that.
- **MFA-gated admin access.** Until an owner/admin enrols TOTP, the
  console refuses with `mfaSetupRequired`. The secret display is the
  one moment the secret is ever visible; losing it means re-enrolling.
- **Guest actors.** Uploads, AI jobs, renders, scans, checklists,
  strike/appeal intakes, and account links log actor `guest` because
  those flows are guest-capable today (no server identity). When
  auth is wired into those routes, the actor becomes the user id
  without changing the audit shape.
- **No server project creation yet.** `project.created` exists in
  the action list but no Phase 1–3 route creates a project
  server-side (projects are browser-local), so it fires nowhere yet.
  It will fire when a server project API lands.
- **No distinct signup event.** The auth callback cannot distinguish
  OAuth login from email-confirmation signup server-side, so both
  log `auth.login`. A distinct `auth.signup` needs a Supabase Auth
  webhook (a later-phase integration).
- **`clip.rendered` fires on completion only.** Today only
  `render.job_created` fires (job accepted by the worker). The
  worker reports completion in a later phase; that is when
  `clip.rendered` will fire.
- **Partial publish outcomes are not single audit actions.** A
  partially published post logs neither `post.published` nor
  `post.failed`; its per-target outcomes are visible in the queue
  and analytics.
- **SSE is a snapshot, not a live push.** The feed streams
  already-recorded rows on connect; new entries appear on the next
  connection. True live push (e.g. Supabase Realtime) is a later
  phase.
- **Alert webhooks are the only outbound channel.** Email alerts go
  through a generic webhook URL, not a mail provider (Brevo is known
  bad and deliberately not wired). KMS-backed token storage remains
  the documented production hardening for `PUBLISH_TOKEN_KEY`.
- **No Playwright suite.** As in Phases 1–3, the environment has no
  browsers; the manual QA checklist above is the smoke path.
