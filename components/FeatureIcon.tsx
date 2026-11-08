/**
 * Feature icons (ClipForge Phase 23).
 *
 * Original 24×24 line icons drawn for the homepage feature grid —
 * one per feature, ink stroke with no fill, so the grid stops
 * reading as ten identical text cards. No emoji, no stock icons,
 * no copied icon sets: each path is drawn here for this site.
 * Mapped by feature title in app/page.tsx; an unknown title gets
 * the generic clip mark rather than nothing.
 */

const PATHS: Record<string, React.ReactNode> = {
  // Waveform bars: AI listening for the moments.
  "AI finds the moments": (
    <>
      <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10v4" />
    </>
  ),
  // Caption lines with a highlighted spoken word.
  "Word-level captions": (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 10h6M7 13.5h10" />
      <path d="M7 17h4" strokeWidth="2.5" />
    </>
  ),
  // 9:16 frame, face circle centered, corner crop marks.
  "Face-centered vertical crop": (
    <>
      <rect x="8" y="3" width="8" height="18" rx="1.5" />
      <circle cx="12" cy="10" r="2.5" />
      <path d="M8.5 16.5c.8-1.2 2-1.8 3.5-1.8s2.7.6 3.5 1.8" />
      <path d="M3 6v3M3 6h3M21 6v3M21 6h-3M3 18v-3M3 18h3M21 18v-3M21 18h-3" />
    </>
  ),
  // Globe with meridians: captions across languages.
  "Captions in 28 languages": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.8 2.6 4 5.6 4 9s-1.2 6.4-4 9c-2.8-2.6-4-5.6-4-9s1.2-6.4 4-9Z" />
    </>
  ),
  // Framed still with a sun and a ridge: the best frame.
  "Thumbnails that fit the clip": (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M4.5 17.5 10 12l3.5 3.5L16 13l4.5 4.5" />
    </>
  ),
  // Share nodes: a link passed on, with its own count.
  "Share links with real view counts": (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.2 10.8 15.8 7.2M8.2 13.2l7.6 3.6" />
    </>
  ),
  // One render out to three platforms.
  "Multi-platform export": (
    <>
      <path d="M12 3v10M8.5 9.5 12 13l3.5-3.5" />
      <path d="M4 15v4a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-4" />
    </>
  ),
  // Calendar with a clock hand: scheduled posts.
  "Schedule and queue posts": (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <circle cx="12" cy="15.5" r="3.2" />
      <path d="M12 13.8v1.7l1.2 1" />
    </>
  ),
  // Chat bubble with three dots: the assistant.
  "Chat-driven clip tools (MCP)": (
    <>
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4V6Z" />
      <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" strokeWidth="2.5" />
    </>
  ),
  // Magnifier over a line of text: search by what was said.
  "Search your own clips": (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
      <path d="M8 11h6" />
    </>
  ),
};

function ClipMark() {
  return (
    <>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 9.5 15 12l-6 2.5v-5Z" />
    </>
  );
}

export default function FeatureIcon({
  title,
  className = "h-6 w-6",
}: {
  title: string;
  className?: string;
}) {
  // The language count in this title is derived from the
  // translation list, so it can change — match by prefix.
  const key = title.startsWith("Captions in")
    ? "Captions in 28 languages"
    : title;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {PATHS[key] ?? <ClipMark />}
    </svg>
  );
}
