import type { AudioTreatment } from "@/lib/browser/audio-plan";

/**
 * Pre-export rights panel (ClipForge Phase 15).
 *
 * Shows, before export, exactly what the tool knows: the source
 * licence, the music-check outcome, the audio treatment, and the
 * attribution that will ship. It never claims a video is clear:
 * an unrun or unconnected check reads as not scanned, and the
 * panel states plainly that this is not a legal guarantee.
 */

type RightsPanelProps = {
  sourceLine: string;
  checkLines: string[];
  treatment: AudioTreatment;
  trackName: string | null;
  trackLicence: string | null;
  trackCredit: string | null;
  voiceoverOn: boolean;
  renderedTreatments: AudioTreatment[];
  attribution: string | null;
};

function treatmentLine(props: RightsPanelProps): string {
  if (props.treatment === "muted") {
    return props.voiceoverOn
      ? "Original audio muted — renders carry no original audio track. Voiceover narration, if enabled, still plays."
      : "Original audio muted — renders carry no original audio track.";
  }
  if (props.treatment === "replaced") {
    return `Original audio replaced with your licensed track: ${props.trackName ?? "unknown track"} (${props.trackLicence ?? "licence declared by you"}).`;
  }
  return "Original audio kept — renders carry the video's own audio.";
}

function renderedSummary(treatments: AudioTreatment[]): string | null {
  if (treatments.length === 0) return null;
  const counts = { original: 0, muted: 0, replaced: 0 };
  for (const t of treatments) counts[t] += 1;
  const parts: string[] = [];
  if (counts.original > 0)
    parts.push(`${counts.original} with original audio`);
  if (counts.muted > 0) parts.push(`${counts.muted} muted`);
  if (counts.replaced > 0) parts.push(`${counts.replaced} replaced`);
  return `Rendered so far: ${parts.join(", ")}.`;
}

export default function RightsPanel(props: RightsPanelProps) {
  const summary = renderedSummary(props.renderedTreatments);
  return (
    <div
      id="rights-panel"
      className="rounded-lg border border-border bg-background p-4"
    >
      <h3 className="font-semibold">Before you export — rights check</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="font-medium">Source</dt>
          <dd className="text-muted-foreground">{props.sourceLine}</dd>
        </div>
        <div>
          <dt className="font-medium">Music check</dt>
          {props.checkLines.map((line) => (
            <dd key={line} className="text-muted-foreground">
              {line}
            </dd>
          ))}
        </div>
        <div>
          <dt className="font-medium">Audio treatment</dt>
          <dd className="text-muted-foreground">
            {treatmentLine(props)}
          </dd>
          {summary && (
            <dd className="text-muted-foreground">{summary}</dd>
          )}
          {props.treatment === "replaced" && props.trackCredit && (
            <dd className="text-muted-foreground">
              Track credit shipping in the export: {props.trackCredit}
            </dd>
          )}
        </div>
        <div>
          <dt className="font-medium">Attribution shipping in the export</dt>
          <dd className="text-muted-foreground">
            {props.attribution ??
              "None yet — no licence or music credit applies."}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-muted-foreground">
        This lowers audio risk, but it is not a legal guarantee and
        does not make another person&apos;s video yours. AI editing
        does not remove copyright — safety comes from the source
        video.
      </p>
    </div>
  );
}
