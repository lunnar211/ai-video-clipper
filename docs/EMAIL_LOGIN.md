# Email + password sign-in (admin area)

Small owner-requested addition on top of ClipForge Phases 1–6. Google
sign-in keeps working exactly as before; email + password is an
additional way to sign in. Nothing about roles, MFA, billing, rights,
or publishing changed.

## What was added

- `lib/auth/email-login.ts` — validated email sign-in seam over the
  Supabase Auth browser client (zod input schema, email normalization,
  safe error mapping, internal-only `next` redirect validation).
- `app/signin/page.tsx` — email + password sign-in page (sign-IN only),
  with a Google sign-in button and an honest no-public-sign-up note.
- `components/AuthButtons.tsx` — header now shows "Sign in with email"
  (link to `/signin`) next to "Sign in with Google" when signed out;
  sign-out now also clears the admin MFA marker (see below).
- `app/api/auth/sign-out/route.ts` — POST route that expires the
  httpOnly admin MFA marker cookie. The Supabase session itself is
  still cleared client-side by `client.auth.signOut()` (unchanged);
  this route exists only because browser JavaScript cannot clear an
  httpOnly cookie.
- `tests/email-login.test.ts` — mocked-Supabase tests (see below).
- `docs/EMAIL_LOGIN.md` — this file.

No database migration was needed: the existing schema (Supabase Auth
users + `clipper_users` rows) already covers email sign-in, so no
`007` file ships. No new environment variables. No new dependencies.

## How it works (and what did NOT change)

- Sign-in goes through Supabase Auth (`signInWithPassword`) with the
  same browser client the Google flow uses. A signed-in user is then
  resolved through the exact same path as a Google-signed-in user:
  Supabase session → `clipper_users` row → Phase 4 guard.
- Admin gating is UNCHANGED: opening any `/admin` page still requires
  role owner/admin (support/analyst/viewer per their existing rights)
  AND a verified TOTP MFA session for owner/admin. Email sign-in
  alone grants nothing — a plain `user` role still sees no console.
- The app does NOT create `clipper_users` rows on sign-in (for either
  method — that was already true for Google). The owner's row must
  exist in the Table Editor; see the dashboard steps below.
- Email sign-ins are not written to the audit log as `auth.login`
  (the OAuth callback audits; the client-side password flow has no
  server hook). This is a known gap, not a claim otherwise.

## Owner's dashboard steps (in order)

Do these in the Supabase dashboard, project LeadForge. The password is
set by the owner's own hands here — it is never sent in chat, never
put in code, and never handled by the agent.

1. **Enable the Email provider:** Supabase dashboard → Auth →
   Providers → enable Email (confirm-email setting per the owner's
   choice; if email confirmation is required, confirm the user in step
   2 or the first sign-in will ask for confirmation).
2. **Create the user:** Auth → Users → create the
   `dipeshkarki8292@gmail.com` user with the chosen password, and
   confirm it if confirmation is required.
3. **Ensure the app row:** Table Editor → `clipper_users` → make sure
   a row exists with `id` = the new Auth user's id and `email` =
   `dipeshkarki8292@gmail.com`; set its `role` to `owner`.
4. **Enrol TOTP:** sign in at `/signin` (or with Google), open
   `/admin/mfa`, and verify a live authenticator code. The console
   stays closed until this step is done.
5. **Verify:** open `/admin` — it must load. Then sign out (header)
   and confirm a fresh sign-in asks for the MFA code again.

## What deliberately does NOT exist

- **No public sign-up.** There is no registration form anywhere; the
  `/signin` page says so plainly. Open sign-up would be a separate
  product decision.
- **No password storage in the app.** Passwords live only in Supabase
  Auth. No password value appears in code, tests, docs, or logs.
- **No password reset form in the app.** Resets are dashboard-only
  (Supabase Auth user management). Wiring an emailed reset would need
  a reset-confirm page plus a working sender, which is not built.
- **No role granting from the app.** Roles are assigned in the Table
  Editor only, by design (unchanged from Phase 4).

## Admin hard gate (same build)

- `lib/admin/guard.ts` — `adminLayoutGate()` pure verdict: no session
  → `/signin`, signed in without a console role (or suspended) → `/`,
  console role → allowed. MFA is deliberately NOT checked here: API
  routes still enforce it, and `/admin/mfa` must stay reachable so
  enrolment is possible.
- `app/admin/layout.tsx` — now async: it resolves the session
  server-side and applies the verdict BEFORE rendering anything, so a
  logged-out visitor opening any `/admin` page is redirected to the
  sign-in page with zero admin UI, nav, or content rendered, and a
  signed-in non-admin is redirected home. This covers every page under
  `/admin`, including the strikes queue.
- `components/AdminNavLink.tsx` + `app/layout.tsx` — the main
  layout's Admin link is now this client component, which renders
  nothing when there is no signed-in session. It is client-side on
  purpose, so the root layout stays static (a server session check
  there would make every page dynamic). It knows only "signed in or
  not" — a signed-in non-admin still sees the link, but the layout
  gate above still closes the console to them.
- Consequence to know: with no database configured, the session
  cannot resolve, so `/admin` redirects to `/signin` instead of
  showing the old setup-instructions message. Setup instructions live
  in the docs, not in admin UI.

## Login redirect safety (same build)

- Both sign-in callers pass `redirectTo` = the page's own origin +
  `/auth/callback` (`window.location.origin` in `AuthButtons` and in
  `/signin`) — never a hardcoded domain, so the old taken
  `ai-video-clipper.vercel.app` fallback domain is never used by
  sign-in. (Two pre-existing non-auth fallbacks to that domain
  remain in `app/api/share/route.ts` and `app/sitemap.ts`; they are
  out of this auth scope and are now shadowed by the real
  `NEXT_PUBLIC_SITE_URL` set in Vercel.)
- `app/auth/callback/route.ts` — the `next` parameter is now
  validated with `validNextPath` (internal paths only). The old code
  passed raw `next` into `new URL(next, base)`, which was an open
  redirect: an absolute or protocol-relative `next` could have bounced
  a user to another site. The Supabase Redirect URLs allowlist entry
  for this callback URL lives in the Supabase dashboard
  (owner-managed) and is not code.
- Tests: `tests/admin-hard-gate.test.ts` covers the gate verdicts and
  the callback redirect cases (internal target kept, absolute and
  protocol-relative targets forced home, auth-error redirect kept
  on-site, unconfigured → 503).

## Manual QA checklist

- [ ] Email sign-in works: `/signin` with the dashboard-created user
      lands on the home page signed in.
- [ ] Google sign-in still works: header "Sign in with Google" flow
      unchanged, lands signed in.
- [ ] Wrong password rejected: `/signin` with a wrong password shows
      "Invalid login credentials" and stays signed out.
- [ ] Plain user still blocked: a signed-in user whose
      `clipper_users.role` is `user` gets no console (admin API 403,
      console pages refuse access).
- [ ] Owner + TOTP reaches console: owner role + verified MFA opens
      `/admin`; without the MFA code the console refuses access.
- [ ] Sign-out clears session + MFA marker: after header sign-out, a
      fresh sign-in as owner asks for the MFA code again (no stale
      verified session), and the header shows signed out.
- [ ] `?next=/admin` redirect works after email sign-in, and a
      `?next=` pointing off-site falls back to `/`.
- [ ] Unconfirmed-email case: if confirmation is required and the user
      is unconfirmed, sign-in shows the confirmation message instead
      of signing in.
- [ ] Hard gate, logged out: opening any `/admin` page with no session
      redirects to `/signin` with zero admin UI, nav, or content
      rendered first.
- [ ] Hard gate, non-admin: a signed-in user with role `user`
      opening `/admin` is redirected (home) and never sees the console.
- [ ] Hard gate, nav: the main layout shows no Admin link while
      signed out, and shows it once signed in.
- [ ] Hard gate, MFA enrolment still possible: a signed-in owner
      without MFA can still open `/admin/mfa` and enrol.
- [ ] Redirect safety: after Google and email sign-in, the browser
      stays on this site's own domain (never lands on another site),
      and a crafted callback URL with an off-site `next` falls back
      home instead of leaving the site.

## Tests

`tests/email-login.test.ts` (mocked Supabase client, no live calls):
input validation, email normalization, internal-only redirects,
wrong-password rejection, unconfirmed-email handling, sign-out route
expiring the MFA marker cookie, and admin gating unchanged (user
blocked, owner without MFA refused with setup required, owner with
enrolled + verified MFA passes).
