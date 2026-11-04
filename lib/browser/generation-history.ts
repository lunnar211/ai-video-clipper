import type {
  GeneratedFormat,
  SubtitleStyle,
} from "@/lib/browser/subtitles";
import { DEFAULT_SUBTITLE_STYLE } from "@/lib/browser/subtitles";
import type { CcLicense } from "@/lib/imports/cc-types";

/**
 * Generation history (ClipForge Phase 19).
 *
 * Every rendered short is recorded in the browser (localStorage)
 * so the user can reopen it: topic, title, segments, format,
 * language, and subtitle style come back, and licence-verified
 * visuals come back too (their file URLs persist). A user's own
 * uploaded footage does NOT survive — a blob URL dies with the
 * page — so reopened upload segments come back marked
 * "upload again", never with a broken link.
 *
 * Honestly labelled in the UI: this record lives on this device
 * only. Signed-in users additionally see their server project
 * records (titles + dates from GET /api/projects), which carry
 * no segment detail and therefore cannot be reopened — the UI
 * says exactly that. Full server-side generation history would
 * need a new table + migration; that is a later slice, not
 * something this file pretends to do.
 */

export type HistoryVisual =
  | {
      kind: "cc";
      fileUrl: string;
      title: string;
      license: CcLicense;
      attribution: string;
      sourceUrl: string;
    }
  | { kind: "upload"; name: string };

export type HistorySegment = {
  text: string;
  visualKeyword: string;
  visual: HistoryVisual | null;
};

export type GenerationHistoryEntry = {
  id: string;
  createdAt: string;
  topic: string;
  title: string;
  hashtags: string[];
  language: string;
  format: GeneratedFormat;
  subtitleStyle: SubtitleStyle;
  segments: HistorySegment[];
  attribution: string;
};

export const HISTORY_KEY = "clipper-generate-history";
export const HISTORY_MAX_ENTRIES = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validSegment(value: unknown): HistorySegment | null {
  if (!isRecord(value)) return null;
  if (typeof value.text !== "string" || typeof value.visualKeyword !== "string") {
    return null;
  }
  let visual: HistoryVisual | null = null;
  if (isRecord(value.visual)) {
    if (
      value.visual.kind === "cc" &&
      typeof value.visual.fileUrl === "string" &&
      typeof value.visual.title === "string" &&
      (value.visual.license === "CC-BY" ||
        value.visual.license === "CC-BY-SA" ||
        value.visual.license === "CC0" ||
        value.visual.license === "public-domain") &&
      typeof value.visual.attribution === "string" &&
      typeof value.visual.sourceUrl === "string"
    ) {
      visual = {
        kind: "cc",
        fileUrl: value.visual.fileUrl,
        title: value.visual.title,
        license: value.visual.license,
        attribution: value.visual.attribution,
        sourceUrl: value.visual.sourceUrl,
      };
    } else if (
      value.visual.kind === "upload" &&
      typeof value.visual.name === "string"
    ) {
      visual = { kind: "upload", name: value.visual.name };
    }
  }
  return { text: value.text, visualKeyword: value.visualKeyword, visual };
}

function validEntry(value: unknown): GenerationHistoryEntry | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.topic !== "string" ||
    typeof value.title !== "string" ||
    !Array.isArray(value.hashtags) ||
    !value.hashtags.every((h) => typeof h === "string") ||
    typeof value.language !== "string" ||
    (value.format !== "9:16" && value.format !== "16:9" && value.format !== "1:1") ||
    !Array.isArray(value.segments) ||
    value.segments.length === 0 ||
    typeof value.attribution !== "string"
  ) {
    return null;
  }
  const segments: HistorySegment[] = [];
  for (const s of value.segments) {
    const valid = validSegment(s);
    if (!valid) return null;
    segments.push(valid);
  }
  const style = isRecord(value.subtitleStyle) ? value.subtitleStyle : {};
  return {
    id: value.id,
    createdAt: value.createdAt,
    topic: value.topic,
    title: value.title,
    hashtags: value.hashtags as string[],
    language: value.language,
    format: value.format,
    subtitleStyle: {
      font:
        typeof style.font === "string"
          ? style.font
          : DEFAULT_SUBTITLE_STYLE.font,
      position:
        style.position === "top" ||
        style.position === "middle" ||
        style.position === "bottom"
          ? style.position
          : DEFAULT_SUBTITLE_STYLE.position,
      color:
        typeof style.color === "string"
          ? style.color
          : DEFAULT_SUBTITLE_STYLE.color,
      size:
        typeof style.size === "number"
          ? style.size
          : DEFAULT_SUBTITLE_STYLE.size,
      stroke: style.stroke === true,
      background:
        style.background === "dark" ||
        style.background === "light" ||
        style.background === "none"
          ? style.background
          : DEFAULT_SUBTITLE_STYLE.background,
    },
    segments,
    attribution: value.attribution,
  };
}

/** Load the history, dropping malformed entries. Never throws. */
export function loadHistory(): GenerationHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const entries: GenerationHistoryEntry[] = [];
    for (const item of parsed) {
      const entry = validEntry(item);
      if (entry) entries.push(entry);
    }
    return entries;
  } catch {
    return [];
  }
}

/** Record a generation, newest first, capped at 20. Never throws. */
export function recordGeneration(entry: GenerationHistoryEntry): void {
  try {
    const entries = [entry, ...loadHistory()].slice(0, HISTORY_MAX_ENTRIES);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // Storage unavailable — history is a convenience, not a gate.
  }
}
