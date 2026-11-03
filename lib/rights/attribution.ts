/**
 * Attribution text builder (ClipForge Phase 2).
 *
 * CC-licensed and royalty-free music often requires a credit line.
 * This builds it deterministically from the track's licence metadata
 * so the exact same text flows into the UI, the clip metadata, and
 * the ZIP export (ATTRIBUTION.txt). It never invents an author or a
 * licence — every field comes from the track entry or the user.
 */

export type AttributionInput = {
  title: string;
  artist: string | null;
  licence: string;
  sourceUrl: string | null;
  /** Extra licence terms (e.g. "attribution required, no derivatives"). */
  licenceTerms: string | null;
};

export function buildMusicAttribution(input: AttributionInput): string {
  const by = input.artist ? ` by ${input.artist}` : "";
  const link = input.sourceUrl ? ` (${input.sourceUrl})` : "";
  const terms = input.licenceTerms ? ` — ${input.licenceTerms}` : "";
  return `Music: "${input.title}"${by}${link} — licensed under ${input.licence}${terms}.`;
}

/** True when this licence requires a visible credit line. */
export function licenceRequiresAttribution(licence: string): boolean {
  const l = licence.toLowerCase();
  if (l.includes("cc0") || l.includes("public domain")) return false;
  if (l.includes("cc-by")) return true;
  if (l.includes("attribution")) return true;
  // Own/paid licences: attribution only when the licence says so.
  return false;
}

/**
 * Combine attribution lines for one ATTRIBUTION.txt (ClipForge
 * Phase 11: a CC-import credit joins the music credit). Blank
 * entries drop out; null means there is nothing to write.
 */
export function combineAttributionLines(
  lines: Array<string | null | undefined>,
): string | null {
  const kept = lines.filter(
    (line): line is string => typeof line === "string" && line.trim() !== "",
  );
  if (kept.length === 0) return null;
  return kept.join("\n");
}
