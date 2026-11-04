import { randomUUID } from "node:crypto";
import {
  generateScript,
  splitCustomScript,
  resolveScriptLanguage,
  type GeneratedScript,
} from "@/lib/ai/script";
import { AI_NOT_CONNECTED, getKey, type FetchImpl } from "@/lib/ai/providers";
import {
  searchCommonsVideos,
  type CommonsSearchResult,
  type GeneratedVisual,
} from "@/lib/imports/cc-search";
import type { CcLicense } from "@/lib/imports/cc-types";
import { combineAttributionLines } from "@/lib/rights/attribution";
import { segmentsToSrt, segmentsToVtt } from "@/lib/captions";
import {
  FORMAT_DIMENSIONS,
  isGeneratedFormat,
  resolveSubtitleStyle,
  type GeneratedFormat,
  type SubtitleStyle,
} from "@/lib/browser/subtitles";

/**
 * AI-combo backend pipeline (ClipForge Phase 21).
 *
 * The same topic-to-short chain the /generate page runs in the
 * browser, as a server-side composition for automation: topic in
 * → AI script via the EXISTING Groq → Gemini → OpenRouter chain
 * → licence-verified Commons visuals via the EXISTING Phase 11
 * verifier → subtitle files → voiceover SLOT → render-job record
 * → post wiring. It reuses the repo's own library functions — the
 * route handlers for script/visuals are thin wrappers around these
 * same functions, so the pipeline cannot drift from what the UI
 * does. It never fetches video bytes from any platform: the
 * server reads search + licence metadata only, and the browser
 * (or the ffmpeg worker) loads the chosen file straight from the
 * source host.
 *
 * What this pipeline is NOT: a rendered video. Server-side
 * rendering is not available on Vercel, so the job record says
 * exactly that (status "needs_render") and hands off honestly to
 * the browser renderer or the ffmpeg worker. AI editing does not
 * remove copyright — every visual here is CC-licensed, and the
 * record carries its licence + source URL so the credit survives
 * to the export.
 *
 * Failure honesty: a script failure or a visuals-search failure
 * stops the run with a specific error kind — never a silent
 * fallback, never an invented output. Zero verified visuals for
 * a keyword is NOT a failure (the visuals route defines it as a
 * successful empty result with an honest note), so that segment
 * is recorded with a null visual and counted in
 * segmentsWithoutVisuals; the render step must fill it with
 * own footage before rendering.
 */

// One segment's window in the composed short. Must match
// GENERATED_WINDOW_SEC in lib/browser/render-generated.ts (the
// composer plays 5 seconds per segment); a test pins the two
// literals together so they cannot drift silently.
const SEGMENT_SECONDS = 5;

export type AiComboInput = {
  topic: string;
  customScript?: string;
  segmentCount?: number;
  language?: string;
  format?: GeneratedFormat;
  subtitleStyle?: Partial<SubtitleStyle>;
  voiceover?: boolean;
};

export type AiComboSegment = {
  text: string;
  visualKeyword: string;
  start: number;
  end: number;
  visual: GeneratedVisual | null;
  visualNote: string | null;
};

export type AiComboVoiceoverSlot =
  | { status: "not_requested" }
  | { status: "skipped"; reason: string }
  | {
      status: "pending_render";
      provider: "elevenlabs";
      textLength: number;
      note: string;
    };

export type AiComboJob = {
  jobId: string;
  status: "needs_render";
  topic: string;
  title: string;
  hashtags: string[];
  language: string;
  format: GeneratedFormat;
  width: number;
  height: number;
  subtitleStyle: SubtitleStyle;
  scriptProvider: string;
  segments: AiComboSegment[];
  segmentsWithoutVisuals: number;
  srt: string;
  vtt: string;
  attribution: string | null;
  voiceover: AiComboVoiceoverSlot;
  renderNote: string;
  post: {
    clipId: string;
    title: string;
    hashtags: string[];
    note: string;
  };
  provenance: {
    scriptProvider: string;
    visualLicenses: string[];
    sourceUrls: string[];
  };
};

export type AiComboErrorKind =
  | "invalid_input"
  | "ai_not_connected"
  | "script_failed"
  | "visuals_failed";

/** A pipeline failure with a stable kind the route maps to HTTP. */
export class AiComboError extends Error {
  kind: AiComboErrorKind;
  constructor(kind: AiComboErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export type AiComboDeps = {
  fetchFn?: FetchImpl;
  /**
   * Override for tests: replaces the Commons search step. The
   * default is the real searchCommonsVideos (search + exact
   * Phase 11 verification per candidate, fail closed).
   */
  searchVisuals?: (keyword: string) => Promise<CommonsSearchResult>;
};

const VOICEOVER_LIMIT = 500;

function validateInput(input: AiComboInput): {
  topic: string;
  segmentCount: number;
  format: GeneratedFormat;
} {
  const topic = input.topic?.trim() ?? "";
  if (topic.length < 1 || topic.length > 200) {
    throw new AiComboError(
      "invalid_input",
      "A topic of 1–200 characters is required.",
    );
  }
  if (input.customScript !== undefined && input.customScript.length > 2000) {
    throw new AiComboError(
      "invalid_input",
      "A custom script of at most 2000 characters is required.",
    );
  }
  const segmentCount = input.segmentCount ?? 4;
  if (!Number.isInteger(segmentCount) || segmentCount < 1 || segmentCount > 6) {
    throw new AiComboError(
      "invalid_input",
      "A segment count of 1–6 is required.",
    );
  }
  const format = input.format ?? "9:16";
  if (!isGeneratedFormat(format)) {
    throw new AiComboError(
      "invalid_input",
      "A format of 9:16, 16:9, or 1:1 is required.",
    );
  }
  return { topic, segmentCount, format };
}

/**
 * Run the full AI-combo chain and return the render-job record.
 * No video bytes are produced, fetched, or stored by this
 * function — see AiComboJob.renderNote for the honest handoff.
 */
export async function runAiComboPipeline(
  input: AiComboInput,
  deps: AiComboDeps = {},
): Promise<AiComboJob> {
  const fetchFn = deps.fetchFn ?? fetch;
  const searchVisuals =
    deps.searchVisuals ?? ((keyword: string) => searchCommonsVideos(keyword, { fetchFn }));
  const { topic, segmentCount, format } = validateInput(input);
  const language = resolveScriptLanguage(input.language);
  const subtitleStyle = resolveSubtitleStyle(input.subtitleStyle ?? {});

  // Step 1 — script. Custom scripts split locally with no AI
  // call; AI scripts go through the existing chain (no provider
  // → AI_NOT_CONNECTED, unusable output → an Error). Nothing is
  // ever invented when the AI fails.
  let script: GeneratedScript;
  let scriptProvider: string;
  if (input.customScript && input.customScript.trim()) {
    const split = splitCustomScript(input.customScript);
    if (!split) {
      throw new AiComboError(
        "invalid_input",
        "That custom script has no usable lines.",
      );
    }
    script = split;
    scriptProvider = "custom";
  } else {
    try {
      const generated = await generateScript(
        topic,
        segmentCount,
        fetchFn,
        language,
      );
      script = generated.script;
      scriptProvider = generated.provider;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Script failed";
      if (message === AI_NOT_CONNECTED) {
        throw new AiComboError("ai_not_connected", AI_NOT_CONNECTED);
      }
      throw new AiComboError("script_failed", `Script generation failed: ${message}`);
    }
  }

  // Step 2 — licence-verified visuals, one per segment. A search
  // failure stops the run; zero verified candidates is recorded
  // as a gap (the visuals route's own contract), never papered
  // over with an unverified file.
  const segments: AiComboSegment[] = [];
  for (let i = 0; i < script.segments.length; i += 1) {
    const segment = script.segments[i];
    const result = await searchVisuals(segment.visualKeyword);
    if (!result.ok) {
      throw new AiComboError("visuals_failed", result.message);
    }
    const visual = result.visuals[0] ?? null;
    segments.push({
      text: segment.text,
      visualKeyword: segment.visualKeyword,
      start: i * SEGMENT_SECONDS,
      end: (i + 1) * SEGMENT_SECONDS,
      visual,
      visualNote: visual
        ? null
        : (result.note ??
          "No free-licence video found for this keyword — upload your own footage for this segment."),
    });
  }
  const segmentsWithoutVisuals = segments.filter((s) => !s.visual).length;

  // Step 3 — subtitle files from the same 5-second windows the
  // browser composer plays. Identical builders to the exports.
  const totalDuration = segments.length * SEGMENT_SECONDS;
  const transcript = segments.map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text,
  }));
  const srt = segmentsToSrt(transcript, 0, totalDuration);
  const vtt = segmentsToVtt(transcript, 0, totalDuration);

  // Step 4 — voiceover SLOT. The pipeline never synthesises audio
  // and never stores audio bytes: when a key is present the slot
  // is reserved for render time (the existing voiceover route
  // generates the audio then); when absent the step records the
  // skip and the pipeline continues. A script longer than the
  // voiceover route's 500-character limit is skipped for the
  // same reason — truncating narration mid-sentence would be a
  // silent loss, so the record says so instead.
  const joinedText = segments.map((s) => s.text).join(" ");
  let voiceover: AiComboVoiceoverSlot;
  if (!input.voiceover) {
    voiceover = { status: "not_requested" };
  } else if (!getKey("ELEVENLABS_API_KEY")) {
    voiceover = {
      status: "skipped",
      reason: "voiceover skipped — key not configured",
    };
  } else if (joinedText.length > VOICEOVER_LIMIT) {
    voiceover = {
      status: "skipped",
      reason: `voiceover skipped — script exceeds the ${VOICEOVER_LIMIT}-character voiceover limit`,
    };
  } else {
    voiceover = {
      status: "pending_render",
      provider: "elevenlabs",
      textLength: joinedText.length,
      note: "Generate the audio at render time via POST /api/clips/voiceover — no audio bytes are stored in this job record.",
    };
  }

  // Step 5 — render-job record. Deliberately NOT a video: Vercel
  // cannot run the ffmpeg render, so the record hands off to the
  // browser renderer (which consumes exactly these segments,
  // visuals, format, and subtitle style) or to the ffmpeg worker
  // once its host exists. Nothing here claims a render happened.
  const dimensions = FORMAT_DIMENSIONS[format];
  const attribution = combineAttributionLines([
    ...segments
      .map((s) => s.visual?.attribution ?? null)
      .filter((line): line is string => line !== null),
    `Script: AI-generated script (provider: ${scriptProvider}) — this record does not grant rights in anyone else's material.`,
  ]);
  const jobId = randomUUID();
  const renderNote =
    "No video has been produced. Server-side rendering is not available on Vercel, so this job is a record only: render it in the browser renderer (the /generate flow consumes exactly these segments, visuals, format, and subtitle style) or forward it to the ffmpeg worker (WORKER_URL + WORKER_AUTH_SECRET) once that host exists. AI editing does not remove copyright — these visuals are CC-licensed or user-uploaded only.";
  return {
    jobId,
    status: "needs_render",
    topic,
    title: script.title,
    hashtags: script.hashtags,
    language,
    format,
    width: dimensions.width,
    height: dimensions.height,
    subtitleStyle,
    scriptProvider,
    segments,
    segmentsWithoutVisuals,
    srt,
    vtt,
    attribution,
    voiceover,
    renderNote,
    post: {
      clipId: `ai-combo-${jobId}`,
      title: script.title,
      hashtags: script.hashtags,
      note: "Nothing has been posted. When the rendered short is shared, record the outcome via POST /api/post-activity with this clip id — the outcome is never 'published', because only the platform itself can confirm a live post.",
    },
    provenance: {
      scriptProvider,
      visualLicenses: segments
        .map((s) => s.visual?.license)
        .filter((license): license is CcLicense => license !== undefined),
      sourceUrls: segments
        .map((s) => s.visual?.sourceUrl)
        .filter((url): url is string => url !== undefined),
    },
  };
}
