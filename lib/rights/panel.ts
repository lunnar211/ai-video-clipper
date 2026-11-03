/**
 * Pre-export rights panel helpers (ClipForge Phase 15).
 *
 * Pure functions that turn the tool's project state into the exact
 * lines the panel shows. Nothing here invents a verdict: a music
 * check that never ran, or a recognition service that is not
 * connected, reads as not scanned — never as clear.
 */

import type { MusicMatch } from "@/lib/music/audd";
import type { CcImportMeta } from "@/lib/imports/cc-types";
import type { YoutubeOwnedMeta } from "@/lib/imports/youtube-owned-client";
import type { UserTrack } from "@/lib/music/tracks";
import { userTrackAttribution } from "@/lib/music/tracks";
import { combineAttributionLines } from "@/lib/rights/attribution";

export type MusicCheckStatus =
  | "checking"
  | "clear"
  | "detected"
  | "unavailable";

export type MusicCheckEntry = {
  status: MusicCheckStatus;
  match?: MusicMatch;
};

/**
 * The project's source-licence line, from the strongest record the
 * tool holds. CC imports carry verified licence facts; own-YouTube
 * imports carry a verified ownership record; anything else rests on
 * the user's own declaration — and with no declaration and no
 * record, the source is unverified.
 */
export function sourceLicenceLine(opts: {
  ccImport: CcImportMeta | null;
  ytImport: YoutubeOwnedMeta | null;
  rightsOk: boolean;
}): string {
  if (opts.ccImport) {
    const c = opts.ccImport;
    return `Free licence: ${c.license} — "${c.title}" by ${c.author}. Source: ${c.sourceUrl}`;
  }
  if (opts.ytImport) {
    const y = opts.ytImport;
    return `Your own video — ownership verified on channel "${y.channelTitle}" ("${y.videoTitle}").`;
  }
  if (opts.rightsOk) {
    return "Your upload — you declared you own or licensed this video and its music.";
  }
  return "Source not recorded — unverified.";
}

/**
 * One summary line per music-check outcome present, in a fixed
 * order (detected first). "clear" is worded as no match found in
 * the sample — a check is not proof of clearance, and the word for
 * an unrun or unconnected check is always "not scanned".
 */
export function summarizeMusicChecks(
  checks: Record<string, MusicCheckEntry>,
): string[] {
  const entries = Object.values(checks);
  if (entries.length === 0) {
    return ["Not scanned — no music check has run for this project."];
  }
  const lines: string[] = [];
  const detected = entries.filter((e) => e.status === "detected");
  for (const d of detected) {
    lines.push(
      d.match
        ? `Music check found a match: ${d.match.artist} — ${d.match.title}. Posting with that music may get the clip muted, blocked, or struck.`
        : "Music check found a match for one clip. Posting with that music may get the clip muted, blocked, or struck.",
    );
  }
  const clearCount = entries.filter((e) => e.status === "clear").length;
  if (clearCount > 0) {
    lines.push(
      `Music check found no known recorded music in ${clearCount} clip sample${clearCount === 1 ? "" : "s"}. A check is not proof of clearance.`,
    );
  }
  const unavailableCount = entries.filter(
    (e) => e.status === "unavailable",
  ).length;
  if (unavailableCount > 0) {
    lines.push(
      `Not scanned — music recognition is not connected (no key on the server) for ${unavailableCount} clip${unavailableCount === 1 ? "" : "s"}. Unscanned does not mean clear.`,
    );
  }
  const checkingCount = entries.filter(
    (e) => e.status === "checking",
  ).length;
  if (checkingCount > 0) {
    lines.push(
      `Music check running for ${checkingCount} clip${checkingCount === 1 ? "" : "s"}…`,
    );
  }
  return lines;
}

/**
 * The attribution text the ZIP export ships, computed exactly the
 * way the export computes it: the picked track's credit (when one
 * applies) joined with the CC-import credit (when one applies).
 * Returns null when no credit applies.
 */
export function buildPanelAttribution(opts: {
  musicTrack: UserTrack | null;
  ccImport: CcImportMeta | null;
}): string | null {
  return combineAttributionLines([
    opts.musicTrack ? userTrackAttribution(opts.musicTrack) : null,
    opts.ccImport ? opts.ccImport.attribution : null,
  ]);
}
