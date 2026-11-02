# AI Video Clipper

Turn videos **you own** into vertical 9:16 clips for TikTok, Reels and
Shorts: AI transcript (Groq Whisper) → AI highlight moments (Groq →
Gemini → OpenRouter) → face-centered or smart-cropped 9:16 render with
burned-in captions, titles, hashtags and SRT download. The video itself
never leaves the browser; rendering runs on-device via canvas +
MediaRecorder.

## Compliance boundary (hard)

Clip your own videos only — you must own the rights to the video you
clip. This repo contains **no platform-downloading code**: no yt-dlp, no
link-paste downloading, no fetching from YouTube, TikTok, Instagram or
any other platform. "For any platform" means the *output* fits any
short-form platform, not that the tool downloads from one.

## Setup

```bash
npm install
npm run dev
```

## Environment variables (all optional — the tool works manually without them)

| Variable | Used for |
|---|---|
| `GROQ_API_KEY` | Whisper transcription + highlight text (primary) |
| `GEMINI_API_KEY` | Highlight text (second opinion / fallback) |
| `OPENROUTER_API_KEY` | Highlight text fallback (free text tier only) |
| `ELEVENLABS_API_KEY` | Optional voiceover track |
| `ELEVENLABS_VOICE_ID` | Voiceover voice (default: Rachel) |
| `NVIDIA_API_KEY` | Text-safety screen on titles/captions (best-effort) |
| `NEXT_PUBLIC_SITE_URL` | Sitemap + canonical links |

Without a key, the corresponding route answers HTTP 503
"AI is not connected yet" — never a fake result. Never commit real
values; set them in Vercel (Production + Preview).

## Honest limits

- Video: up to 10 minutes, up to 500 MB (browser limits).
- Clips: up to 3 minutes; output 720×1280.
- Format: MP4 where the browser supports recording it, otherwise WebM.
- Transcription audio: 25 MB provider cap; the browser resamples to
  16 kHz mono (~2 MB/min), so a 10-minute video fits.
- API routes: 5 requests/minute per IP (in-memory).

## Architecture notes

- `research/adopted-libraries.md` records the open-source survey:
  smartcrop (MIT) and MediaPipe tasks-vision FaceDetector (Apache 2.0)
  are adopted; ffmpeg.wasm was evaluated and deliberately NOT adopted
  (core licence terms, ~30 MB core, slow wasm encode, COOP/COEP
  requirement, caption font plumbing). The canvas + MediaRecorder
  renderer is the equivalent for this MVP.
- The highlight pipeline pattern (Whisper timestamps → LLM moment
  scoring → face-tracked reframe → burned captions) follows the
  MIT-licensed OpenShorts approach; AGPL clipper code was not copied.
- No auth, no database, no payments in MVP.

## Third-party licences

- MediaPipe (Apache 2.0) — attribution: face detection in this tool
  uses Google's MediaPipe tasks-vision and the BlazeFace model.
- smartcrop (MIT) — content-aware cropping.
- FFmpeg is NOT shipped with this site.

## Follow-ups (not in MVP)

- Vercel project creation on the owner's account + env pastes + redeploy.
- Sign-in and usage history (needs a database).
- Paid plans (needs a real price + a payment provider; nothing invented).
- In-browser Whisper-tiny as a no-key transcription fallback
  (transformers.js, Apache 2.0; ~40 MB model download).
- True speaker-tracked crop (per-second face path instead of a single
  median window) and dual-speaker split-screen.
