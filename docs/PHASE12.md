# ClipForge Phase 12 — Professional identity pass ("Ink + Record")

Owner judgment: the site still looked "AI vibe-coded" after Phase 9.
Phase 9's token polish was real, but it kept a generic SaaS look —
trust-blue + orange, violet leftovers in admin and editor components,
slate text that broke in dark mode, and copy that had gone stale
after Phase 11. This phase replaces the identity, finishes the token
migration Phase 9 left open, and corrects the copy — with no behavior
change and no copied assets.

## Old vs new identity

| | Phase 9 (superseded) | Phase 12 ("Ink + Record") |
|---|---|---|
| Brand surfaces | Trust blue #2563EB | Near-black ink #171717 (light) / paper #FAFAFA (dark) |
| CTAs | Orange #EA580C, black text | Signal red #DC2626 (light) / #F87171 (dark), white/black text |
| Background | Slate #F8FAFC / #020617 | Warm paper #FAFAF9 / ink #0A0A0A |
| Wordmark | Plain text link | Bold ink text + solid record-red dot (CSS circle, aria-hidden) |
| Hero | 36px heading | 36px mobile / 48px desktop, tracking-tight, leading-tight |
| Cards | Shadow only, p-5 | Border edge + shadow-sm, p-6, restrained hover border |
| Buttons | Hover opacity only | Hover + active opacity + disabled opacity |
| Leftover hues | Violet buttons/links/tabs, slate text | None in themed UI (see below) |

Contrast, checked 2026-11-03, all ≥ 4.5:1: light ink on white
17.7:1, signal red on white 4.83:1, muted #525252 on paper 7.6:1;
dark paper on ink 17.7:1, signal #F87171 on black 7.9:1, muted
#A3A3A3 on card #171717 7.0:1. The reference site was used as a
quality bar only — no text, image, branding, code, price, or claim
was copied from it. The identity is original: monochrome ink plus
the record dot, a mark tied to this product (recording), not to any
other site.

## What changed per page

- **Site chrome (`app/layout.tsx`):** record-dot wordmark; footer
  rule reworded to name the refused platforms and the CC exception
  (the old "from any platform" line went stale in Phase 11).
- **Homepage (`app/page.tsx`):** new type scale (hero 4xl→5xl on
  desktop, tracking-tight section heads, relaxed card body);
  feature/steps/FAQ cards gain border edges + p-6; plans table rows
  gain a hover tint; CTAs gain active states. Headings renamed for
  a professional register: "See it work — for real" → "See it
  work", "Everything the clipper does, in one place" → "What the
  clipper does", "Questions, answered honestly" → "Common
  questions". The "Real demo clips from the site owner will appear
  here" paragraph was removed — the section stands on the real tool
  alone, and the demo-asset slot stays documented in
  `public/demo/README.md`.
- **Tool shell (`components/ClipperTool.tsx`):** rights banner
  reworded (no "link box" claim — the tool itself has a paste
  panel); declaration/music notices gain dark-mode variants;
  manual/prompt inputs gain token borders + backgrounds; primary
  actions gain active states.
- **Tool components:** `RightsConsent` violet box → token border +
  muted surface; `ClipEditor` violet section → muted surface and
  the clip-range bar violet → record-red accent (the ink trim
  handles are unchanged); `MetadataCard` violet active tab → ink
  primary tab, and its slate text → muted text.
- **All older pages (Phase 9 gap, now closed):** 43 files migrated
  — faq, how-it-works, pricing, contact, privacy, terms, copyright,
  cookies, acceptable-use, share, report, signin, accounts,
  analytics, publish, billing, and every admin page. slate/gray
  text → foreground/muted-foreground tokens, `bg-white` cards →
  `bg-card`, violet buttons/links/tabs → primary tokens, borderless
  `border` classes → `border-border` (a bare `border` renders as
  currentColor in Tailwind v4 — an inconsistency, not a style),
  amber/green action buttons with failing white text → black text
  (amber-600 + white was 3.36:1; black is 6.26:1).
- **Kept deliberately, not missed:** status hues (amber warnings,
  red errors, green success, sky info) with dark variants — they
  carry meaning, not brand. True-black video surfaces and the
  black/70 caption overlay stay black for color accuracy. The
  yellow-300 active-word caption highlight stays (highlight on a
  black overlay, not brand).

## Copy changes, with claim verification

Every changed claim was re-verified against the code; nothing new
was invented:

| Change | Code evidence |
|---|---|
| Hero rights note + homepage FAQ + FAQ page + tool banner + footer + terms: "no link box" → CC-verified paste described, YouTube/TikTok/Instagram refused | Phase 11 `CcPasteImport` + `/api/imports/cc-verify` (Commons + Archive only, licence checked before load) |
| "30–60 second moments" → "15–60 second moments" on /create + how-it-works + the highlights comment | `lib/ai/highlights.ts` defaults `minLen 15, maxLen 60`; search windows match |
| Value strip: "post them where your audience already watches" → "post them as vertical clips" | Plain wording; no claim change |
| Hero sub tightened (same claims, fewer words) | Unchanged facts: upload, transcribe, moments, 9:16, browser |

The marketing honesty test was updated to match the new reality:
"paste a link" is banned UNLESS the same text states the CC scope
(Wikimedia Commons + Internet Archive + "verified") — so the phrase
can never again read as paste-any-link.

## Legacy imports branch — fixed (Phase 11 gap, closed)

Decision: ROUTE THROUGH VERIFICATION (not removal — the route shape
stays compatible). `POST /api/imports` with `source: "cc-licensed"`
now calls the same `verifyCcUrl` as `/api/imports/cc-verify` and
builds the attribution from the VERIFIED facts only. The
caller-declared licence/author/title are still accepted in the
request but IGNORED (schema fields now optional). A refused link
(wrong host, non-free or unknown licence) is refused here too, with
the same reason codes — it can never again answer "validated" for
an unverified licence. Consequence, stated plainly: Pexels/Pixabay
links that the old branch "validated" on a host check alone now get
`HOST_NOT_ALLOWED`, because no route verifies their licences — that
is the honest outcome, not a regression. `CC_ALLOWED_HOSTS` (which
listed Pexels/Pixabay) was removed; the Phase 1 host test now pins
`CC_VERIFY_HOSTS` instead.

## Real product UI showcase

No new visuals were added, on purpose: the homepage's "See it
work" section already IS the real product (the actual upload box
opening the actual clipper), and Phase 10 removed the last
illustrations. What Phase 12 adds is the product's own interface
presented consistently — the tool shell, caption editor, and clip
list now share the same identity as the marketing pages, instead of
looking like a different product. No screenshots, no mockups, no
stock imagery presented as output anywhere.

## Verification

- vitest: 363/363 across 44 files (354 pre-existing + 9 new: 8
  Phase 12 identity pins + 1 marketing scope pin; Phase 9 palette
  pins updated to the new values with a supersession note, not
  silently rewritten).
- tsc: 0 errors. eslint: 0 on changed files. `next build`: 0.
- Playwright: 22/22 (4 new `e2e/phase12.spec.ts`: no gradient
  classes on the homepage, record-dot wordmark, renamed headings
  present + old ones absent, /create loads with the paste panel;
  plus home, phase10, phase11, polish, theme, auth specs as
  regressions — one home spec updated to the corrected
  no-downloader wording).
- Downloader-term grep on changed files: only legitimate hits
  (acceptable-use prohibition, own-clip downloads, CSV/JSON
  exports). No violet/indigo/sky-gradient classes remain in themed
  UI (sky stays only as an info-notice hue with dark variants).
- No Supabase dashboard changes, no SQL, no Vercel env changes, no
  deploy by the builder. Old Phase 4 stash untouched.

## Honest gaps (not in this phase's scope)

- `CONTACT_EMAIL_PLACEHOLDER` still needs the owner's real mailbox
  (pre-existing; nothing invented).
- Plan prices still "coming soon" (owner decision, unchanged).
- The worker still does not call `/api/render/callback` (Phase 8
  gap); publish post rows still carry caller-supplied userId
  (follow-up slice).
- The demo-clips slot (`public/demo/`) is still empty until the
  owner sends a video.
- Live proof after the parent deploys is still owed (owner checks
  in the QA list below).

## QA checklist (run after deploy)

- [ ] Homepage shows ink wordmark + red record dot, red CTAs, no
      blue/orange, no gradients, no violet anywhere (light + dark).
- [ ] Headings read "See it work", "What the clipper does",
      "Common questions" (no "for real" / "answered honestly").
- [ ] Dark mode: admin pages, FAQ, pricing, sign-in all render
      readable text (no dark-on-dark, no light cards in dark chrome).
- [ ] Tool banner no longer claims "no link box"; paste panel and
      CC verification still work as in Phase 11.
- [ ] Legacy route: a caller-declared CC-BY claim on a non-free
      link is refused, not "validated" (API-only check).
- [ ] Keyboard tab shows a visible focus outline; reduced motion
      still collapses transitions.
- [ ] Sign-in flow unchanged; logged-out `/admin` still redirects
      to `/signin` with no admin UI.
