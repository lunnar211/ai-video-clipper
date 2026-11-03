# ClipForge Phase 9 — UI/UX polish (ui-ux-pro-max)

Visual polish only, at the owner's explicit request to use the
ui-ux-pro-max skill. Structure, copy, claims, and prices are unchanged
from Phase 7: the homepage keeps its hero → demo → value strip →
feature grid → 3 steps → plans comparison → FAQ structure, plan prices
stay "coming soon", and no competitor numbers appear. Nothing was
copied from any reference site — the design system below is applied
with original colors, type, and layout, not a clone.

## Skill searches run (all returned results; nothing was empty)

Design system (persisted, not overwritten — no Master existed before):
`python3 ~/workspace/custom-skills/ui-ux-pro-max/scripts/search.py
"AI video clipper SaaS tool modern" --design-system -p "AI Video
Clipper" --persist --output-dir ~/workspace/ai-video-clipper`
→ persisted at `design-system/ai-video-clipper/MASTER.md` (committed
with this phase; small text file, no deploy-size concern).

Result fit for this product (SaaS tool, modern, professional):
- Pattern: Hero + Features + CTA (hero + bottom CTA placement —
  matches the existing structure, so no restructure was needed).
- Style: Glassmorphism (frosted surfaces, subtle borders, Z-depth).
  Its "avoid dark mode by default" note was NOT followed: dark mode
  already shipped in Phase 7 behind a toggle, so Phase 9 keeps it and
  fixes its consistency instead of removing a shipped feature.
- Palette (SaaS General, trust blue + orange CTA): primary #2563EB,
  accent/CTA #EA580C (database-adjusted from #F97316 for contrast),
  background #F8FAFC, foreground #1E293B, card #FFFFFF, muted
  #E9EFF8 / #475569, border #E2E8F0, destructive #DC2626, ring
  #2563EB. Typography: Plus Jakarta Sans for headings and body
  ("Friendly SaaS" pairing, also the design-system result).
- Supplements, all with matches: landing structure (hero + value
  prop + social proof before CTA — applied as qualitative proof
  only: no testimonials or counts exist to show, and none were
  invented); SaaS color palette (same SaaS General palette, confirming
  the Master); font pairing (Plus Jakarta Sans, confirming the
  Master); mobile-first responsive (no horizontal scroll, mobile
  styles first); dark-mode contrast (4.5:1 minimum, no gray-on-gray);
  form feedback (labels, inline errors, loading/success states);
  Next.js stack guidance (App Router, file-based routing — already
  the repo's shape, so no routing change).

## Design system applied (tokens, not raw hex)

`app/globals.css` now defines the palette as Tailwind v4
`@theme inline` tokens mapped to CSS variables, with a `.dark` block
redefining each variable. One class (e.g. `bg-card`) therefore
renders correctly in both themes, which structurally prevents the
Phase 7 gap (light cards inside dark chrome) on every migrated page.
Token pairs keep text at 4.5:1 or better: primary blue with white
text in light mode and near-black text on the lighter dark-mode blue;
accent orange with black text in both modes.

- Font: Plus Jakarta Sans via `next/font/google` (no render-blocking
  webfont request, no font-swap layout shift), wired as `--font-sans`.
- Focus: one global `:focus-visible` outline rule (2px ring color,
  2px offset) instead of per-element rings.
- Reduced motion: a global media query collapses all transitions and
  animations to their final state.
- Spacing rhythm kept at the existing 48px section rhythm (matches
  the Master's section tier); Tailwind's default scale already
  matches the Master's 4/8/16/24/32/48/64 tokens.

## What changed per page

- Site chrome (`app/layout.tsx`, `ThemeToggle`, `AuthButtons`,
  `AdminNavLink`): header/footer use card + border tokens; logo uses
  primary; nav and footer links are 44px+ touch targets
  (`min-h-[44px]`, inline-flex). Theme toggle drops the emoji sun/moon
  for inline SVG icons (one stroke family, 2px, decorative
  `aria-hidden`, visible Light/Dark text kept) and uses token
  surfaces. Auth buttons use primary (Google) and card-outline
  (email) treatments at 44px. No auth behavior changed: OAuth still
  passes this site's own origin + `/auth/callback`; the admin link
  still renders only with a session.
- Homepage (`app/page.tsx`): full token migration (violet → primary
  for brand/value strip, accent orange + black text for both CTAs,
  slate text/surfaces → foreground / muted-foreground / card /
  border). CTAs are 44px+, `cursor-pointer`, with 150–300ms color
  transitions. Demo frames keep their intentional dark video look
  (they are `aria-hidden` illustrations). Copy, section order, and
  claims unchanged.
- Hero upload box (`HeroUploadBox`): dashed border and drag state use
  the primary token; link uses primary at 44px. Label association
  and drag feedback unchanged.
- Onboarding checklist (`OnboardingChecklist`): primary-tint card
  (adapts to dark), token text, 44px dismiss button. Dismissal
  persistence unchanged.
- Create page (`app/create/page.tsx`): token migration for heading,
  intro, and the "honest limits" card. Copy unchanged.
- Tool shell (`ClipperTool`, shell surfaces only): section cards use
  the card token (this fixes the tool's light-cards-in-dark-chrome
  gap); primary actions (Transcribe, Render) use primary; neutral
  actions use a card-outline secondary treatment; all buttons are
  44px+ with pointer cursors and transitions; links use primary;
  hint/secondary text uses muted-foreground; warning/error/info
  boxes keep their semantic hues and gain dark-mode variants; the
  file input is now `w-full max-w-full` (see the bug below). The
  video preview stays black and the clip editor workspace stays
  light, both by design for color accuracy — they were not reskinned.

## Real bug fixed (found by the new e2e spec)

`/create` scrolled horizontally at 375px: the file input had no width
constraint, so its intrinsic ~374px width overflowed the padded
container by 41px. Fixed with `w-full max-w-full` on that input.
No behavior change (same file picker, same validation in the tool).

## Verification

- vitest: 326/326 across 41 files (320 pre-existing + 6 new pins in
  `tests/phase9-polish.test.ts`: Master exists with palette + font;
  token CSS with dark values, focus-visible, reduced motion; toggle
  has SVG and no emoji; homepage and tool shell use tokens, not
  violet; layout loads the font and 44px targets).
- tsc: 0 errors. eslint: 0 on changed files. `next build`: 0.
- Playwright: 10/10 (3 new `e2e/polish.spec.ts`: no horizontal
  scroll at 375px on `/` and `/create`, hero CTA ≥ 44px tall, toggle
  text is "Dark"/"Light" with no emoji; plus the existing home,
  theme, and auth specs as regressions).
- Downloader-term grep on changed files: zero.
- No Supabase dashboard changes, no SQL, no Vercel env changes, no
  deploy by the builder. Old Phase 4 stash untouched.

## Honest gaps (not in this phase's scope)

- Older content pages (pricing, FAQ, how-it-works, publish,
  accounts, analytics, admin, billing) were NOT reskinned; they keep
  their Phase 1–8 classes and may still show light cards inside dark
  chrome. A follow-up pass can migrate them with the same token map.
- Demo frames are still illustrations, not owner videos (unchanged
  from Phase 7, still labelled as illustrations).
- The skill's glassmorphism effects (backdrop blur, light
  reflection) were applied lightly (tinted surfaces, subtle borders)
  rather than as full frosted-glass panels, to keep text contrast
  above 4.5:1 on both themes.
- Dark-mode token values are derived (not database-returned): the
  database gave light values only, so dark values were chosen to
  preserve the same contrast pairs. They are pinned by the token
  test, not by a database match.
- Live proof after the parent deploys is still owed (owner checks in
  the QA list below).

## QA checklist (run after deploy)

- [ ] Homepage renders with blue brand + orange CTAs in light mode
      and the same hierarchy in dark mode (toggle, reload persists).
- [ ] No horizontal scroll on `/` or `/create` at 375px width.
- [ ] Hero CTA and header/footer links are comfortably tappable.
- [ ] Keyboard tab shows a visible focus outline on links/buttons.
- [ ] With reduced motion on, hovers/transitions do not animate.
- [ ] Sign-in flow unchanged; logged-out `/admin` still redirects
      to `/signin` with no admin UI.
- [ ] Tool still uploads, transcribes (with keys), and renders; the
      video preview still shows true colors.
