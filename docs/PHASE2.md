# ClipForge Phase 2 — Rights & Safety System

Built on main over Phase 1 (a400392) + the earlier session rights
checkbox, AudD adapter, music picker, legal pages, Supabase sign-in,
quota/watermark, and inert Paddle adapter. Nothing existing was
removed or renamed; every pre-existing test still passes.

## Files changed

**Core library (`lib/rights/`, new)**
- `lib/rights/declarations.ts` — declaration text version + zod
  schema + PostgREST helpers (insert/select only; no update/delete
  helper exists anywhere).
- `lib/rights/fingerprint.ts` — fingerprint provider interface,
  AudD wrapper, ACRCloud adapter (documented signature shape,
  mocked-network tested, never live-tested — no ACRCloud account
  exists here), provider selection (AudD, then ACRCloud, else null),
  and the NOT_SCANNED constant.
- `lib/rights/policy.ts` — block / warn / allow-with-licence-proof /
  not_scanned outcomes, repeat-infringer thresholds, pre-publish
  draft schema + verdict evaluator.
- `lib/rights/attribution.ts` — deterministic music credit lines +
  licence-requires-attribution check.
- `lib/rights/checklist.ts` — the four per-post items, zod schema,
  completeness check, PostgREST record helper.
- `lib/rights/strikes.ts` — strike/appeal schemas, status-transition
  guards, auto-pause threshold logic, PostgREST helpers, and the
  `isPublishingPaused()` enforcement hook Phase 3 will call.
- `lib/rights/admin.ts` — admin identity from the signed-in session
  + user row; owner/admin gating for the review queue.

**Music library (`lib/music/tracks.ts`, extended)**
- Sources and licensed tracks now carry licence type, attribution
  requirement, and source URL; `userTrackAttribution()` /
  `licensedTrackAttribution()` build the credit line.

**API routes (`app/api/rights/`, new)**
- `declarations` (POST + GET) — immutable record store + gate check;
  503 honestly without a database.
- `scan` (POST) — always answers a verdict object; no provider →
  not_scanned (never clean); provider error → 502, never a pass.
- `pre-publish-check` (POST) — stateless draft verdict for Phase 3.
- `checklist` (POST) — per-post record; rejects incomplete ticks;
  503 honestly without a database.
- `strikes` (POST public intake, GET admin list, role-gated).
- `strikes/[id]/appeal` (POST) — appeal intake.
- `strikes/[id]/review` (POST, admin-only) — transition validation +
  pause-flag recompute from upheld-strike count.

**UI (additive wiring only)**
- `components/ComplianceChecklist.tsx` (new) — per-post ticks, clip
  picker, licence-proof input, not-scanned acknowledgement, verdict
  display, record save with session-only fallback note.
- `components/ClipperTool.tsx` — per-session project id, declaration
  POST on accept (server vs session label), "Not scanned" wording
  for unavailable music checks, ATTRIBUTION.txt in the ZIP export.
- `components/MusicPicker.tsx` — attribution text + Copy button
  when the selected track requires it.
- `components/RightsConsent.tsx` — unchanged (the checkbox itself
  already said the right thing).
- `app/report/page.tsx` (new) — public takedown intake + appeal forms.
- `app/admin/strikes/page.tsx` (new) — role-gated review queue with
  uphold/overturn actions (401/503 states shown honestly).
- `app/cookies/page.tsx`, `app/acceptable-use/page.tsx` (new).
- `app/privacy/page.tsx` — AI/data-flow disclosure (which provider
  gets what), retention in plain words, admin-logging disclosure,
  declaration storage note.
- `app/terms/page.tsx` — declaration record + per-post checklist.
- `app/copyright/page.tsx` — repeat-infringer thresholds (2 review,
  3 auto-pause), intake/appeal flow, admin review note.
- `app/layout.tsx`, `app/sitemap.ts` — footer + sitemap links for
  the new pages (admin page deliberately excluded from the sitemap).

**Database (files only, NOT applied)**
- `supabase/migrations/002_clipforge_phase2.sql` — new tables
  (declarations, fingerprint_scans, checklists, strikes, appeals)
  + `clipper_users.role` + `clipper_users.publishing_paused`. RLS
  ON everywhere. Declarations: INSERT + SELECT policies only, no
  UPDATE/DELETE policy on purpose. Strikes/appeals: NO anon policy
  on purpose (reporter emails must not be listable via PostgREST).

**Tests (new, all mocked — zero real paid calls)**
- `tests/phase2-rights.test.ts` — policy outcomes (incl. unscanned
  never clean), pre-publish readiness, attribution, checklist,
  transitions, thresholds, notice/appeal schemas, declaration schema.
- `tests/phase2-fingerprint.test.ts` — ACRCloud parse/signature/
  mocked provider/error surfacing, not-scanned with no keys.
- `tests/phase2-db.test.ts` — PostgREST helpers with mocked fetch
  (declaration, strike, appeal, checklist, failure surfacing).

## Env vars

No new required vars. New optional names (`.env.example` only):
- `ACRCLOUD_ACCESS_KEY`, `ACRCLOUD_ACCESS_SECRET`, `ACRCLOUD_HOST`
  — second fingerprint provider; without both keys the adapter never
  runs. Host defaults to the EU endpoint.
- Reused: `AUDD_API_TOKEN` (fingerprint), `NEXT_PUBLIC_SUPABASE_URL`
  + `SUPABASE_SERVICE_ROLE_KEY` (declaration/strike/checklist
  storage), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (admin session lookup).

## Setup steps (owner taps)

1. Supabase project choice (same project as Phase 1, or a new one —
   tell the parent which): apply `supabase/clipper-schema.sql` if not
   already applied, then `001_clipforge_phase1.sql`, then
   `002_clipforge_phase2.sql` in the SQL editor. Nothing in the app
   applies these.
2. Assign admin roles: in Supabase Table Editor → `clipper_users`,
   set `role` to `owner` or `admin` for the accounts that may use
   `/admin/strikes`. No UI in the app can grant this (by design).
3. Fingerprint keys (optional): paste `AUDD_API_TOKEN` and/or the
   ACRCloud keys into Vercel + redeploy. Until then every scan reads
   "not scanned" — which is honest, not a failure.
4. Replace `CONTACT_EMAIL_PLACEHOLDER` on the Contact page with a
   real monitored mailbox before promoting the report forms — the
   forms' 503 fallback points there.
5. Redeploy (parent does this after this report) + run the QA
   checklist below.

## Manual QA checklist

- [ ] Declaration gate: unchecked → transcription + render blocked
  with the rights message. Checked → both unblock. Note under the
  checkbox reads "session-only" without a database, "stored
  server-side" with one (check the network tab for the POST).
- [ ] Fingerprint block path: with a key + a matched sample, the
  policy reads block and the checklist verdict is not ready until
  licence proof is added.
- [ ] Fingerprint warn path: no match → verdict warn, ready, with
  the "not proof of clearance" note visible.
- [ ] Fingerprint allow path: match + licence proof → verdict
  allow-with-licence-proof, ready.
- [ ] Fingerprint not-scanned path: no key → scan reads "not
  scanned" everywhere (tool music check, checklist, verdict). Tick
  the acknowledgement → verdict ready; unticked → not ready.
- [ ] Licence attribution: pick a CC-BY track in the picker →
  attribution line + Copy button appear; ZIP export contains
  ATTRIBUTION.txt with the same line.
- [ ] Checklist per post: two different clips → two separate
  records (postRef differs); incomplete ticks rejected with a clear
  message.
- [ ] Strike intake → review → appeal: file a notice on /report →
  (with DB) it appears in /admin/strikes for an admin; move it to
  under review → uphold/overturn; file an appeal on /report with
  the strike id; confirm transitions outside the documented flow
  are rejected.
- [ ] Auto-pause: an account with 3 upheld strikes shows
  publishing_paused (check the user row); overturning one strike
  recomputes it.
- [ ] Admin gating: signed-out or non-admin → /admin/strikes shows
  the admin-required message, never the queue.
- [ ] Legal pages: /cookies, /acceptable-use, /privacy (AI/data-flow
  + retention + admin logging), /terms, /copyright (thresholds +
  appeal flow) all render; footer links work; no page promises
  "copyright-free" or earnings (search the pages for both phrases
  — zero hits expected).

## Honest gaps (interface-only until setup lands)

- Declarations, checklist records, strikes, and appeals are fully
  built but 503 honestly until the owner applies migration 002 and
  sets the service-role key. The session checkbox + session-local
  checklist keep the current browser path working meanwhile.
- The admin queue needs a signed-in owner/admin row; until roles
  are assigned it answers 401 honestly.
- ACRCloud is adapter-shaped, not live-verified (no account/key).
- Pre-publish enforcement against REAL posts arrives with Phase 3
  publishing; Phase 2 validates drafts and records per-post ticks.
- Scan results are stored only when the owner wires the scans table
  write (the table exists in migration 002; the scan route returns
  verdicts but does not yet persist them — a deliberate Phase 2
  boundary: persistence of scan history is a Phase 3/4 analytics
  item, and the verdict is always shown to the user regardless).
- No Playwright suite (same as Phase 1 — no browsers in this
  environment); the checklist above is the smoke path.
