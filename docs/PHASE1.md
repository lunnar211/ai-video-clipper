# ClipForge Phase 1 — Core AI clipping pipeline (IMPLEMENTED)

Built on top of main @ 29d93e7 (MVP + viral metadata + rights + auth).
Nothing existing was removed or renamed; the free browser-render path
behaves exactly as before when the new options are absent. No link
downloader, no copyright-evasion feature, no "copyright-free" or
earnings claim anywhere. No SQL was applied to any live database.

## Commits (main)

- `3533b33` — pipeline core (slice a)
- `71f242e` — ingest/storage/imports/queue/server-render/editor/share (slice b)
- This doc + final verification (slice c)

## Files changed (one line each)

### Pipeline core (lib/pipeline/)
- `virality.ts` — weighted score hook 40% / pacing 35% / engagement 25%, reconciled with metadata sub-scores (engagement = mean of emotion + ending), with written reasons.
- `silence.ts` — RMS windows, silent-range detection, non-silent splitting (pure, tested).
- `scenes.ts` — frame-difference boundary detector + luminance variance for thumbnails (pure, tested).
- `search.ts` — keyword search over transcripts, hit-to-window grouping, length-target windows (pure, tested).

### AI (lib/ai/)
- `groq.ts` — word-level timestamps added (verbose_json `words`); old positional `fetchImpl` call still works.
- `asr.ts` — pluggable ASR provider interface (Groq wired; resolve null when unconfigured).
- `diarization.ts` — interface ONLY; resolves null until a provider + key exist; never calls a paid API.
- `translate.ts` — LLM-chain translation, chunked (40 segs / 4000 chars), failed chunks keep original text.
- `languages.ts` — curated 28-language offer list (honest: NOT a "100+" promise).
- `highlights.ts` — `parseMoments`/`pickHighlights` accept length targets; default 15–60 s rule unchanged.
- `metadata.ts` — descriptions extended to X (≤280 chars, 1–2 hashtags) + LinkedIn (≤700 chars, 3–5 hashtags); both optional so old metadata still validates; template fallback includes them.

### Browser (lib/browser/)
- `audio.ts` — unchanged (existing extraction reused).
- `face.ts` — added `sampleFaceTrack` (per-second, 3-point median smoothing); `sampleFaceCenterX` untouched.
- `thumbnails.ts` — scene sampler (~2 fps frame diff) + sharpest-frame thumbnail with text overlay.
- `render.ts` — opt-in only: caption presets, animated word highlight, brand logo/watermark, face-track crop mode, split-screen background. No-option behaviour is byte-identical in flow to before.
- `filetype.ts` — magic-byte sniffing (MP4/MOV ftyp, WebM EBML, AVI RIFF); unknown = allowed, non-video = rejected.
- `zip.ts` — dependency-free stored-ZIP writer for bulk download.

### Storage / imports / queue / server render
- `lib/storage/r2.ts` — S3 SigV4 presigning + multipart initiate/complete + provider interface; resolves null without R2 env.
- `lib/imports/ssrf.ts` — SSRF guard (allow-list + private-IP rejection, injectable DNS).
- `lib/imports/index.ts` — allowed-import rules, CC host allow-list, CC licence set, attribution builder.
- `lib/queue/index.ts` — queue interface + Inngest adapter; reports "not configured" without keys.
- `lib/server-render/contract.ts` — signed job request/status schemas (zod), worker resolution, HMAC signing.
- `lib/share.ts` — share tokens, Supabase REST helpers (create/get/bump views); 503 path when DB missing.
- `lib/brandkit.ts` — brand kit schema + browser persistence (logo session-only by design).
- `lib/captions.ts` — VTT export, word timestamps, caption presets (additive).

### API routes (all zod-validated, rate-limited)
- `app/api/uploads/initiate|complete` — resumable multipart (8 MB chunks); 500 MB cap, 5 GB only with `R2_LARGE_UPLOADS_ENABLED=true`; 503 without R2.
- `app/api/imports` — CC-licensed validation + attribution; connected sources 503 (no OAuth store yet); NO arbitrary-URL branch exists.
- `app/api/clips/search` — keyword windows + LLM rerank when configured (source labelled).
- `app/api/clips/translate` — cost-guarded translation; 503 without AI.
- `app/api/clips/diarize` — 503 until a diarization provider exists.
- `app/api/clips/transcribe` — now accepts `words=1` for word timestamps.
- `app/api/clips/highlights` — now accepts `targetSeconds` (15–180).
- `app/api/render/jobs` — POST/GET; 503 without worker; signed forward when configured.
- `app/api/share` + `app/api/share/[token]` — DB-backed create/get+bump; 503 without DB.
- `app/share/[token]/page.tsx` — public embed page (honest about unhosted video).

### UI (components/)
- `ClipEditor.tsx` — draggable timeline trim, live 9:16 preview with active-word highlight, transcript click-to-seek + segment exclusion cuts, silence detect + split, caption presets, split-screen background picker, undo/redo, per-clip versions (browser storage).
- `BrandKitPanel.tsx` — logo/color/font/watermark controls.
- `ClipperTool.tsx` — additive wiring only: length-target select, transcript search, caption translation, brand kit section, per-clip Edit/Thumbnail/VTT/Share buttons, editor panel, ZIP bulk download, magic-byte sniffing, "track" crop option.
- `MetadataCard.tsx` — descriptions tab shows X + LinkedIn when present.
- `lib/crop.ts` — `CropMode` gains `"track"`.
- `next.config.ts` — CSP gains the R2 origin only when `R2_CSP_ORIGIN` is set.
- `eslint.config.mjs` — `worker/**` ignored (plain Node, not Next code).

### Worker (worker/ — NOT deployed to Vercel)
- `Dockerfile` — node:22-slim + ffmpeg installed, ready for the real runner.
- `server.mjs` — signature verification + job accept/status skeleton (no ffmpeg execution yet — see gaps).
- `package.json`, `README.md` — run instructions + next-slice list.

## DB migrations (FILES ONLY — NOT APPLIED)

- `supabase/migrations/001_clipforge_phase1.sql` — NEW tables only:
  `clipper_shares`, `clipper_render_jobs`, `clipper_brand_kits`,
  `clipper_imports`, `clipper_clip_versions`. Prerequisite: apply
  `supabase/clipper-schema.sql` first. RLS ON, owner-only policies.
  Shares are reachable ONLY through the service-role API route (no
  anonymous PostgREST policy by design). No Prisma was added: this repo
  has no ORM, and adding one would touch every existing query — the
  SQL-file approach keeps Phase 1 additive.

## Env vars (names only — never values)

| Var | Purpose | Where the owner gets it |
|---|---|---|
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Cloudflare R2 storage for resumable uploads | Cloudflare dashboard → R2 → API tokens |
| `R2_PUBLIC_HOST` | Public R2 hostname for embeds (optional) | R2 bucket → public domain |
| `R2_CSP_ORIGIN` | Origin added to CSP when R2 is live | Same as R2_PUBLIC_HOST |
| `R2_LARGE_UPLOADS_ENABLED` | `true` allows 5 GB uploads (paid-tier gate placeholder) | Owner decision, not a provider |
| `INNGEST_EVENT_KEY` | Server job queue events | Inngest dashboard (account does not exist yet) |
| `WORKER_URL`, `WORKER_AUTH_SECRET` | ffmpeg worker endpoint + shared HMAC secret | Owner's Docker host + own generated secret |
| `DIARIZATION_PROVIDER`, `DIARIZATION_API_KEY` | Speaker diarization provider (no adapter yet) | Owner picks a provider first |
| Existing: `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`, `NVIDIA_API_KEY`, `AUDD_API_TOKEN`, Supabase + Paddle vars | Unchanged from before | Provider dashboards |

## Setup steps (owner taps flagged with 👆)

1. 👆 R2: create a bucket + API token, paste the four R2 vars into the
   Vercel project, redeploy. Then resumable uploads work; until then
   `/api/uploads/*` honestly 503s and browser upload stays the path.
2. 👆 Database: choose the Supabase project, apply
   `supabase/clipper-schema.sql` (if not applied) then
   `supabase/migrations/001_clipforge_phase1.sql` in the SQL editor,
   set `SUPABASE_SERVICE_ROLE_KEY` in Vercel, redeploy. Then share
   links + view counts work; until then share creation honestly 503s.
3. 👆 Worker host: run `worker/` on a Docker host (Oracle VM is the
   planned host), set `WORKER_URL` + `WORKER_AUTH_SECRET` in Vercel.
   Until then server render 503s and browser render stays the path.
4. 👆 Inngest: create an account + event key if server queuing is
   wanted; otherwise the queue stays honestly unconfigured.
5. 👆 Diarization: pick a provider (pyannote-based API is the usual
   choice) — an adapter slice is still needed before this works.
6. 👆 Deploy: parent deploys main to the existing Vercel project after
   this report; no deploy was made by this build.

## Manual QA checklist (for the owner)

- [ ] Upload: drop an MP4 → clip list appears; drop a renamed .pdf →
      header check rejects it with a clear message.
- [ ] Transcribe: AI transcript appears; word highlight works in the
      editor preview (yellow active word) when word timestamps exist.
- [ ] Highlights: default finds 30–60 s clips; 30 s target keeps clips
      ≤30 s; search "find clips about X" returns windows + Add as clip.
- [ ] Editor: drag timeline handles → clip times update; Undo/Redo
      work; transcript line click seeks; tick lines + Cut splits the
      clip; Detect silence finds silences and Split removes them.
- [ ] Captions: preset change alters rendered caption style; Translate
      to Spanish replaces captions (or honestly says AI is missing).
- [ ] Brand kit: logo + watermark appear on a rendered clip; free-tier
      site watermark is still present.
- [ ] Metadata: card shows X + LinkedIn descriptions with Copy buttons.
- [ ] Export: SRT + VTT download; ZIP downloads all rendered clips.
- [ ] Thumbnail: Make thumbnail shows + downloads a 720×1280 image.
- [ ] Share: without DB → clear "needs the database" message (no fake
      link); with DB → link opens the embed page and views increment.
- [ ] Honest degradation: `/api/clips/diarize`, `/api/render/jobs`,
      `/api/uploads/initiate` (no R2), `/api/imports` (connected
      source) all return clear setup messages, never fake success.
- [ ] Imports: CC URL on an allow-listed host + CC-BY licence returns
      attribution text; a random video URL is rejected (no downloader).
- [ ] Regression: old flow (upload → transcribe → highlights → render
      → download) works exactly as before with default options.

## Honest gaps (interface-only until owner setup lands)

- Diarization: interface + route only; no provider adapter, no calls.
- Server render: job API + worker skeleton only; ffmpeg execution,
  R2 result upload, callback, persistent job store are the next slice.
- Share links: need the migration applied + service key (see above).
- Resumable uploads: need R2 (see above); browser upload stays default.
- CC import: validation + attribution only; server-side CC fetching
  arrives with the worker (file still arrives via direct upload).
- Silence: split-into-parts, not seamless re-timing (needs ffmpeg).
- Per-second face tracking: implemented as crop mode "track"; the old
  "face" median mode is unchanged and remains the default.
- Translation quality varies by language; the list is curated (28),
  never "100+".
- Playwright smoke test: NOT added — no Playwright/browsers in this
  environment. The QA checklist above is the smoke path; add a
  Playwright suite in CI when the owner sets it up.
- No Prisma: deliberate (see migrations note). If the owner prefers
  Prisma, that is a separate migration slice, not a silent swap.
