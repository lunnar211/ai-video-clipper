# ClipForge Phase 13 — Post without connecting ("Post without passwords")

Owner order, with a screenshot of the /accounts page showing
YouTube Shorts, TikTok, Instagram Reels, Facebook Reels all
"Disabled / Not enabled": run the site's own posting inside the
tool so users can post AI-made viral clips to all social medias
directly, without saving any ID or login on the site, with the site
only monitoring activity (privacy basis) — and no copyright trouble
from AI editing.

## Why there is no embedded browser

The owner asked for "our own browser inside there". That exact thing
cannot work, and this phase does not pretend otherwise:

- Platforms block their login pages inside other websites
  (X-Frame-Options / CSP frame-ancestors). An iframe login page
  refuses to render; there is nothing to style around it.
- Platforms also block their OAuth pages inside embedded webviews
  (Google has done so since 2017). A proxied or in-app login is
  refused at the platform, and collecting a user's platform login
  or session inside this site would be credential handling — the
  opposite of the privacy ask.

The working equivalent of "post directly", on the open web, is two
paths that never touch a platform login:

1. **Device share sheet.** From a finished clip, "Post clip" hands
   the clip file (plus title + hashtags) to `navigator.share`. On a
   phone, the sheet lists the apps the user already uses — picking
   one posts the clip from the app itself, where the user is already
   signed in. On success the site records "shared"; on dismissal,
   "cancelled".
2. **Deep links to the platform's own upload page.** Each platform
   button opens that platform's upload/composer page in a new tab,
   where the user is already signed in on the platform itself.
   Clicking records "opened". The clip is downloaded first (or is
   already downloaded) and uploaded from the platform's page.

No login, grant, session, or media content ever reaches this site
through either path — zero credential storage by construction, not
by policy. There is no login form, no iframe, no proxy of any
platform page anywhere in this flow.

## Deep links (verified as far as the open web allows)

| Platform | Upload entry point | Note |
|---|---|---|
| YouTube Shorts | `https://www.youtube.com/upload` | Public upload page. |
| TikTok | `https://www.tiktok.com/upload` | Public upload page. |
| Instagram Reels | *(none — app-only)* | Instagram offers no public web page for uploading Reels. Its button runs the share sheet on a phone, or downloads the clip for an in-app upload on a computer. Inventing an upload URL would have been dishonest, so this is the one deliberate deviation from "a button for all six that opens an upload page" — reported here, not hidden. |
| Facebook Reels | `https://www.facebook.com/reels/create` | Reels composer. |
| X | `https://x.com/compose/post` | Post composer. |
| LinkedIn | `https://www.linkedin.com/post-new/` | Post composer. |

Platforms move these pages around, so the UI carries a hedge note:
if a link lands on a home page instead of the upload screen, tap
Create there. A moved page is an annoyance, not a broken promise —
the site never claims the post happened.

## Activity-only log (what it records, and what it does not)

- **Records:** clip id, platform (one of the six, or
  "share_sheet"), outcome ("shared" / "cancelled" / "opened" /
  "unsupported"), timestamp. Table: `clipper_post_activity`
  (migration `007_clipforge_phase13.sql` — FILE ONLY, applied by the
  owner; RLS on with deliberately no anon policy, reachable only
  through the service-role routes).
- **Never records:** any login, grant, session, media content, or
  post URL. The table has no column for any of those.
- **Never "published":** a share or a deep-link click is not a
  confirmed live post. The UI, the API, and the admin aggregate all
  say "shared" / "opened", and the UI states plainly that only the
  platform itself can confirm a live post.
- **Admin view:** GET /api/admin/post-activity (console roles +
  MFA gate) returns counts by platform and by outcome over the
  newest 5000 rows (with a `truncated` flag). The admin dashboard
  shows the same counts in a "Post activity (no-connect path only)"
  card. A recording failure (database not set up, rate limit)
  never blocks posting — the UI says the activity note was not
  recorded, while the share/download/link itself still worked.
- **Guests:** activity recording needs no session (clip ids are
  browser-local and carry no user data). The 5/min per-IP limiter
  applies; a 6th quick event is dropped from the log, never from
  the post action.

## Copy + accounts page (OAuth cards untouched)

The OAuth connect cards are exactly as they were: still gated on
feature flags + app review, still "Not enabled" where disabled,
never faked live. What changed is the explanation around them:

- **/accounts** gains a "Post without connecting — available now"
  section: the two paths, side by side — (a) post without
  connecting, available now, no login saved anywhere; (b) connected
  accounts, the future API path, off until each platform's app
  review is approved.
- **/publish** gains a banner pointing at the no-connect path; the
  composer itself is only for the connected-account path.
- **Post screen** carries the copyright sentence (copy, not code —
  the rights rules themselves are unchanged from Phases 2/11):
  "AI editing does not remove copyright — safety comes from the
  source video, which is why this tool only clips your own video or
  verified free-licence video." Nothing here promises "no copyright
  strikes" — no tool can promise that.

## What changed (files)

- `lib/post/direct-share.ts` — platform table, share helpers
  (injectable navigator for tests), honesty copy constants.
- `lib/post/activity.ts` — event schema, database resolve/record/
  aggregate (PostgREST, service-role pattern reused from share
  links).
- `app/api/post-activity/route.ts` — POST record (rate-limited,
  zod-validated, 503 without a database).
- `app/api/admin/post-activity/route.ts` — GET aggregate
  (adminGate + console roles).
- `supabase/migrations/007_clipforge_phase13.sql` — FILE ONLY.
- `components/PostClip.tsx` — the Post panel, rendered per
  finished clip in `components/ClipperTool.tsx` under the same
  music-detection gate as the clip download (a clip flagged with
  detected music stays unpostable until the risk is acknowledged).
- `app/accounts/page.tsx`, `app/publish/page.tsx` — two-path copy.
- `app/admin/page.tsx` — post-activity dashboard card.
- `tests/phase13-direct-post.test.ts`, `e2e/phase13.spec.ts`.

## Verification

- vitest: 376/376 across 45 files (363 pre-existing + 13 new:
  platform table, share outcomes incl. cancel/fallback, event
  schema incl. "published" rejection, record body shape,
  aggregate counts, route 400/503/success/rate-limit).
- tsc: 0 errors. eslint: 0 on changed files. `next build`: 0.
- Playwright: 27/27 full suite (5 new Phase 13 specs: accounts
  copy, publish banner, activity 400, activity 503 without a
  database, admin aggregate gated). One real find during the run:
  the shared per-IP limiter made the 503 spec flaky in the full
  suite (earlier specs' POSTs from localhost filled the bucket), so
  the activity specs use distinct test IPs — documented here, not
  hidden.
- Downloader-term grep on changed files: only legitimate hits (the
  standing "never downloads videos from YouTube" statement, own-clip
  download wording). Credential-term grep on the new flow: zero
  login/grant/session handling. "Published" appears only in
  never-published disclaimers.
- No Supabase dashboard changes, no SQL applied, no Vercel env
  changes, no deploy by the builder. Old Phase 4 stash untouched.

## Honest gaps (not hidden)

- The Post panel only renders after a clip is rendered (it needs
  the clip bytes). Its share/deep-link behavior is pinned in vitest
  with a mocked share API, not in Playwright — a full browser clip
  render needs a real AI run, and no fake clip was invented to
  force the panel on screen.
- Instagram has no web upload page (see the table above); its path
  is the share sheet / in-app upload.
- The activity log is empty until migration 007 is applied by the
  owner; until then the route 503s honestly and posting still
  works — only the activity note is lost, and the UI says so.
- The connected-account OAuth path is unchanged: still gated on
  flags + app review, still not live for any platform. The parallel
  social-linking research (official APIs, aggregators) is a separate
  decision for the parent — this phase does not pre-empt it.
- Live proof after the parent deploys is still owed (QA checklist
  below).

## QA checklist (run after deploy)

- [ ] Render a clip, open "Post clip": share sheet offers on a
      phone; fallback panel appears where file sharing is
      unsupported.
- [ ] Each platform button opens that platform's upload page (or,
      for Instagram, the share sheet / download path) in a new tab.
- [ ] After applying migration 007, a share/click creates a row in
      `clipper_post_activity`, and the admin dashboard card shows
      the counts — with no outcome ever reading "published".
- [ ] /accounts shows the two-path section; OAuth cards still show
      their honest statuses (nothing claims to be live).
- [ ] Sign-in flow unchanged; logged-out `/admin` still redirects
      to `/signin` with no admin UI.
