# ClipForge Phase 15 — "AI clean" render option

Owner pipeline order: "AI will remove copyright and generate viral
clips and render video and we can get export." This phase covers
the first step honestly: clips leave the render with the risky
audio gone when the user asks for that — and the rights facts
visible before export. It does NOT remove copyright, and no copy
here promises otherwise. AI editing does not turn another person's
video into yours.

## Audit first: what audio/music machinery actually exists

Audited before building (this section is the audit the brief
required):

- **Render audio (lib/browser/render.ts):** the browser renderer
  always mixed the video's own audio (MediaElementSource into a
  MediaStreamDestination) plus optional ElevenLabs voiceover plus
  an optional user track at low volume (gain 0.15). There was no
  mute option and no replace option — music always sat ON TOP of
  the original audio, never instead of it.
- **Music catalogue (lib/music/tracks.ts):** four royalty-free
  SOURCES are listed (YouTube Audio Library, Pixabay Music, FreePD,
  Bensound) as places to get tracks — but the site ships NO audio
  files and NO built-in tracks. `LICENSED_TRACKS` is empty by
  design ("Empty until he adds his own"). Nothing was invented,
  downloaded, or synthesized to fill it.
- **User licensed tracks (components/MusicPicker.tsx):** the user
  can upload a track they already hold a licence for; the file
  stays in the browser and mixes into renders. This is the ONLY
  real replace source in the build, and Phase 15 gates "replace"
  on it.
- **Music recognition (lib/music/audd.ts + /api/clips/music):**
  AudD adapter over a ≤15 s sample. Without `AUDD_API_TOKEN` the
  route answers 503 honestly — detection is optional, never faked.
  Per-clip states in the tool: checking / clear (no match) /
  detected (artist + title) / unavailable (no key).
- **Fingerprint (lib/rights/fingerprint.ts + /api/rights/scan,
  Phase 2):** AudD then ACRCloud, else `NOT_SCANNED`. The scan
  route always answers a verdict object; without a provider the
  verdict is `not_scanned`, never clean. ACRCloud was never
  live-tested (no account/key).

## What was built

### 1. Clean-audio toggle (render/export step)

A "Clean audio" section on /create, always visible, applying to
every render from now on (default keeps today's behaviour, so
nothing changes unless the user opts in):

- **Keep original audio** (default) — today's mix, unchanged.
- **Mute original audio** — the video's own audio is not connected
  to the mix at all. A muted render with no voiceover and no track
  carries no audio track. Voiceover narration, if enabled, still
  plays (it is new narration, not the original track).
- **Replace original audio with my licensed track** — offered ONLY
  while a licensed track is picked in the music picker. The
  original is left out and the track plays at full volume (gain
  1.0) as the soundtrack, with its credit in the export. Without
  a picked track the choice is hidden, not faked — and dropping
  the track while "replaced" is chosen falls back to "muted".
  The site still ships no tracks: replace is reachable only via
  the user's own licensed upload.

Implementation: pure plan in `lib/browser/audio-plan.ts`
(`resolveAudioPlan`, `availableTreatments`) applied by
`lib/browser/render.ts` (`audioTreatment` option; the effective
treatment is reported back in `RenderResult` and recorded on each
rendered clip). Voiceover notices and the voiceover-failed
download note were made treatment-neutral — the old wording
("rendering with the original audio only") would have been false
under mute/replace.

### 2. Pre-export rights panel

`components/RightsPanel.tsx`, shown in the same section, stating
exactly what the tool knows before export:

- **Source:** verified CC licence (licence + author + source URL),
  verified own-YouTube ownership (channel + video), the user's own
  declaration, or — with no record at all — "unverified".
- **Music check:** per-outcome summary lines. A check that never
  ran, or a service that is not connected, reads as "not scanned"
  — never as clear. A no-match result is worded as "no known
  recorded music found" plus "a check is not proof of clearance".
  A match names artist + title with the existing muted/blocked/
  struck warning.
- **Audio treatment:** the current choice in plain words, plus
  the treatments actually recorded on rendered clips so far.
- **Attribution shipping in the export:** computed exactly the
  way the ZIP computes it (track credit + CC credit), or "None
  yet" when no credit applies.
- **Disclaimer, verbatim in spirit:** "This lowers audio risk, but
  it is not a legal guarantee and does not make another person's
  video yours. AI editing does not remove copyright — safety comes
  from the source video."

### 3. Exports unchanged

MP4/ZIP/SRT/VTT exports work as before. The ZIP attribution
already carried the track credit + CC credit; replace mode needs
no ZIP change because the picked track's credit flows through the
same path. No new export format.

### 4. Copy ban, pinned by test

The phrases "copyright removed", "copyright-free", and "no
copyright strikes" (and equivalents) are banned from all new UI
copy; `tests/phase15-clean-audio.test.ts` pins the ban on the
four files this phase writes. The ban is scoped to new copy on
purpose: older pages that merely discuss the ban (the
acceptable-use denial) are out of scope and untouched.

## Verification

- vitest: **408/408 across 47 files** (385 pre-existing + 23 new
  in `tests/phase15-clean-audio.test.ts`: audio plan incl.
  replaced-without-track → muted, treatment availability,
  source-licence lines, check summaries incl. never-"clean"
  wording, attribution joining, copy ban + standing sentence).
- tsc: **0 errors**. eslint: **0 on changed files**.
- `next build`: **0**.
- Playwright: **37/37 full suite** (33 pre-existing + 4 new in
  `e2e/phase15.spec.ts`: toggle + panel presence, replace hidden
  without a track, mute updates the panel, banned phrases absent
  from /create). One real find during the run: the always-visible
  panel legitimately repeats the verified channel name, which
  broke a Phase 14 spec's bare-name assertion (strict-mode double
  match) — the spec now asserts the banner sentence instead; the
  banner behaviour itself is unchanged.
- Downloader-term grep on changed files: zero. Banned-phrase grep
  on new UI copy: zero (the test and spec files reference the
  phrases only to assert their absence).
- Git: tree clean after commit; HEAD verified against `ls-remote`
  before reporting (see parent report). Stash `@{0}` untouched.
- No Supabase dashboard changes, no SQL, no Vercel env changes,
  no deploy by the builder.

## Honest gaps (not hidden)

- **Fingerprint providers still need the owner's keys.** Without
  `AUDD_API_TOKEN` (and/or ACRCloud keys) every music check reads
  "not scanned" — honest, but no detection happens. The panel
  says so instead of implying a scan ran.
- **The site ships no royalty-free tracks.** Replace works only
  with a track the user uploads under their own licence. If the
  owner wants a built-in catalogue, he must add licensed tracks
  to `LICENSED_TRACKS` with their licence text — that is his
  content decision, not something to synthesize.
- **A true end-to-end muted render (output blob carrying no audio
  track) is not covered by an automated browser test** — it needs
  a real video file, which this environment does not have. The
  mix logic is pinned by the pure-function tests; the manual QA
  item below covers the real render.
- **Mute/replace reduce audio risk only.** They do not clear the
  visuals, the underlying video's rights, or any other claim, and
  the panel says so.
- Phase 16 was NOT started here — it waits on this phase landing,
  per the no-parallel-clipper-work rule.

## QA checklist (for the parent's live probe, after deploy)

- [ ] /create shows the "Clean audio" section and the rights
      panel without signing in or uploading anything.
- [ ] Panel shows "Source not recorded — unverified" and
      "Not scanned — no music check has run" in that state.
- [ ] Mute radio updates the panel to the muted wording; the
      Replace radio is absent until a licensed track is picked.
- [ ] No banned promise phrase appears anywhere on /create.
- [ ] Manual, needs a real video: render one clip muted and
      confirm the output has no original audio; render one clip
      with a picked licensed track replaced and confirm the track
      plays and its credit ships in the ZIP.
- [ ] Sign-in flow unchanged; logged-out `/admin` still redirects
      to `/signin` with no admin UI.
