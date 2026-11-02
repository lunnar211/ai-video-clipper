# Adopted libraries & surveyed projects — AI Video Clipper

Survey date: 2026-11-02. Rule applied: permissive licences only for code
shipped on a commercial site. AGPL code and platform downloaders were
rejected even when technically useful. No code below was copied from the
surveyed clipper projects — only patterns were adopted, and every adopted
library is used through its public API.

## Adopted

| Library / pattern | Licence | Why adopted (one line) |
|---|---|---|
| smartcrop (npm `smartcrop`, jwagner/smartcrop.js) | MIT | Content-aware crop (edges + skin tone + saturation) that accepts a canvas/video element — the auto-crop fallback when no face is found. |
| @mediapipe/tasks-vision FaceDetector (BlazeFace short-range) | Apache 2.0 (commercial use allowed, attribution required) | Real face detection in the browser from CDN wasm + model — drives the face-centered 9:16 window, sampled ~1 fps and smoothed; any load failure falls back to smartcrop, then center. |
| OpenShorts pipeline pattern (self-hosted edition) | MIT (pattern only, no code copied) | Closest validated architecture to ours: faster-whisper timestamps → LLM moment scoring (15–60 s) → MediaPipe face-tracked 9:16 reframe → burned captions. Validates our Whisper → LLM → face-crop → caption order. |
| ViralMint / Clips Kitty scoring rubric (pattern only) | AGPL-3.0 (code NOT copied) | Their open scoring ideas — hook strength, complete narrative, sentiment — shaped the highlights prompt; AGPL code itself is unsuitable for a commercial site. |
| Canvas + MediaRecorder rendering (browser-native pattern) | No library licence involved | One-pass render: cropped frame + burned-in caption text drawn on canvas, original audio mixed via Web Audio, MP4 where the browser supports it else WebM. Real-time encode, no 30 MB core download, no font plumbing. |

## Surveyed, deliberately NOT adopted

| Project / library | Licence / reason | Why not |
|---|---|---|
| ffmpeg.wasm (@ffmpeg/ffmpeg wrapper + @ffmpeg/core) | Wrapper MIT, but core follows FFmpeg LGPL/GPL terms (libx264 is a GPL trigger) | Licence risk on a commercial site, ~22–31 MB core, slow wasm x264 encode, multi-thread core needs COOP/COEP headers, caption burn-in needs libass font plumbing. Revisit only if MP4-everywhere output becomes a hard requirement and the licence question is cleared. |
| ViralMint code, Clips Kitty code | AGPL-3.0 | Network-use copyleft — unsuitable for a commercial site. Patterns only. |
| AutoClip code | Server-side Python; speaker diarization needs a Hugging Face token + gated pyannote model licences | Wrong runtime (not browser) and a gated-licence trap. Pattern only. |
| yt-dlp and all platform downloaders | — | FORBIDDEN by the own-videos-only compliance boundary, regardless of licence. No downloader code exists in this repo. |
| transformers.js in-browser Whisper | Apache 2.0 (feasible) | Deferred: Groq Whisper API is the key-gated primary path; local Whisper-tiny would be a no-key fallback but adds a ~40 MB model download. Follow-up, not MVP. |
| YOLOv8 ONNX speaker tracking (OpenClip Studio, Clips Kitty) | MIT (server-side) | Server ONNX runtime; MediaPipe covers the browser need with less weight. |
| OpenShorts / OpenClip platform-link input | — | Their YouTube/Twitch/TikTok link input is exactly what our compliance boundary forbids. Not adopted. |

## Attribution notes

- MediaPipe (Apache 2.0) requires attribution: see README "Third-party licences".
- smartcrop (MIT) copyright notice is retained via the npm package.
- FFmpeg is NOT shipped, so no FFmpeg attribution is owed; if ffmpeg.wasm
  is ever adopted, LGPL/GPL attribution and licence text must be added first.
