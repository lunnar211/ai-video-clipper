"use client";

/**
 * Mandatory rights confirmation. The parent stores the choice in
 * sessionStorage (per browser session, never sent to the server) and
 * blocks transcription + rendering until it is checked.
 */
export default function RightsConsent({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 rounded-xl border border-primary/40 bg-muted p-4 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
        aria-label="I own or have licensed this video and its music"
      />
      <span>
        <strong>I own or have licensed this video and its music.</strong>{" "}
        Transcription and rendering stay blocked until you confirm this.
        If the video contains music you do not hold a licence for, use
        the music check below — a match warns you before export.
      </span>
    </label>
  );
}
