# ClipForge Phase 7 — UX / SEO / perf + hardening

Final phase of the clipper build. Marketing homepage, onboarding, dark
mode, WCAG AA on touched pages, chunked uploads, CDN notes, cost
guards, OWASP ASVS pass, the repo's first Playwright suite, CI, and a
per-minute cost model.

## What changed

### 1. ScaleReach-style marketing homepage (owner's top ask)

`app/page.tsx` is now a marketing page following the reference site's
STRUCTURE — hero → demo → value strip → feature grid → 3 steps →
plans comparison → FAQ — with 100% original copy from
`lib/marketing.ts`. Nothing was copied: no borrowed headlines, images,
branding, prices, or unverified claims.

- Hero: one-line promise + an upload box. A file chosen in the hero is
  handed to the tool on `/create` in module memory
  (`lib/upload-pending.ts`, consumed exactly once) — never uploaded,
  never persisted. A hard refresh shows the tool's normal empty state.
- Demo: illustrated caption-style previews (CSS phone frames). They
  are labelled as illustrations — real demo videos from the owner will
  replace them. No fake creator clips are shown.
- Plans comparison: this site's own Free / Pro / Agency plans, limits
  read from the billing config (`getPlans()`), prices marked "Coming
  soon". No competitor numbers appear, because no Vizard / Opus Clip
  figure was firsthand-verified during this build (see gaps).
- FAQ: five questions with a matching FAQPage JSON-LD block (visible
  text and structured data come from the same source, so they cannot
  drift apart). Full list stays on `/faq`.
- SEO: homepage metadata + OG tags, `/create` added to the sitemap.

### Structure alignment (public homepage read, owner follow-up)

The owner asked to "reverse and make it" like the reference site. That
was translated into its legitimate form: the reference site's PUBLIC
homepage was read with a normal page read (section order, what each
section does, the flow from landing to upload) and our homepage's
structure and flow were aligned to it. No REA or binary tooling was
used — a public marketing page is ordinary web analysis — and nothing
was copied: no text, images, branding, code, prices, or claims.

| Reference section (function) | Our original section |
| --- | --- |
| Hero with an input + reassurance line | Hero with an upload box + reassurance + rights note + output-platform strip |
| Demo showcase | Illustrated caption-style previews, labelled as illustrations (no fake clips) |
| One-video-to-many-clips value strip | Same function, own wording |
| Feature grid (detection, score, captions, export, scheduler, MCP, thumbnails, share) | 10-card grid: same functions, plus face crop, languages, and search; export + MCP cards added by this alignment |
| 3-step process with proof points + CTA | 3 steps with proof points + a CTA link added after the steps |
| Competitor comparison with prices | Own-plans comparison, prices "coming soon" (deliberate divergence: no competitor figure was firsthand-verified) |
| FAQ + contact note | 5 FAQs + JSON-LD + link to /faq + contact line |

Flow alignment: landing → hero input → tool in one step (their flow
goes landing → input → app; ours goes landing → hero upload →
`/create`), with conversion links after the steps and at the page
bottom. The link-input flow itself is NOT adopted: our hero takes a
direct upload only, per the hard no-downloader rule.

### 2. Tool moved to /create

The clipper tool (unchanged behavior) now lives on `/create`, with a
first-run guide above it. The nav has a "Create" link; every homepage
call to action lands there in one click.

### 3. Onboarding

`components/OnboardingChecklist.tsx`: a dismissible four-step guide
above the tool, persisted in localStorage. It guides only — it never
marks steps done automatically, because the tool keeps no progress
state for signed-out visitors.

### 4. Dark mode

- `lib/theme.ts` (allowlisted values only) + `components/ThemeToggle.tsx`
  + a pre-paint inline script in the layout, so the stored theme never
  flashes the wrong mode.
- Dark styles cover the site chrome, the marketing homepage, and the
  tool page shell. The video workspace itself stays light on purpose:
  accurate color preview while editing.
- Older content pages (FAQ, Pricing, etc.) still render light cards
  inside the dark chrome — a follow-up pass, not hidden (see gaps).

### 5. WCAG AA (pages touched)

- One `h1` per page, logical heading order, labelled sections
  (`aria-labelledby`), labelled form controls, visible focus via
  default browser + button styles, table headers with `scope`,
  decorative demo frames hidden from assistive tech (`aria-hidden`).
- Color pairs use the existing slate/violet palette at body-text
  sizes; no text is conveyed by color alone.

### 6. Chunked uploads

The Phase 1 multipart API (`/api/uploads/initiate` + `/complete`,
R2 presigned URLs, 8 MB chunks) had no browser caller until now.
`lib/storage/chunked-upload.ts` is that caller: part-range math,
initiate → PUT each part straight to R2 (never through Vercel
functions) → complete, with one retry per part, progress callbacks,
and honest errors (no partial success reported as done). Covered by
12 unit tests against mocked fetch; no live R2 test exists yet because
R2 is not configured (see gaps). The publish staging flow is the
documented integration point for a later slice — this phase wires no
new upload button into the tool, to avoid touching Phase 3 behavior.

### 7. CDN + cost guards (notes, no new infrastructure)

- Delivery: Vercel Edge Network serves pages and static assets; R2's
  public host serves staged-media GETs; browser-local rendering needs
  no CDN at all.
- Guards already in place (verified, not re-invented): 5 requests /
  minute per IP on server routes, 500 MB / 10-minute browser caps,
  25 MB transcription-audio cap, 3 free renders / day in the browser,
  the minute ledger for plan metering, and honest 503s wherever a key
  or config is missing instead of a degraded silent path.

### 8. OWASP ASVS pass (new / changed code only)

| Area | Result |
| --- | --- |
| V1 Architecture | New code reuses existing validated seams; no new trust boundary. |
| V2 Authentication | Untouched. Admin gate + sign-in verified by Playwright, not changed. |
| V3 Session | Untouched. localStorage holds only theme + onboarding flag (no PII, no tokens). |
| V4 Access control | Untouched. Logged-out `/admin` still redirects to `/signin` (e2e-pinned). |
| V5 Input validation | Theme value allowlisted; onboarding flag is a fixed marker; chunked-upload validates MIME, size, part counts, server chunk size, part-URL count, and ETags. Real file validation still happens once, in the tool (size / type / header sniff). |
| V7 Errors & logging | Chunked-upload surfaces server error strings (already sanitized server-side). Filenames are never logged. |
| V8 Data protection | Video still never leaves the browser for clipping. Chunked upload sends a file to R2 only when R2 is configured and a caller invokes it (no caller wired yet). |
| V9 Communications | Uploads go to presigned HTTPS R2 URLs. No new endpoints. |
| V10 Malicious code | Only new dependency is `@playwright/test` (dev-only, never shipped). |
| V14 Configuration | No env changes, no secrets in code, tests, or docs. |

### 9. Playwright + CI (first e2e suite in this repo)

- `playwright.config.ts` + `e2e/home.spec.ts` (sections, CTA,
  hero→tool file handoff with a minimal ftyp-header fixture, the
  no-downloader statement), `e2e/auth.spec.ts` (admin hard gate,
  sign-in options, no public sign-up), `e2e/theme.spec.ts` (toggle +
  persistence). Signed-out states only — no test accounts, no secrets,
  no real AI calls.
- `ci/github-workflow.yml`: install → unit tests → tsc → lint →
  build → Playwright (Chromium) on push + pull requests. It ships
  under `ci/` instead of `.github/workflows/` because the git token
  lacks the `workflow` scope and GitHub refuses pushes that create
  workflow files through it. To activate: move it to
  `.github/workflows/ci.yml` via the GitHub web editor (no content
  change needed).
- Run locally: `npm run build && npm run test:e2e`
  (a dev server already on :3000 is reused).

### 10. Cost model (formula, not invented totals)

Provider rates change, so this doc gives the formula and where each
rate lives — never a dollar total from memory.

Per source minute, when AI is connected:

- transcription: audio minutes × Groq Whisper rate (provider dashboard)
- highlights: transcript tokens × text-model rate (provider dashboard)
- voiceover (optional): characters × ElevenLabs rate
- translation (optional): segments × text-model rate, chunked
  (max 40 segments / 4000 chars per call, failed chunks keep original)

Always zero: rendering (on-device), manual clipping, captions typed
by hand, SRT/VTT export.

Fixed / storage costs: R2 (staged media under a 24-hour lifecycle
rule, per GB-month + requests), Vercel hosting (Hobby limits; build
minutes). Exposure is bounded by the guards in §7: per-IP rate
limits, browser quotas, and the plan minute ledger.

## Corrections found during this phase

- Translation languages: prior docs said 28. Firsthand count of
  `TRANSLATION_LANGUAGES` is **29**. Marketing copy derives the number
  from the list, so it cannot drift again.
- Share + sitemap fallbacks pointed at the taken
  `ai-video-clipper.vercel.app` domain. Both now fall back to the real
  team-scoped URL (production still prefers `NEXT_PUBLIC_SITE_URL`).
- `next start` crashed on a pre-existing route conflict (Phase 3/4):
  `/api/accounts/[id]/…` vs `/api/accounts/[platform]/…` used two
  slug names at the same path level, which Next.js forbids at server
  startup (the production build passed, so Vercel kept serving). Fix:
  both handlers now live under `[platform]` with the URL unchanged —
  the segment value for disconnect/refresh is still the account row
  id, read as `platform: id`. This unblocks local `next start` and
  therefore the Playwright suite; no public URL changed.

## Honest gaps (deliberately left out)

- Competitor comparison (vs Vizard / Opus Clip) is NOT on the
  homepage: no competitor figure was firsthand-verified in this build.
  A comparison page with sourced rows is a later slice.
- Demo frames are illustrations, not the owner's real videos.
- The chunked-upload client has no live R2 test and no UI caller yet;
  R2 is unconfigured, so any real upload still answers 503 honestly.
- Marketing site is English only (the plan's ES / HI / NE versions
  are a later slice).
- Dark mode does not yet restyle older content pages' cards.
- Diarization is still interface-only, server render is still job API
  + worker skeleton flagged off, silence removal still splits into
  parts rather than seamless re-timing — none of these are claimed
  as live anywhere in the new copy.

## Manual QA checklist

- [ ] Homepage renders all sections: hero, demo, value strip,
  features, 3 steps, plans, FAQ, final CTA.
- [ ] Hero upload with a real video lands on /create with the file
  name shown; hero "Open the clipper" link lands on /create empty.
- [ ] Dark toggle flips the chrome + homepage and survives reload;
  light toggle restores.
- [ ] Onboarding guide shows on first /create visit, dismiss persists.
- [ ] Logged-out /admin redirects to /signin with no admin UI.
- [ ] /signin shows email + Google options and the no-sign-up note.
- [ ] Sitemap includes /create; share links use the real site domain.
- [ ] Full suite green: vitest, tsc, eslint (changed files), build,
  Playwright.
- [ ] Owner live checks after deploy: sign-in flow, end-to-end login
  staying on this site's domain, R2 upload once R2 is configured.
