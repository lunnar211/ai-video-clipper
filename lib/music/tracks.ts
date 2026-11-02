/**
 * Royalty-free music: sources + the shape for the owner's own licensed
 * tracks. NO audio is bundled or downloaded by this site — the picker
 * lists where to get licensed music and lets the user upload a track
 * they already hold a licence for. The uploaded file stays in the
 * browser and is mixed into renders at low volume.
 *
 * To add a licensed track to the built-in list, the owner adds an
 * entry to LICENSED_TRACKS with its licence — only tracks he holds a
 * licence for, with the licence text kept alongside the entry.
 */

export type MusicSource = {
  name: string;
  note: string;
  licenceNote: string;
};

export const ROYALTY_FREE_SOURCES: MusicSource[] = [
  {
    name: "YouTube Audio Library",
    note: "Inside YouTube Studio, under Audio Library. Free tracks for videos, some require attribution.",
    licenceNote: "Licence varies per track — check the track's licence in Studio before use.",
  },
  {
    name: "Pixabay Music",
    note: "pixabay.com/music — free music for commercial use, no attribution required for most tracks.",
    licenceNote: "Pixabay Licence; check the individual track page for exceptions.",
  },
  {
    name: "FreePD",
    note: "freepd.com — public-domain music, free for any use including commercial.",
    licenceNote: "Public domain (CC0) unless a track page says otherwise.",
  },
  {
    name: "Bensound",
    note: "bensound.com — royalty-free tracks; free tier requires attribution, paid licence removes it.",
    licenceNote: "Bensound licence; the free tier requires an attribution credit.",
  },
];

export type LicensedTrack = {
  name: string;
  licence: string;
};

/** Built-in licensed tracks the owner has added. Empty until he adds his own. */
export const LICENSED_TRACKS: LicensedTrack[] = [];

export type UserTrack = {
  name: string;
  licence: string;
  url: string;
};

export const TRACK_LICENCES = [
  "CC0 (public domain)",
  "CC-BY (attribution required)",
  "Own licensed track",
  "Other — I hold a licence",
] as const;
