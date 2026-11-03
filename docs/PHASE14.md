# ClipForge Phase 14 — Fix the YouTube-link dead end

Owner bug report with a screenshot: he pasted a YouTube link
(`https://youtu.be/gml6derYB2k`, a youtu.be short link) into the
"Paste a video link" box on /create and got the generic refusal
"Only Wikimedia Commons and Internet Archive links are accepted
here."

## Diagnosis: the refusal was correct, the dead end was the bug

The CC box was doing its job: it accepts only Wikimedia Commons
and Internet Archive, licence checked first. The real gap was that
the Phase 8 own-YouTube import API (`POST /api/imports/youtube-owned`,
ownership proven by exact channel-id match) had NO UI anywhere, so
a user pasting their OWN YouTube link had no working path at all —
the generic refusal was the end of the road. This phase builds that
missing UI and routes YouTube pastes to it. Nothing about the CC
box's allow-list changed: every other host is refused exactly as
before.

## What changed

### 1. "Your YouTube video" paste entry on /create

New section (`#your-youtube-video`) below the CC paste section in
`components/ClipperTool.tsx`, backed by
`components/YoutubeOwnedImport.tsx`:

- Signed-in users paste a YouTube URL (youtube.com, youtu.be,
  Shorts URLs) → "Verify ownership" calls the existing
  `POST /api/imports/youtube-owned` (new client wrapper in
  `lib/imports/youtube-owned-client.ts`, fetch-injectable for
  tests).
- On ownership-verified success, the tool records the verified
  facts (video title + connected channel) as the project's source
  record and shows the verified banner: title, channel, and the
  next step — download your own video from YouTube Studio
  (Content → ⋮ menu → Download) and upload that file in the box
  above (`#upload-dropzone` link). "Verify a different video"
  resets the record. A CC load switches source and clears the
  YouTube record; a direct upload keeps it, because that upload is
  expected to be the Studio download of the verified video.
- On failure, the message is always the server's specific one plus
  the fix that matches it — never generic:
  - Not signed in (401) → "Sign in first" link to /signin.
  - No connected YouTube account (400) → link to /accounts to
    connect, plus the honest note: if the YouTube connect button
    there shows Not enabled, the site's YouTube connection itself
    is not set up yet — that step belongs to the site owner.
  - Ownership mismatch (403) → "this video is not on your
    connected channel".
  - Stale grant / old scope (401/403) → reconnect link to
    /accounts.
  - Video not found (404), invalid link shape (400), server
    failure (429/5xx) → the server's message as-is.

### 2. Smart routing in the CC box

`components/CcPasteImport.tsx` now checks the pasted link with the
client-safe `isYoutubeLink` helper
(`lib/imports/youtube-link.ts`, pure URL parsing — it deliberately
does NOT import the server's youtube.ts, which would drag token
crypto into the browser bundle) BEFORE calling cc-verify:

- A YouTube link shows a routed box (amber, not red): "YouTube
  links don't go through this box — use the Your YouTube video
  flow below" with an anchor link to `#your-youtube-video`. No
  server call is made for this box, and the generic allow-list
  refusal no longer appears for YouTube links.
- Routing is host-based on purpose: playlists and channel links
  also route (the YouTube flow's server then refuses their shape
  specifically), so no YouTube paste ever dead-ends.
- TikTok, Instagram, Facebook, X, and random sites keep the exact
  honest refusal + upload-file fallback as before.

### 3. Hero paste area links to the YouTube flow

`components/HeroUploadBox.tsx`: a YouTube link pasted in the hero
paste tab now navigates straight to `/create#your-youtube-video`
instead of being carried to the CC box (which would only route it
onward). A "Your own YouTube video? Verify ownership in the
clipper" link sits under the paste form. Non-YouTube links are
unchanged (carried to /create for CC verification).

## NEVER download from YouTube

Stated in the UI, in the component comments, and here, so nobody
mistakes verification for downloading: no video bytes are fetched
from YouTube by any means — no downloader, no yt-dlp, no
third-party download API, no Data API download (none exists). The
server calls Data API metadata endpoints only (video channel +
token channel) and compares channel ids. The file itself still
arrives via direct upload only. The only "download" in this flow is
the user downloading their OWN video from YouTube Studio, by hand,
on YouTube's own site.

## Verification

- vitest: **385/385 across 46 files** (376 pre-existing + 9 new in
  `tests/phase14-youtube-owned.test.ts`: routing predicate incl.
  the reported youtu.be case, response mapping incl. the two
  different 401s, body shape `{url}` only, network failure).
- tsc: **0 errors**. eslint: **0 on changed files**.
- `next build`: **0**.
- Playwright: **33/33 full suite** (6 new in `e2e/phase14.spec.ts`:
  flow presence, CC routing with zero cc-verify calls, 403
  mismatch, 401 sign-in help, verified banner + Studio step, hero
  link + routing; the Phase 11 YouTube-refusal spec was updated to
  the new routed expectation — that behavior change is the point
  of this phase, not a regression).
- Downloader-term grep on changed files: only legitimate hits (the
  explicit "no downloader" prohibition and the user's own Studio
  download wording). Credential-term grep: no new login/grant/
  session handling — the flow reuses the existing Phase 8 route
  and its session binding.
- Git: tree clean after commit; HEAD verified against `ls-remote`
  before reporting (see parent report). Stash `@{0}` untouched.
- No Supabase dashboard changes, no SQL, no Vercel env changes,
  no deploy by the builder.

## Honest gaps (not hidden)

- **The flow runs live only after the owner creates the YouTube
  OAuth app** (his tap, still pending). Until then, the UI is real
  and the API is real, but no channel can connect — and the UI says
  so on the not-connected path instead of faking a connection.
- If the screenshotted video is NOT the owner's own video, its
  refusal correctly stays: other people's YouTube videos are
  refused by the ownership check (403), by design.
- The YouTube flow verifies ownership only; it does not
  transcode, and the Studio download step is manual by necessity
  (YouTube offers no API download).
- Anchor scrolling to `#your-youtube-video` from the hero relies
  on the browser's hash navigation; if a browser fails to scroll,
  the section is still on /create below the CC box.
- Phase 15 (AI-clean render option, from the owner's pipeline
  note) was NOT started here — it waits on this phase landing, per
  the no-parallel-clipper-work rule.

## QA checklist (for the parent's live probe, after deploy)

- [ ] /create shows the "Your YouTube video" section below the CC
      paste section; hero paste tab shows the YouTube link line.
- [ ] Signed out, paste a YouTube link in the YouTube flow →
      sign-in help (not a generic error).
- [ ] Paste a youtu.be link in the CC box → routed message + link
      to the YouTube flow, no generic refusal, no cc-verify call.
- [ ] Paste a TikTok link in the CC box → the honest refusal,
      unchanged.
- [ ] Signed in without a connected channel → accounts link + the
      owner-setup note (until the OAuth app exists).
- [ ] Sign-in flow unchanged; logged-out `/admin` still redirects
      to `/signin` with no admin UI.
