# AI Combo pipeline — n8n workflow

Importable n8n workflow for the ClipForge Phase 21 backend
pipeline: the same topic-to-short chain the `/generate` page
runs in the browser, orchestrated step by step through the
site's own HTTP routes.

## What it does (node order)

Trigger (webhook) → Normalize Input → Generate Script →
Split Segments → Find Verified Visuals → Merge Segments With
Visuals → Attach Visual → Build Subtitles → Voiceover Wanted?
→ Request Voiceover / Voiceover Not Requested → Build
Render-Job Record → Build Post Wiring → Respond.

- **Generate Script** calls `POST /api/generate/script`
  (Groq → Gemini → OpenRouter, same as the site). No provider
  configured means an honest 503 here — the run stops, no
  script is invented.
- **Find Verified Visuals** calls `POST /api/generate/visuals`
  once per segment. Only Commons videos that pass the exact
  licence verification come back (CC-BY, CC-BY-SA, CC0,
  public domain). A segment with no verified visual is
  recorded as a gap, never filled with an unverified file.
- **Build Subtitles** builds SRT + VTT from the same
  5-second windows the browser composer plays.
- **Voiceover** is a slot, not a promise: the route is called
  only when voiceover was requested and the script fits the
  route's 500-character limit. A missing voiceover never
  blocks the job, and no audio is ever faked.
- **Build Render-Job Record** is NOT a video. Server-side
  rendering is not available on Vercel, so the record hands
  off to the browser renderer or the ffmpeg worker.
- **Build Post Wiring** only prepares the clip id, title, and
  hashtags the post panel needs. Nothing here posts anything,
  and no outcome is ever recorded as "published" — only the
  platform itself can confirm a live post.

## Import steps

1. In n8n: Workflows → Import from File → pick
   `ai-combo-workflow.json`.
2. If n8n shows a version warning on the Merge node, open it
   and re-pick Combine → Merge by Position. If the If node's
   two conditions look empty, re-pick them: voiceover is true
   AND voiceoverTooLong is false (both read back from the
   Normalize Input and Build Subtitles nodes).
3. Check the three site URLs in the HTTP nodes. They point at
   the live deployment; change them only if the site moves to
   a different domain.
4. Leave the workflow inactive until you have tried it once
   manually: send a test webhook with a topic, watch each
   node, and confirm the Respond output carries a
   `needs_render` record.
5. The workflow file itself contains no credential values.
   Nothing to rotate if it leaks.

## The single-call alternative (no n8n)

The same chain is also available as one webhook call:
`POST /api/ai-combo/run` (see `docs/PHASE21.md`). That route
IS authorization-gated: set `AI_COMBO_WEBHOOK_SECRET` in the
site's environment, then call it with
`Authorization: Bearer <that value>`. Without the variable
the route honestly 503s. The value lives in your automation
(n8n holds it as a header credential) — never in this file,
never in the repo.

## Honest limits (read before relying on this)

- n8n cannot RUN this workflow until n8n itself has a home
  (the owner's Oracle signup). Importing the file is not
  running it.
- The workflow produces a render-job record, not a video.
  Rendering still happens in the browser or on the ffmpeg
  worker host — both need their own setup (see
  `docs/PHASE21.md`).
- Voiceover audio is generated at render time through the
  existing voiceover route, which needs `ELEVENLABS_API_KEY`.
  Without the key the slot records a skip and the job
  continues without voiceover.
- AI editing does not remove copyright. These visuals are
  CC-licensed or user-uploaded only, and the record carries
  each licence + source URL so the credit survives to export.
