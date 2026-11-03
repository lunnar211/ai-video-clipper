"use client";

import { useState } from "react";
import {
  ROYALTY_FREE_SOURCES,
  LICENSED_TRACKS,
  TRACK_LICENCES,
  userTrackAttribution,
  type UserTrack,
} from "@/lib/music/tracks";

/**
 * Royalty-free music picker. Lists licensed-music sources with their
 * licence notes and lets the user upload a track they already hold a
 * licence for (the file stays in the browser). No audio is bundled or
 * downloaded by this site. The selected track is mixed into renders
 * at low volume by the render pipeline.
 */
export default function MusicPicker({
  selected,
  onSelect,
}: {
  selected: UserTrack | null;
  onSelect: (track: UserTrack | null) => void;
}) {
  const [licence, setLicence] = useState<string>(TRACK_LICENCES[0]);
  const [copied, setCopied] = useState(false);
  const attribution = selected ? userTrackAttribution(selected) : null;

  const copyAttribution = async () => {
    if (!attribution) return;
    try {
      await navigator.clipboard.writeText(attribution);
      setCopied(true);
    } catch {
      // Clipboard unavailable — the text stays visible for manual copy.
    }
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("audio/")) return;
    onSelect({ name: f.name, licence, url: URL.createObjectURL(f) });
  };

  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <p className="font-medium">Background music (optional)</p>
      <p className="mt-1 text-muted-foreground">
        This site ships no music. Pick a track from a royalty-free source
        below, or upload a track you already hold a licence for — it is
        mixed into renders at low volume. Never upload music you do not
        have rights to.
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer font-medium">
          Royalty-free sources + licence notes
        </summary>
        <ul className="mt-2 space-y-2">
          {ROYALTY_FREE_SOURCES.map((s) => (
            <li key={s.name}>
              <strong>{s.name}</strong> — {s.note}{" "}
              <span className="text-muted-foreground">{s.licenceNote}</span>
            </li>
          ))}
          {LICENSED_TRACKS.length > 0 && (
            <li>
              <strong>Built-in licensed tracks</strong>
              <ul className="list-disc pl-5">
                {LICENSED_TRACKS.map((t) => (
                  <li key={t.name}>
                    {t.name} — {t.licence}
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      </details>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col">
          Licence of the track you upload
          <select
            className="mt-1 rounded border border-border px-2 py-1"
            value={licence}
            onChange={(e) => setLicence(e.target.value)}
          >
            {TRACK_LICENCES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          Upload your licensed track
          <input
            className="mt-1"
            type="file"
            accept="audio/*"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        {selected && (
          <button
            type="button"
            className="rounded border border-border px-3 py-1.5"
            onClick={() => onSelect(null)}
          >
            Remove track
          </button>
        )}
      </div>
      {selected && (
        <p className="mt-2 text-muted-foreground">
          Selected: {selected.name} — licence: {selected.licence}
        </p>
      )}
      {attribution && (
        <div className="mt-2 rounded-lg bg-muted p-3">
          <p className="text-muted-foreground">
            Attribution required — include this credit with the clip:
          </p>
          <p className="mt-1 font-medium text-foreground">{attribution}</p>
          <button
            type="button"
            className="mt-2 rounded border border-border px-3 py-1.5"
            onClick={copyAttribution}
          >
            {copied ? "Copied" : "Copy attribution"}
          </button>
          <p className="mt-1 text-muted-foreground">
            The same text is written into the ZIP export as
            ATTRIBUTION.txt.
          </p>
        </div>
      )}
    </div>
  );
}
