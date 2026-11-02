FROM node:22-slim

# ffmpeg worker for ClipForge server renders (Phase 1 skeleton).
# The worker is intentionally small: it verifies the HMAC signature on
# every job request, runs ffmpeg for the requested clip, uploads the
# result to R2, and reports status. It is NOT part of the Next.js app
# and is NOT deployed to Vercel — run it on a Docker host you control
# (the owner's Oracle VM is the planned host; any Docker host works).
#
# Build:  docker build -t clipforge-worker worker/
# Run:    docker run -e WORKER_AUTH_SECRET=... -e R2_ACCOUNT_ID=... \
#           -e R2_ACCESS_KEY_ID=... -e R2_SECRET_ACCESS_KEY=... \
#           -e R2_BUCKET=... -p 8080:8080 clipforge-worker
#
# ffmpeg is required in the image for real renders; the skeleton below
# installs it so the container is ready for the real job runner.

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.mjs ./

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
