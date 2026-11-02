# ClipForge Phase 5 — Integration layer

Phase 5 adds a pluggable integration layer on top of Phases 1–4. It
changes no Phase 1–4 behavior: the only edits to existing routes are
three additive, swallowed event-bus calls placed next to existing
audit calls (publish scheduled/published/failed, strike created),
and one additive widening of the Phase 4 audit-action list. Every
existing route, flow, and test still works (full suite green).

IMPORTANT HONESTY NOTE: the owner has NOT yet provided the Phase 5
backends list (specific third-party services to integrate). This
phase therefore builds the GENERIC layer — registry, webhooks,
public API, MCP, event bus, SSO config, GDPR — with one working
reference integration (Slack notifications via the Phase 4 alert
webhook) and one deliberately interface-only entry (Drive export).
No named third-party integration is claimed beyond those. When the
backends list arrives, each named integration lands as: a registry
entry + an adapter + env vars + docs — never a name in a list with
no adapter behind it.

## What landed, per scope item

1. **Integration interface + registry.** A first-class Integration
   definition (typed config schema, required env vars, docs URL) in
   `lib/integrations/registry.ts`, with per-user instances in
   `clipper_integrations` (migration 005) and an admin page listing
   registry entries with derived statuses. Status rules: an entry is
   `configured` only when all its required env vars are set,
   `not_configured` otherwise, `disabled` when the owner turned it
   off, and `interface_only` forever for entries with no adapter.
   Built-ins: `slack-notify` (requires SLACK_ALERT_WEBHOOK_URL),
   `drive-export` (interface only — no adapter, cannot be enabled),
   `generic-webhook` (the webhooks subsystem itself).
2. **Webhooks.** Outbound signed payloads to any HTTPS endpoint:
   per-event subscriptions over `project.created`, `clip.ready`,
   `post.scheduled`, `post.published`, `post.failed`,
   `strike.created`, `billing.event`; HMAC-SHA256 signing
   (`X-ClipForge-Signature: sha256=<hex>`, timestamp in
   `X-ClipForge-Timestamp`, 300s replay tolerance); delivery retries
   with exponential backoff (1s base ×2, 60s cap, jitter); a
   delivery log (sanitized payloads only — no secrets, tokens,
   transcripts, or video); and admin-gated manual replay of failed
   deliveries. Signing secrets are generated server-side, stored
   ENCRYPTED via the Phase 3 envelope, and returned ONCE at
   creation — never again, never in lists or logs. Dispatch is the
   single bridge (`dispatchEventSafe`): it publishes on the bus and
   fans out to subscribed endpoints exactly once; the bus
   deliberately has no dispatching subscriber. A scheduled retry
   sweeper is a later-phase item — retries today are manual replays.
3. **Public REST API (v1).** Versioned read routes
   (`/api/v1/projects`, `/api/v1/clips`, `/api/v1/posts`,
   `/api/v1/usage`) authenticated by scoped API keys
   (`cf_` + 24 chars; only the SHA-256 hash is stored; secret shown
   once at creation; prefix + scopes + revocation + last-used in
   lists, never the hash). Scopes: `read` (lists), `write`, `admin`
   (implies both). Per-key rate limit: default 120/min
   (`INTEGRATION_API_KEY_RATE_LIMIT`). OpenAPI spec at
   `/api/v1/openapi` + an admin API docs page. DELIBERATELY ABSENT
   write endpoints: clip creation, rendering, and publishing are
   NOT exposed in v1 — those operations carry rights-gate, quota,
   and cost side effects the console UI enforces interactively, and
   a raw write path would let a leaked key bypass the consent gate.
   They arrive only when a write path with the same gates exists.
4. **MCP server.** `POST /api/mcp` (JSON-RPC 2.0, same API-key auth
   as v1). Read tools always available: `clip.search` (title
   keyword over the key owner's clips), `project.list`,
   `post.status` (owner's posts only — other owners' posts return
   "not found", never a leak). Write tools: exactly one,
   `webhook.subscribe`, which appears in `tools/list` and executes
   ONLY when `INTEGRATION_MCP_WRITES_ENABLED=true` AND the key
   carries write/admin scope — otherwise `tools/call` returns
   -32000 "write tools are disabled". Default is read-only.
5. **Event bus.** A typed in-process bus (`lib/integrations/events.ts`)
   with the `EventBus` interface as the adapter seam: a later slice
   can swap in an external broker by implementing the same interface
   and calling `setEventBus()` once at startup — publishers and
   subscribers never change. One failing subscriber never blocks
   others or the publisher. Wired additively into Phase 3/2 flows:
   post scheduled/published/failed and strike created now fan out to
   webhooks via `dispatchEventSafe` next to their existing audit
   calls. `project.created` and `billing.event` are defined event
   names with no publisher yet (no server project API / no live
   billing events exist — see gaps). `clip.ready` fires when the
   worker reports render completion — that callback does not exist
   yet (Phase 4 gap, carried forward).
6. **Admin SSO.** Config schema + validation for per-tenant OIDC
   and SAML (`lib/integrations/sso.ts`), an admin setup page, and
   encrypted storage of secrets (client secret / certificate).
   Until an IdP is configured the feature honestly reports
   `setup_needed` — there is deliberately NO fake SSO login path.
   Actual IdP verification (metadata exchange, test login) is an
   owner tap; the saved config has `enabled: false` until that tap
   succeeds. Redirect/ACS URL for the IdP: `<site>/api/auth/sso/callback`
   (the callback route itself is a later slice — see gaps).
7. **GDPR.** Admin-executed export + deletion for a target user
   (end users without a console role request through support; the
   execution is audited). Export downloads a JSON archive of safe
   columns only — never tokens, key hashes, secrets, transcripts, or
   video. Deletion runs in dependency order (children first, user
   row last) and requires `confirm: true`. DELIBERATELY RETAINED,
   stated in the response: `clipper_audit_log` rows (immutable
   history, Phase 4 retention policy) and `clipper_strikes` rows
   (legal-hold takedown records). A self-service portal (signed-in
   user confirming their own deletion) is a documented later-phase
   item, not faked here.

## Files changed

Core (`lib/integrations/`):
- `events.ts` — domain event names, in-process bus + adapter seam, safe publish.
- `registry.ts` — integration definitions, built-in registry, status derivation.
- `webhooks.ts` — HMAC signing/verification, backoff, payload sanitization, delivery attempt.
- `dispatch.ts` — fan-out to subscribed endpoints, replay, single-bridge `dispatchEventSafe`.
- `apikeys.ts` — key generation, prefix, SHA-256 hash, timing-safe verify, scope hierarchy, rate limit.
- `apiAuth.ts` — v1/MCP key auth (lookup, hash, scope, per-key limit, last-used touch).
- `sso.ts` — OIDC/SAML zod schemas + display status.
- `gdpr.ts` — export columns (safe only), deletion order, retained tables, archive builder.
- `store.ts` — PostgREST helpers for the five Phase 5 tables (safe selects only).
- `openapi` — spec lives in `app/api/v1/openapi/route.ts` (imported by nothing else by design).

Routes (all Zod-validated, secrets never in responses):
- `app/api/admin/integrations/route.ts` — registry list + enable/disable (owner/admin).
- `app/api/admin/webhooks/route.ts` — endpoint list + create (secret once, HTTPS only).
- `app/api/admin/webhooks/[id]/route.ts` — get one + delete (owner/admin).
- `app/api/admin/webhooks/[id]/deliveries/route.ts` — delivery log.
- `app/api/admin/webhooks/deliveries/[deliveryId]/replay/route.ts` — replay failed deliveries.
- `app/api/admin/api-keys/route.ts` — key list + create (secret once).
- `app/api/admin/api-keys/[id]/route.ts` — revoke (sets revoked_at, never hard-deletes).
- `app/api/admin/sso/route.ts` — SSO status + save config (secrets encrypted).
- `app/api/admin/gdpr/export/route.ts` — archive download (attachment).
- `app/api/admin/gdpr/delete/route.ts` — ordered hard delete + retained note.
- `app/api/v1/projects|clips|posts|usage/route.ts` — key-owner reads (read scope).
- `app/api/v1/openapi/route.ts` — OpenAPI 3.0 spec (public docs).
- `app/api/mcp/route.ts` — JSON-RPC 2.0: initialize, tools/list, tools/call (writes flag-gated).

UI (`app/admin/`, all client components following the Phase 4 pattern):
- `integrations/page.tsx` — registry list + enable/disable.
- `webhooks/page.tsx` — create form, endpoint list, delivery log, replay.
- `api-keys/page.tsx` — create form, key list, revoke.
- `api-docs/page.tsx` — renders the live OpenAPI spec.
- `sso/page.tsx` — status + setup steps + OIDC/SAML forms.
- `gdpr/page.tsx` — export download + confirmed delete.
- `layout.tsx` — nav links for the six new pages.

Wiring-only edits (no behavior change):
- `lib/admin/audit.ts` — audit-action list widened with 12 Phase 5 actions (additive enum only).
- `app/api/publish/posts/route.ts` — `post.scheduled` bus event next to its audit call.
- `app/api/publish/posts/[id]/publish/route.ts` — `post.published`/`post.failed` bus events next to their audit calls.
- `app/api/rights/strikes/route.ts` — `strike.created` bus event next to its audit call.

Other:
- `supabase/migrations/005_clipforge_phase5.sql` — five tables, RLS on, no policies (service-role routes only). NOT APPLIED — see setup.
- `.env.example` — Phase 5 vars (names only).
- `tests/phase5-core.test.ts` — 19 unit tests (signing, backoff, sanitization, delivery, keys, bus, registry, SSO, GDPR).
- `tests/phase5-routes.test.ts` — 9 route tests (mocked session + fetch).

## Env vars (names only)

New: `INTEGRATION_API_KEY_RATE_LIMIT` (default 120/min/key),
`INTEGRATION_MCP_WRITES_ENABLED` (default off — "true" enables MCP
write tools), `WEBHOOK_SIGNATURE_TOLERANCE_SECONDS` (default 300),
`DRIVE_EXPORT_CLIENT_ID` / `DRIVE_EXPORT_CLIENT_SECRET` (interface
only — no adapter yet, setting them does nothing). Reused:
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`PUBLISH_TOKEN_KEY` (encrypts webhook signing secrets + SSO
secrets), `SLACK_ALERT_WEBHOOK_URL` (Slack notifications).

## Setup steps needing the owner

1. Apply SQL in order: base schema → 001 → 002 → 003 → 004 → **005**
   (files only, nothing auto-applies).
2. Confirm Supabase + `PUBLISH_TOKEN_KEY` in Vercel, redeploy.
3. Create API keys on the API keys page; copy each secret once.
4. Create webhook endpoints on the webhooks page; copy each signing
   secret once; configure the receiver to verify signatures (below).
5. For SSO: create the IdP application, set the redirect/ACS URL to
   `<site>/api/auth/sso/callback`, save the config here, then run a
   test login (the callback route + test login are a later slice —
   saving config alone does not enable SSO login).
6. STILL MISSING: the owner's backends list (name, base URL, auth
   type, data in/out per backend) — required before any named
   third-party integration beyond Slack/webhooks can be built.

## Webhook receiver verification (for integrators)

1. Read `X-ClipForge-Timestamp` (unix seconds) and
   `X-ClipForge-Signature` (`sha256=<hex>`).
2. Reject when `|now - timestamp| > 300` seconds (replay window).
3. Compute `HMAC-SHA256(signing_secret, timestamp + "." + raw_body)`
   and compare with the header in constant time.
4. Accept only 2xx as delivered; anything else is logged failed and
   retried only via manual replay (this slice).

## Manual QA checklist

- [ ] Integrations page: slack-notify shows not_configured without
      SLACK_ALERT_WEBHOOK_URL, configured with it, disabled when
      toggled off; drive-export shows interface_only and its button
      is disabled; enabling drive-export via API returns 400.
- [ ] Webhooks: create an HTTPS endpoint → secret shown once;
      reload → secret gone from list/detail; HTTP URL rejected;
      unknown event rejected; trigger post.published → delivery row
      appears with status delivered (receiver 2xx) or failed
      (receiver 5xx) + backoff time; replay a failed delivery →
      status updates; delivered deliveries refuse replay (400).
- [ ] API keys: create → secret once, list shows prefix only;
      v1 reads work with the key; wrong key → 401; revoked key →
      401; read key on a write-scoped call → 403; 121st call in a
      minute → 429.
- [ ] OpenAPI: GET /api/v1/openapi returns 3.0.0 spec; API docs page
      renders its paths; write endpoints are absent by design.
- [ ] MCP: initialize + tools/list show read tools only by default;
      clip.search/project.list/post.status work; other owners' posts
      return not found; webhook.subscribe returns -32000 with the
      flag off; with flag on + write key it creates an endpoint.
- [ ] Event bus: publish a post → subscribed webhook receives it
      exactly once; a failing receiver never changes the publish
      response.
- [ ] SSO: no config → setup_needed + steps; save invalid OIDC →
      400; save valid OIDC → configured, secret never in responses.
- [ ] GDPR: export downloads a JSON archive with safe columns only
      (no key_hash, no secret_enc, no config_enc); delete without
      confirm → 400; delete with confirm → children-then-user
      counts + retained audit/strikes note.
- [ ] Old flows: Phases 1–4 pages and routes unchanged (full suite
      green is the automated check).

## Honest gaps

- Everything is DB-gated until migration 005 + env land (honest
  503s + setup instructions, never fake data).
- No scheduled retry sweeper: failed deliveries wait for manual
  replay (a cron/worker sweep is a later slice).
- No publishers yet for `project.created` and `billing.event`
  (no server project API / no live billing events exist); no
  `clip.ready` publisher yet (worker completion callback does not
  exist — Phase 4 gap, carried forward).
- SSO callback route (`/api/auth/sso/callback`) + test login are a
  later slice; saving config does not enable SSO login.
- Self-service GDPR portal is a later slice; today admins execute
  export/delete for a target user (audited).
- No named third-party adapters beyond Slack notifications: the
  backends list is still missing from the owner.
- KMS remains the documented hardening for the token key; no
  Playwright suite (no browsers in env) — the manual QA checklist
  above is the smoke path.
