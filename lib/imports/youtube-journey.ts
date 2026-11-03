/**
 * Own-YouTube guided journey steps (ClipForge Phase 16).
 *
 * Pure derivation of the journey's step states from the two facts
 * the tool actually knows: whether a YouTube link verified, and
 * whether a file is loaded. Nothing here invents a match: a file
 * uploaded without verification leaves step 1 open and the rights
 * panel unverified — the steps are a guide, never a gate, and
 * never a claim that the file IS the verified video.
 */

import type { YoutubeOwnedMeta } from "@/lib/imports/youtube-owned-client";

export type YoutubeJourneyStepStatus = "done" | "current" | "waiting";

export type YoutubeJourneyStepId = "verify" | "studio" | "upload";

export type YoutubeJourneyStep = {
  id: YoutubeJourneyStepId;
  status: YoutubeJourneyStepStatus;
};

/**
 * Step states for the own-YouTube journey:
 * - Step 1 (verify) is done once a link verifies, current otherwise.
 * - Step 2 (Studio download) is observable only through the upload
 *   that follows it: done when verified AND a file is loaded,
 *   current when verified but no file yet, waiting otherwise.
 * - Step 3 (upload) is done whenever a file is loaded — with or
 *   without verification — current when verified but no file yet,
 *   waiting otherwise. An unverified upload is a completed upload,
 *   not a verified source; the panel still says so.
 */
export function youtubeJourneySteps(opts: {
  verified: YoutubeOwnedMeta | null;
  hasFile: boolean;
}): YoutubeJourneyStep[] {
  const { verified, hasFile } = opts;
  return [
    { id: "verify", status: verified ? "done" : "current" },
    {
      id: "studio",
      status: verified && hasFile ? "done" : verified ? "current" : "waiting",
    },
    {
      id: "upload",
      status: hasFile ? "done" : verified ? "current" : "waiting",
    },
  ];
}
