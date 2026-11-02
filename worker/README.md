# ffmpeg worker (ClipForge Phase 1 skeleton)

The worker runs server renders for paid/long videos. The Next.js app
never renders server-side itself — it signs a job request (HMAC, see
`lib/server-render/contract.ts`) and forwards it to this worker.

## Current state: SKELETON

- `POST /jobs` verifies the `X-ClipForge-Signature` header and queues
  the job (in-memory). It does NOT run ffmpeg yet.
- `GET /jobs/:id` returns the queued status.
- The Dockerfile installs ffmpeg so the next slice (real ffmpeg
  execution + R2 upload + callback) needs no image change.

## Run it

```bash
docker build -t clipforge-worker worker/
docker run -e WORKER_AUTH_SECRET='<same secret as the app>' -p 8080:8080 clipforge-worker
```

Then set in the app's env: `WORKER_URL=http://<host>:8080` and the same
`WORKER_AUTH_SECRET`. Without both, the app's `/api/render/jobs` route
honestly 503s and the browser path stays the only render path.

## What the next worker slice adds

1. ffmpeg invocation from the job payload (crop window, captions via
   ASS/overlay, brand kit, split-screen background).
2. R2 upload of the finished clip + presigned result URL.
3. Callback POST to the app's `callbackUrl` (if provided) with status.
4. Persistent job store (the in-memory map here loses jobs on restart).
