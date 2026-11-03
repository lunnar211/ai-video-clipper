# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** AI Video Clipper
**Generated:** 2026-11-03 03:11:28
**Revised:** 2026-11-03, ClipForge Phase 12 — "Ink + Record" identity
(replaces the Phase 9 generic trust-blue + orange SaaS palette, which
the owner judged as looking AI vibe-coded).
**Category:** SaaS (General)

---

## Global Rules

### Color Palette — "Ink + Record" (Phase 12)

Deliberately monochrome-professional: near-black ink for brand
surfaces and text, with ONE signal-red accent (the record dot) for
calls to action. No gradients, no violet, no generic SaaS blue.
Status hues (amber warnings, red errors, green success, sky info)
are kept ONLY for status meaning, never for brand. All pairs clear
4.5:1 (checked 2026-11-03): light ink #171717 on white 17.7:1,
signal red #DC2626 on white 4.83:1, muted #525252 on paper 7.6:1;
dark paper #FAFAFA on ink #171717 17.7:1, signal #F87171 on black
7.9:1, muted #A3A3A3 on card #171717 7.0:1.

| Role | Light | Dark | CSS Variable |
|------|-------|------|--------------|
| Primary (ink) | `#171717` | `#FAFAFA` | `--color-primary` |
| On Primary | `#FFFFFF` | `#171717` | `--color-on-primary` |
| Secondary | `#404040` | `#D4D4D4` | `--color-secondary` |
| On Secondary | `#FFFFFF` | `#171717` | `--color-on-secondary` |
| Accent/CTA (record red) | `#DC2626` | `#F87171` | `--color-accent` |
| On Accent/CTA | `#FFFFFF` | `#000000` | `--color-on-accent` |
| Background (paper) | `#FAFAF9` | `#0A0A0A` | `--color-background` |
| Foreground | `#171717` | `#FAFAFA` | `--color-foreground` |
| Card | `#FFFFFF` | `#171717` | `--color-card` |
| Card Foreground | `#171717` | `#FAFAFA` | `--color-card-foreground` |
| Muted | `#F5F5F4` | `#262626` | `--color-muted` |
| Muted Foreground | `#525252` | `#A3A3A3` | `--color-muted-foreground` |
| Border | `#E5E5E5` | `#262626` | `--color-border` |
| Destructive | `#B91C1C` | `#F87171` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `#000000` | `--color-on-destructive` |
| Ring | `#171717` | `#FAFAFA` | `--color-ring` |

**Wordmark:** "AI Video Clipper" in bold ink with a small solid
record-red dot (SVG-free CSS circle, `aria-hidden`) before the text
— the product's own mark, not a platform logo. Never an emoji.

**Color Notes:** Phase 9 palette (trust blue #2563EB + orange #EA580C)
is SUPERSEDED — do not reintroduce it. Every color on a page must
come from the token table above or a status hue; raw Tailwind color
scales (`slate-*`, `violet-*`, `bg-white`) are banned outside the
video workspace (true black preview) and caption overlays.

### Typography

- **Heading Font:** Plus Jakarta Sans
- **Body Font:** Plus Jakarta Sans
- **Mood:** confident, plain, professional, product-led
- **Google Fonts:** [Plus Jakarta Sans](https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap)

**Type scale (Phase 12 — hierarchy with real sizes):**

| Role | Size / line-height | Usage |
|------|--------------------|-------|
| Display (hero) | 36px mobile, 48px desktop / 1.1, `tracking-tight` | Homepage H1 only |
| H1 (tool/content) | 30px / 1.25, `tracking-tight` | Page titles |
| H2 (section) | 24px / 1.25, `tracking-tight` | Section headings |
| H3 (card) | 20px / 1.4 | Card / step titles |
| Body | 16px / 1.6 | Main text |
| Small | 14px / 1.5 | Secondary text, form hints |
| Caption | 12px / 1.4 | Footnotes, timestamps |

Body copy inside cards uses `leading-relaxed` (1.625) — dense
paragraphs are a generic-template tell.

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding, card padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins (homepage rhythm) |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

**Rhythm rule:** homepage sections sit 48px apart (`space-y-12`);
feature grid uses 20px gaps with 24px card padding; cards always
carry a `border-border` edge, never a bare shadow on flat
background. Section cards use `p-6`, not `p-5`.

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Cards, sections |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Upload box, dropdowns |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

Shadows stay subtle: cards use `shadow-sm` only. A heavy shadow on
every card is a generic-template tell.

## Component Specs

### Buttons

```css
/* Primary Button (ink) */
.btn-primary {
  background: #171717;
  color: #FFFFFF;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-primary:active {
  opacity: 0.8;
}

.btn-primary:disabled {
  opacity: 0.5;
}

/* CTA Button (record red) */
.btn-cta {
  background: #DC2626;
  color: #FFFFFF;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-cta:hover {
  opacity: 0.9;
}

.btn-cta:active {
  opacity: 0.8;
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #171717;
  border: 1px solid #E5E5E5;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-secondary:hover {
  background: #F5F5F4;
}
```

### Cards

```css
.card {
  background: #FFFFFF;
  border: 1px solid #E5E5E5;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-sm);
  transition: border-color 200ms ease;
}

.card:hover {
  border-color: rgba(23, 23, 23, 0.4);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E5E5E5;
  border-radius: 8px;
  font-size: 16px;
  background: #FAFAF9;
  color: #171717;
  transition: border-color 200ms ease;
}

.input:focus-visible {
  outline: 2px solid #171717;
  outline-offset: 2px;
}

.input:disabled {
  opacity: 0.5;
}
```

### Tables

```css
/* Plan comparison: rows highlight on hover; no zebra striping. */
.table-row:hover {
  background: rgba(245, 245, 244, 0.6);
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Ink + Record (monochrome professional with one signal accent)

**Keywords:** Editorial, confident, restrained, product-led, real tool
first, no decoration that is not the product

**Best For:** Creator tools, video products, professional SaaS where
the product interface is the proof

**Key Effects:** Thin token borders, subtle shadows, one accent color
used sparingly (CTAs, record dot, selected range) — never large
gradient washes or frosted-glass panels

### Page Pattern

**Pattern Name:** Hero + Features + CTA

- **Conversion Strategy:** Deep CTA placement. For CTA label text, verify at least 4.5:1 against the button fill; use 7:1 only when the product explicitly targets AAA normal-text contrast. Keep focus and component boundaries independently visible. Disable hero parallax under reduced motion and render its static final state.
- **CTA Placement:** Hero (sticky) + Bottom
- **Section Order:** Hero with headline/image > Value prop > Key features (3-5) > CTA section > Footer

---

## Anti-Patterns (Do NOT Use)

- ❌ Excessive animation
- ❌ Dark mode by default
- ❌ Generic gradients (oversized hero gradient washes)
- ❌ Generic SaaS blue + orange palette (superseded Phase 9 look)
- ❌ Raw Tailwind color scales in themed UI (`slate-*`, `violet-*`, `bg-white`) — use tokens
- ❌ Borderless inputs (a `border` with no color renders as currentColor — always pair with `border-border`)
- ❌ Stale copy: any claim the code no longer supports (link-box wording after the CC paste feature, 30–60s after the 15–60s windows) — re-verify every claim on every copy touch

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
- [ ] Phase 12 identity: no gradients, no violet, no slate/gray color
      scales in themed UI — tokens only
- [ ] Every marketing claim re-verified against the code on any copy
      touch (link scope, moment windows, limits, language count)
