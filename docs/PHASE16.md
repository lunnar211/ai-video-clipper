# ClipForge Phase 16 — One smooth own-YouTube journey (legal version)

Owner order, after "make it same which": the ScaleReach-style
journey — paste a link, AI clips, clean render, export — as ONE
flow, LEGAL version only. The previous phases built every step;
this phase joins them, because the owner experienced the joined
steps as "paste link fails": verification ended in a text note,
and the journey broke apart after it.

## Audit first: walking the whole journey in code

Walked: `HeroUploadBox` hero paste → `/create#your-youtube-video`
→ `YoutubeOwnedImport` verify → verified banner → Studio-download
step → upload box → project source record → AI moments →
clean-audio render → export + rights panel.

### Friction 1 — the hero paste drops the link (the big one)

`HeroUploadBox.handOffLink` pushes `/create#your-youtube-video`
for a YouTube link but carries nothing: the tool's own paste box
arrives empty and the user must re-paste. The CC path does not
have this problem (`setPendingCcUrl` + auto-verify). The YouTube
path was the only handoff that lost its payload — and it is the
path the owner actually used, so the journey felt broken at the
first step even though nothing errored.

### Friction 2 — page order fights the journey

On /create the order is: upload box, CC paste, YouTube section,
Clean audio + rights panel. The verified banner says "upload that
file above" — the user scrolls back up, uploads, and then nothing
in the journey section confirms anything: the verified record
survives (see Friction 3) but the only place it surfaces is the
rights panel two sections below, which the user may never scroll
to. Verification, upload, and proof of the record live in three
different places.

### Friction 3 — the record survives, but the attach is invisible

Checked every path that touches `ytImport` in `ClipperTool`:
- Direct upload (input + drag-drop): `setCcImport(null)` only —
  `ytImport` is kept, by design ("that upload is expected to be
  the Studio download of the verified video").
- Hero file handoff: same, kept.
- CC load: `setYtImport(null)` — a source switch, correct.
- "Verify a different video": resets, correct.
So no verified fact is ever lost. But after an upload the journey
section shows nothing new: no "record attached to this project",
no next step. The attach is real in state and invisible in UI —
which reads, to the user, as "verification did nothing".

### Friction 4 — upload-without-verify has no guidance

Uploading without verifying honestly leaves the rights panel on
"Source not recorded — unverified" (correct, never assumed). But
nothing tells the user that verifying AFTER uploading still
attaches the record — the steps are order-independent in state
and order-locked in the user's head. The journey must say so.

### Friction 5 — two fallback lines are text, not links

`YoutubeOwnedImport`'s error box carries real fix links for
sign-in, not-connected, and reconnect — but for mismatch,
not-found, invalid, server, and network failures the fallback
("Or upload a video file directly above") is plain text, not a
link. The CC error box has the same plain-text fallback. They are
not hard dead-ends (the upload box is adjacent), but the brief
requires every error box to carry its fix as a link, and these
two do not.

### Friction 6 — after upload, no next-step pointer

The transcribe section ("1. AI transcript & highlights") has no
anchor id, so nothing in the journey can point at it. After the
upload lands, the user is left to scroll and find the next step
themselves.

### Friction 7 — the hero tab label hides the YouTube path

The hero paste tab is labelled "Paste a Wikimedia Commons or
Internet Archive link" while a YouTube link pasted there is in
fact routed to the ownership check. The label contradicts the
routing and hides the path the owner wants.

### What the audit confirmed is NOT broken (left alone)

- The verify → server path: body shape, error mapping, and fix
  links all check out (audited in the parent's 14:02 diagnosis).
- The rights panel fields and the clean-audio toggle: unchanged
  by this phase, per the brief.
- Verification never gates transcription or rendering: the
  journey is a guide, not a gate — a user who uploads without
  verifying still gets AI clips, with the panel honestly
  unverified. That stays.

## What was built

### 1. Guided steps that stay visible (`YoutubeJourneySteps.tsx`)

The "Your YouTube video" section now opens with a numbered
journey map, driven by the pure step states in
`lib/imports/youtube-journey.ts`:

- **Step 1 — Verify your YouTube link.** Done once a link
  verifies (title + channel shown); current otherwise.
- **Step 2 — Download your own video from YouTube Studio.**
  Current after verification, with the exact path in plain words
  (Content → ⋮ → Download) and a Studio link; done once a file
  is uploaded after verification — the upload is the only
  observable completion of this step, and the copy says so.
- **Step 3 — Upload that file here.** A file picker wired to the
  SAME direct-upload path as the main box (`handleDirectFile`:
  clears the CC record, keeps a verified YouTube record). Done
  with the file name once loaded; the verified case links on to
  the rights panel and to the AI transcript section (new
  `id="transcribe"` anchor); the unverified case says plainly
  that the rights panel still says unverified and that verifying
  afterwards still attaches — order does not matter.

The steps never gate anything: transcription and rendering work
exactly as before with or without verification.

### 2. The hero link now survives the handoff

`lib/upload-pending.ts` gains `setPendingYtUrl` /
`takePendingYtUrl` (consume-once, mirroring the CC carry).
`HeroUploadBox` stages the YouTube link before navigating, and
`YoutubeOwnedImport` takes `initialUrl` + `autoVerify`: the box
arrives pre-filled and the check runs once on arrival, so a hero
paste flows straight into verification instead of an empty box.
The hero still never verifies or loads anything itself. The hero
paste tab is also relabelled — "Paste a video link" with subtext
naming the YouTube routing — because the old label hid the path
it routed to.

### 3. The attach is now visible

- The upload box itself says, when a verified record exists,
  "Verified video: … — upload its Studio download here", and
  once a file is loaded, "Your verified source record is
  attached to this project."
- The journey steps confirm the attach and link to the rights
  panel, where the verified source line already showed (panel
  fields unchanged — the record was always there; now the user
  is pointed at it).
- Direct uploads keep the record (unchanged behaviour, now
  factored into one shared `handleDirectFile` used by the main
  box and the step-3 picker); a CC load still switches source
  and clears it; "Verify a different video" still resets it.

### 4. Every error box now carries its fix as a link

The plain-text fallbacks are now anchors to `#upload-dropzone`:
in `YoutubeOwnedImport` (mismatch, not-found, invalid, server,
network cases) and in `CcPasteImport` (error box and routed box).
Sign-in, accounts, and reconnect links are unchanged.

### 5. What deliberately did NOT change, and why

- **The Studio download stays manual.** YouTube offers no API
  download; no bytes are fetched from YouTube by any means. A
  "smoother" journey that pulled the file itself would be a
  downloader, which the owner's own brief forbids.
- **A non-own video still refuses with 403**, by design.
- **No copyright-removal promise anywhere.** The steps carry the
  standing sentence (AI editing does not remove copyright —
  safety comes from the source video), and the banned phrases
  are pinned by test on the new copy.
- **No invented tracks, licences, or verdicts.** `not_scanned`
  stays `not_scanned`; the panel fields are byte-identical to
  Phase 15.
- **AI moments, clean-audio toggle, exports, plan gates,
  billing binding, admin gate, CC import, share/deep-link
  posting, activity log, sweepers, and Ink + Record identity are
  untouched.** /signin works as before; logged-out /admin still
  redirects to /signin.

## Verification

- vitest: **417/417 across 48 files** (408 pre-existing + 9 new
  in `tests/phase16-journey.test.ts`: step-state transitions
  incl. the unverified-upload case, pending-link consume-once,
  copy ban + standing sentence).
- tsc: **0 errors**. eslint: **0 on changed files**.
- `next build`: **0**.
- Playwright: **42/42 full suite** (37 pre-existing + 5 new in
  `e2e/phase16.spec.ts`: steps presence, verified → steps
  advance → upload attaches + panel line, unverified upload
  note, every error box's fix link, hero carry pre-fill +
  auto-verify). Two real finds during the run, both fixed in the
  specs (behaviour changes, not regressions): the Phase 11 hero
  label assertion updated to the Phase 16 relabel, and the
  Phase 14 banner assertion scoped to the banner's own Studio
  sentence, since the journey steps legitimately repeat the
  verified-channel sentence (same class of fix as Phase 15's
  panel repeat).
- Downloader-term grep on changed files: zero. Banned-phrase
  grep on new/changed UI copy: zero (test/spec files reference
  the phrases only to assert their absence).
- Git: tree clean after commit; HEAD verified against
  `ls-remote` before reporting. Stash `@{0}` untouched.
- No Supabase dashboard changes, no SQL, no Vercel env changes,
  no deploy by the builder.

## Honest gaps (not hidden)

- **The live flow still needs the owner's two setup taps**
  (Supabase sign-in setup + YouTube OAuth app) before any real
  channel can connect. The journey is complete; the connection
  is still his step, and the UI says so on the not-connected
  path instead of faking it.
- **The tool cannot prove the uploaded file IS the verified
  video.** The record attaches to the project (the brief's own
  framing), and the steps say the upload is "expected to be"
  the Studio download — they never claim a file identity match.
- **A true end-to-end journey check (real video, real channel)
  still needs his hands**: a real upload through the steps on
  his phone, after the two setup taps.
- Phase 17 was NOT started here.
