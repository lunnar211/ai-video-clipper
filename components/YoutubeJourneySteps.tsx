"use client";

import { youtubeJourneySteps } from "@/lib/imports/youtube-journey";
import type { YoutubeOwnedMeta } from "@/lib/imports/youtube-owned-client";

/**
 * Guided steps for the own-YouTube journey (ClipForge Phase 16).
 *
 * The journey used to break apart after verification: a banner
 * said "upload that file above" and nothing in the section ever
 * confirmed the upload landed. These steps stay visible through
 * the whole journey — the current step is highlighted, completed
 * steps are checked — so the user always knows where they are and
 * what comes next.
 *
 * Honesty rules, same as the rest of the flow: the steps never
 * claim the uploaded file IS the verified video (the tool cannot
 * prove that — it only knows a record verified and a file loaded).
 * A file uploaded without verification shows step 3 done and the
 * source still unverified, exactly as the rights panel says. The
 * steps never gate anything: transcription and rendering work
 * with or without verification.
 *
 * This component never downloads anything. The only download in
 * the journey is the user downloading their OWN video from
 * YouTube Studio, by hand.
 */

const TITLES: Record<string, string> = {
  verify: "Step 1 — Verify your YouTube link",
  studio: "Step 2 — Download your own video from YouTube Studio",
  upload: "Step 3 — Upload that file here",
};

function mark(status: "done" | "current" | "waiting"): string {
  if (status === "done") return "✓";
  if (status === "current") return "●";
  return "○";
}

export default function YoutubeJourneySteps({
  verified,
  fileName,
  onUploadFile,
}: {
  verified: YoutubeOwnedMeta | null;
  fileName: string | null;
  onUploadFile: (file: File) => void;
}) {
  const steps = youtubeJourneySteps({
    verified,
    hasFile: fileName !== null,
  });
  const statusOf = (id: string) =>
    steps.find((s) => s.id === id)?.status ?? "waiting";

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <ol
        aria-label="Your YouTube video journey"
        className="space-y-4 text-sm"
      >
        <li>
          <p className="font-semibold">
            {mark(statusOf("verify"))} {TITLES.verify}
          </p>
          {verified ? (
            <p className="mt-1 text-muted-foreground">
              Done — “{verified.videoTitle}” is on your connected
              channel “{verified.channelTitle}”.
            </p>
          ) : (
            <p className="mt-1 text-muted-foreground">
              You are here — paste your own YouTube link below and
              press Verify ownership.
            </p>
          )}
        </li>
        <li>
          <p className="font-semibold">
            {mark(statusOf("studio"))} {TITLES.studio}
          </p>
          {verified && fileName ? (
            <p className="mt-1 text-muted-foreground">
              Done — a file was uploaded after verification, so
              this step is complete.
            </p>
          ) : verified ? (
            <p className="mt-1 text-muted-foreground">
              You are here — in{" "}
              <a
                href="https://studio.youtube.com"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                YouTube Studio
              </a>
              , open Content, use the ⋮ menu on this video, and
              choose Download. Then upload that file in step 3.
              The tool never pulls the video from YouTube itself.
            </p>
          ) : (
            <p className="mt-1 text-muted-foreground">
              This step needs a verified video first.
            </p>
          )}
        </li>
        <li>
          <p className="font-semibold">
            {mark(statusOf("upload"))} {TITLES.upload}
          </p>
          {fileName ? (
            <>
              <p className="mt-1 text-muted-foreground">
                Done — uploaded: {fileName}.
              </p>
              {verified ? (
                <p className="mt-1 text-muted-foreground">
                  Your verified source record is attached to this
                  project — see it in the{" "}
                  <a href="#rights-panel" className="underline">
                    rights panel
                  </a>
                  , then{" "}
                  <a href="#transcribe" className="underline">
                    continue to AI transcript
                  </a>
                  .
                </p>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  This file was uploaded without verification — the
                  rights panel still says unverified. Verify a link
                  in step 1 to attach a source record; the order
                  does not matter.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="mt-1 text-muted-foreground">
                {verified
                  ? "Upload the Studio download here — same file the main upload box takes."
                  : "Upload a video file here, or verify first in step 1 to attach a source record."}
              </p>
              <input
                id="yt-journey-upload"
                className="mt-2 block w-full max-w-full text-sm"
                type="file"
                accept="video/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadFile(f);
                }}
              />
            </>
          )}
        </li>
      </ol>
      <p className="mt-4 text-sm text-muted-foreground">
        AI editing does not remove copyright — safety comes from
        the source video. That is why this journey only ever uses
        your own verified video or a verified free-licence video.
      </p>
    </div>
  );
}
