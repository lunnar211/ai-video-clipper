# ClipForge Phase 20 — Professional redesign + device-friendly + full-site bug check

Owner judgment: the site still looked "vibe-coded" even after the
Phase 12 Ink + Record identity pass. This phase is NOT a rebrand
and NOT a new identity: Ink + Record stays (near-black ink
surfaces, signal-red record-dot accent, warm paper background, the
tokens in `app/globals.css`), and the execution is elevated until
the site reads as professionally built — on every page, on every
device size. No behaviour change except where an item IS a bug
(each documented below). No copied assets, text, branding, or
design from any other site.

## 1. Full-site design audit (read every page before fixing)

### Chrome (site-wide)
- **A1 — Phone nav collapse (real, worst on site).** The header
  held 10 links + theme toggle + sign-in buttons in one
  `flex-wrap` row. On a 375px phone it wrapped into 4–5 ragged
  rows, pushing the page content down and burying links.
  Fixed: two-row header — row 1 wordmark + theme + auth, row 2
  a single horizontally scrollable link bar (`flex-nowrap`,
  `overflow-x-auto`, every link `min-h-[44px]`,
  `whitespace-nowrap`). All links stay reachable by scrolling
  the bar; nothing wraps, nothing is stranded.
- **A2 — Admin console nav, same disease.** 15 plain underline
  links in a wrapping row, no touch height, `border-b` without
  `border-border` (renders currentColor in Tailwind v4).
  Fixed: same scrollable-bar treatment + `border-border`.
- **A3 — Nested `<main>` landmarks.** The layout already renders
  `<main>`; `/accounts`, `/publish`, `/analytics` added a second
  `<main className="mx-auto max-w-4xl px-4 py-8">` inside it
  (doubling the page padding), `/share/[token]` added a
  `max-w-2xl p-6` one, every `/admin` page and `/signin` added a
  bare `<main>`. One landmark per page is the correct shape.
  Fixed: inner mains become `<div>`s (parent spacing governs);
  the auth spec's `main main` locator was re-scoped to the new
  sign-in wrapper (see §6).

### Type scale (inconsistent)
- **A4 — Page titles in three sizes.** Marketing/tool pages used
  `text-3xl` (create, generate, pricing, faq, how-it-works);
  content pages used `text-2xl` (accounts, publish, analytics,
  billing, report, share, contact, cookies, acceptable-use,
  terms, privacy, copyright); admin used `text-xl`; sign-in
  used `text-xl`. A visitor moving between pages felt the
  hierarchy shift for no reason. Fixed: every page title is
  `text-3xl font-bold tracking-tight` (admin console titles
  `text-2xl`, the console's denser hierarchy, still
  `tracking-tight`).

### Card treatment (inconsistent)
- **A5 — Borderless cards.** FAQ and pricing cards were
  `rounded-xl bg-card p-5 shadow-sm` — no border edge, tighter
  padding than the homepage's `border + p-6` cards, so they
  read as a different component. Fixed: `border-border` + `p-6`
  everywhere.
- **A6 — Report sections.** `rounded-xl border p-4` — a bare
  `border` (currentColor in Tailwind v4, the exact inconsistency
  Phase 12 named) and tighter padding. Fixed: `border-border
  bg-card p-6 shadow-sm`.
- **A7 — Accounts cards.** `rounded border p-4`, no shadow, no
  card background token. Fixed: `border-border bg-card p-6
  shadow-sm` (same for the account list items and the
  "post without connecting" panel).

### Touch targets (below the site's own 44px rule)
- **A8 — Admin console buttons/inputs at ~28–30px.**
  Dozens of `px-3 py-1` buttons and `px-2 py-1` inputs across
  every admin page, plus `py-2` buttons on accounts/publish/
  report/sign-in (~36–40px). The tools already used
  `min-h-[44px]`; the console and forms did not. Fixed: every
  admin/action button gains `min-h-[44px] inline-flex
  items-center` (padding unchanged, height guaranteed), and a
  single global rule in `globals.css` gives every text-like
  form control a 44px minimum (checkboxes, radios, ranges,
  and color pickers excluded — they have their own geometry).
- **A9 — iOS auto-zoom on form focus.** Phone Safari zooms any
  focused input below 16px; the site's forms are `text-sm`
  (14px). Fixed: a phone-only stylesheet rule keeps form text
  at 16px below 768px, so no zoom is triggered. Desktop text
  is untouched.

### Readability
- **A10 — Report form labels in muted gray.** The whole report
  page wrapped itself in `text-muted-foreground`, so form
  labels rendered in gray — labels are instructions, not
  secondary text. Fixed: the wrapper drops the muted color;
  body paragraphs keep it explicitly.

### Stale copy (Phase 19 regression)
- **A11 — "Output is 720×1280 vertical video" in the FAQs.**
  True for the clipper tool, incomplete since Phase 19: the
  generator also renders 1280×720 and 720×720. The homepage
  FAQ (`lib/marketing.ts`) and the FAQ page both carried the
  old sentence. Fixed: both now say clips from the clipper are
  720×1280, and generated shorts also come in 1280×720 and
  720×720. Tool-internal copy (ClipperTool, create page,
  how-it-works step 5) is still accurate — the tool is
  9:16-only — and is unchanged.

### User-friendly gaps
- **A12 — No way back from /generate to clipping.** `/create`
  banners toward `/generate`, but `/generate` never mentioned
  `/create` — a visitor with their own video had only the nav
  to find their way back. Fixed: a reciprocal line on the
  generate page ("Have a video of your own? Clip it instead")
  linking to `/create`, mirroring the existing create banner.
- **A13 — Nav discoverability.** After the A1 restructure, the
  primary actions (Create, AI Video Generation) sit first in
  the scrollable bar, then How it works, FAQ, Pricing,
  Publish, Accounts, Analytics — a first-time visitor finds
  the two tools without hunting.

### Checked and deliberately NOT changed
- Status hues (amber warnings, red errors, green success, sky
  info, all with dark variants) carry meaning, not brand —
  kept, as in Phase 12.
- True-black video surfaces, the black/70 caption overlay, and
  the yellow-300 active-word highlight stay (color accuracy,
  not brand).
- The tool workspace stays light in dark mode (accurate color
  preview while editing), as documented since Phase 7.
- Prices stay "coming soon"; `CONTACT_EMAIL_PLACEHOLDER`
  stays a placeholder (owner's mailbox, never invented).
- No dead links, no `href="#"`, no TODO/lorem text found
  anywhere in app/components (grep-verified).

### Probe-found bugs (numbered here so §2/§3 can cite them)
- **A14 — /publish overflowed at 375px (proven by spec).**
  `grid-cols-2`/`grid-cols-3` form grids whose inputs cannot
  shrink below intrinsic width. Fixed by collapsing to one
  column below `sm:`.
- **A15 — /publish queue hid a rate limit behind the wrong
  message (found via the 429s).** A 429 fell through to "Queue
  needs database setup on the server." Fixed: a 429 now shows
  the limiter's own "Too many requests — try again in a
  minute." /accounts already surfaced it correctly.

## 2. What changed (files)

- `app/layout.tsx` — two-row header: brand + theme + auth on row
  1, scrollable link bar on row 2 (A1). No link added or removed.
- `app/admin/layout.tsx` — console nav becomes a scrollable bar
  with `border-border` and 44px links (A2).
- `components/AdminNavLink.tsx` — Admin link joins the scrollable
  bar (`shrink-0`, `whitespace-nowrap`).
- `app/globals.css` — 44px minimum for text-like form controls;
  phone-only 16px form text (A8, A9).
- Page titles → `text-3xl tracking-tight` (A4): accounts,
  publish, analytics, billing, share, contact, cookies,
  acceptable-use, terms, privacy, copyright, report, signin.
  Admin console titles → `text-2xl tracking-tight`.
- Cards → `border-border` + `p-6` + `shadow-sm` (A5–A7): faq,
  pricing, report sections, accounts cards/panels, share card.
- Bare `border` without a color → `border-border` (A6 + audit
  sweep): report sections, billing list items (admin + public),
  BrandKitPanel swatch, ComplianceChecklist section.
- Nested `<main>` → `<div>` (A3): accounts, publish, analytics,
  share, every admin page, signin (signin wrapper gains
  `data-testid="signin-page"` for the auth spec).
- Touch-height buttons (A8): every admin action button, plus
  accounts/publish/report/signin buttons, gain `min-h-[44px]
  inline-flex items-center` (padding unchanged).
- `app/publish/page.tsx` — grids collapse on phones (A14 below);
  queue 429 shows the limiter's own message instead of the
  "needs database setup" text (A15 below).
- `app/admin/billing/page.tsx` — stats grid collapses on phones.
- `app/report/page.tsx` — labels render in foreground (A10).
- `lib/marketing.ts`, `app/faq/page.tsx` — FAQ output formats
  corrected (A11).
- `app/generate/page.tsx` — reciprocal "Clip it instead" link to
  /create (A12).
- `e2e/phase20.spec.ts` (new), `tests/phase20-polish.test.ts`
  (new), `e2e/auth.spec.ts` (locator re-scoped to the sign-in
  wrapper — the only spec that depended on the nested `<main>`).

## 3. Viewport probe results (evidence, not claims)

Baseline probe (before fixes, dev server): 40 passed, 5 failed.
- **A14 — REAL BUG: /publish overflowed at 375px.** Cause:
  `grid-cols-2` and `grid-cols-3` form grids whose inputs cannot
  shrink below their intrinsic width. Fixed by collapsing to one
  column below `sm:` (schedule/timezone, duration/size/aspect,
  target platform/account). The admin billing stats grid got the
  same treatment. After the fix, /publish passes at 375px and
  768px.
- **Console errors (both viewports):** the first run's errors
  were the React dev-mode eval warning only — a dev-server
  artifact (CSP blocks eval; production React never uses it).
  The production run's errors were `429 (Too Many Requests)`
  resource failures only: the site's own per-IP limiter firing
  because one spec visits 18 routes in seconds. Both are
  filtered in the spec with comments; anything else still fails.
- **Signin specs (spec-env, not product):** the /signin form
  only renders when Supabase is configured; the dev server had
  no env, so `getByLabel("Email")` timed out. The touch/zoom
  specs now use /report and /generate, which render with no
  server setup; the existing auth spec still covers the form
  under the Playwright dummy-env production run.
- **A15 — REAL BUG (found via the 429s): /publish queue hid a
  rate limit behind the wrong message.** A 429 fell through to
  "Queue needs database setup on the server." Fixed: a 429 now
  shows "Too many requests — try again in a minute" (the
  limiter's own wording). /accounts already surfaced the
  limiter's message correctly — verified, unchanged.
- Footer-link check: every internal link from the homepage
  resolves below 400. Logged-out /admin still redirects to
  /signin. No dead links, no `href="#"`, no TODO/lorem text.

## 4. Verification (run before commit, all green)

- `npx vitest run` — **482/482** (52 files; 468 pre-existing +
  14 new Phase 20 pins: nav structure, title scale, card
  treatment, bare-border rule, touch rules, phone text, publish
  grids, single landmark, report labels, FAQ formats).
- `npx tsc --noEmit` — **0 errors**.
- `npx eslint` on all changed files — **0 errors, 0 warnings**
  (the only warning in the run was ESLint noting globals.css
  is not a linted file type).
- `npm run build` — **0 errors** (fresh production build; the
  Playwright run rebuilt again from the same tree).
- `npx playwright test` — **101/101** against the production
  build (56 prior + 45 Phase 20: 18 routes × no-horizontal-
  scroll at 375px and 768px, console-error pass at both
  widths, phone nav reachability + navigation, generate flow
  on a phone, 44px touch rule, 16px phone form text,
  footer-link resolution, logged-out /admin redirect). One
  first-run vitest failure was the pin's own strictness (a
  `border` + explicit amber color is legitimate) — the pin
  was narrowed to "border with no color at all", and the
  sweep then found 10 genuinely bare borders in billing
  pages + BrandKitPanel, which were fixed.
- Downloader-term grep on the diff — **zero new hits** (the
  only matches in changed files are pre-existing prohibition
  lines in acceptable-use and terms).
- Banned-promise grep on new UI copy — **zero**
  (`copyright-free`, `copyright removed`, `no copyright
  strikes`, earnings/guarantee wording).
- Violet/indigo/gradient in the diff — **zero**.
- No CSP change, no env change, no SQL, no deploy by the
  builder. `stash@{0}` (old Phase 4 publish WIP) untouched.

## 5. Nothing else changed

Clipping, generation, CC verification, YouTube journey, clean
audio, rights panel, post panel, plan gates, billing binding,
admin gate, sweepers, Ink + Record identity — all untouched
except the documented visual/UX items above. `/signin` keeps
working; logged-out `/admin` keeps redirecting to `/signin`.
The 9:16 default render path is unchanged in behaviour.

## 6. Honest gaps (not hidden)

- Real-phone proof is still owed: the specs prove layout,
  reachability, and touch heights in desktop Chromium at phone
  widths, not on a physical phone (share sheet, real Safari
  zoom behaviour, thumb reach). The owner checking the site
  on his phone is the final proof.
- The phone-only 16px form-text rule prevents iOS auto-zoom
  by construction (computed-size spec pinned), but it has not
  been observed on a real iPhone.
- Admin console pages were verified by code + unit pins, not
  by signed-in browser specs (no test accounts exist) — the
  console layout changes (scrollable nav, 44px buttons) are
  the same patterns proven on public pages.
- The demo-clips slot (`public/demo/`) is still empty until
  the owner sends a video (pre-existing).
- `CONTACT_EMAIL_PLACEHOLDER` still needs the owner's real
  mailbox; plan prices still "coming soon" (both pre-existing,
  unchanged).

## QA checklist (for the parent's live probe, after deploy)

- [ ] Homepage on a phone: header is two rows, the link bar
      scrolls sideways, no page scrolls sideways.
- [ ] /create, /generate, /accounts, /publish on a phone: no
      horizontal scroll; /publish form stacks one column.
- [ ] Page titles look the same size across pages; FAQ and
      pricing cards have visible borders like the homepage.
- [ ] Dark mode: no light cards in dark chrome on any audited
      page (admin included, once signed in).
- [ ] /generate shows the "Clip it instead" link to /create.
- [ ] FAQ answer names 1280×720 and 720×720 for generated
      shorts, not just 720×1280.
- [ ] Older flows unchanged: /create, CC paste, YouTube
      journey, /signin, logged-out /admin redirect.
