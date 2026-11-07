# AGENTS.md — AI Video Clipper (ClipForge)

Working conventions for this repo. Phase-by-phase history lives in
`docs/PHASE*.md` (Phase 21 is current); read the relevant phase doc
before changing the area it built. `README.md` states the setup,
environment variables, and honest limits.

## Compliance boundary (hard — never break)

- This product must NEVER be a link downloader. Allowed imports
  ONLY: direct upload of a video you own, your own YouTube video
  via OAuth ownership verification (file still arrives by direct
  upload — the tool never pulls video bytes from YouTube),
  own Drive/Dropbox/Loom links, and verified free-licence
  (CC-BY / CC-BY-SA / CC0 / public domain) links from Wikimedia
  Commons or Internet Archive with auto-attribution.
- NEVER add copyright-evasion features. NEVER promise
  "copyright-free" or earnings. NEVER fetch or scrape YouTube,
  TikTok, Instagram, or any other platform.
- Licence verification fails closed: an unverified, NC/ND,
  reserved, or unknown licence is refused, never assumed free.

## Honesty rules

- AI routes answer HTTP 503 "not connected yet" when their key is
  missing — never a fake result.
- Quotas and gates are stated as they are: the free 3-renders/day
  limit is enforced per browser (localStorage), not on the server.
- Gated states are stated in the UI (publishing off until a
  platform's app review is approved; YouTube connect off until the
  owner creates the OAuth app; MCP reads need an API key from the
  admin console).
- No prices anywhere until the owner confirms them; no invented
  numbers, no demo content pretending to be output.

## Security

- NEVER put secrets, keys, or passwords in code, chat, or memory.
  Env vars live in Vercel only (owner's taps).
- NEVER weaken auth, admin gating, or the SSRF allow-list in
  `lib/imports/`. Admin routes redirect logged-out visitors to
  `/signin`; admin APIs answer 401.
- NEVER delete data or features. NEVER run paid model calls
  (fal.ai is paid per generation). NEVER test payments with real
  money.

## Build / test / deploy

- `npm test` (vitest) and `npm run build` — build to a file and
  echo `$?`; never pipe the build through `tail` (masks failure).
- Deploy ONLY via `python3 ~/workspace/deploy_clipper.py` (no
  teamId). Never deploy while the tree is dirty.
- Live URL is
  `https://ai-video-clipper-dipeshkarki8292-3476s-projects.vercel.app`
  — NEVER use plain `ai-video-clipper.vercel.app` (taken by
  someone else). Verify a deploy with real curls against the live
  URL and confirm the new build by content markers, not the
  homepage title alone.
