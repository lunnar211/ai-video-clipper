/**
 * Generated-short formats + subtitle styles (ClipForge Phase 19).
 *
 * Formats are REAL output sizes, not a CSS letterbox: the composer
 * sizes its canvas from FORMAT_DIMENSIONS and crops each visual to
 * the matching aspect. Subtitle styles are REAL caption controls:
 * the composer draws the burned-in captions from the resolved style
 * — font, position, color, size, stroke, background — with the
 * Phase 17 look as the default, so existing shorts render exactly
 * as before when the user changes nothing.
 */

export type GeneratedFormat = "9:16" | "16:9" | "1:1";

export const FORMAT_DIMENSIONS: Record<
  GeneratedFormat,
  { width: number; height: number; label: string }
> = {
  "9:16": { width: 720, height: 1280, label: "Vertical 9:16" },
  "16:9": { width: 1280, height: 720, label: "Wide 16:9" },
  "1:1": { width: 720, height: 720, label: "Square 1:1" },
};

export const GENERATED_FORMATS: GeneratedFormat[] = ["9:16", "16:9", "1:1"];

export function isGeneratedFormat(value: string): value is GeneratedFormat {
  return (GENERATED_FORMATS as string[]).includes(value);
}

export type SubtitlePosition = "top" | "middle" | "bottom";
export type SubtitleBackground = "dark" | "light" | "none";

export type SubtitleStyle = {
  /** Canvas font stack (must be one of SUBTITLE_FONTS). */
  font: string;
  position: SubtitlePosition;
  /** Hex color, e.g. "#ffffff". */
  color: string;
  /** Point size at the 720px reference width; scaled with canvas. */
  size: number;
  /** Dark outline around the letters, for readability. */
  stroke: boolean;
  background: SubtitleBackground;
};

/** Phase 17's look, as the default: white sans text, bottom, dark box. */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  font: "system-ui, sans-serif",
  position: "bottom",
  color: "#ffffff",
  size: 46,
  stroke: false,
  background: "dark",
};

export const SUBTITLE_FONTS: Array<{ stack: string; label: string }> = [
  { stack: "system-ui, sans-serif", label: "Sans" },
  { stack: "Georgia, serif", label: "Serif" },
  { stack: "'Courier New', monospace", label: "Mono" },
  { stack: "'Trebuchet MS', sans-serif", label: "Casual" },
];

export const SUBTITLE_COLORS: Array<{ hex: string; label: string }> = [
  { hex: "#ffffff", label: "White" },
  { hex: "#fde047", label: "Yellow" },
  { hex: "#67e8f9", label: "Cyan" },
  { hex: "#bef264", label: "Lime" },
  { hex: "#f9a8d4", label: "Pink" },
  { hex: "#111111", label: "Black" },
];

export const SUBTITLE_BACKGROUNDS: Array<{
  id: SubtitleBackground;
  label: string;
}> = [
  { id: "dark", label: "Dark box" },
  { id: "light", label: "Light box" },
  { id: "none", label: "No box" },
];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Resolve a partial user choice into a full, safe style: unknown
 * fonts/positions/backgrounds fall back to the default, colors must
 * be 6-digit hex, sizes clamp to 28–72. Pure — unit-tested.
 */
export function resolveSubtitleStyle(
  partial: Partial<SubtitleStyle>,
): SubtitleStyle {
  const font = SUBTITLE_FONTS.some((f) => f.stack === partial.font)
    ? partial.font!
    : DEFAULT_SUBTITLE_STYLE.font;
  const position: SubtitlePosition =
    partial.position === "top" ||
    partial.position === "middle" ||
    partial.position === "bottom"
      ? partial.position
      : DEFAULT_SUBTITLE_STYLE.position;
  const color =
    partial.color && HEX_COLOR.test(partial.color)
      ? partial.color
      : DEFAULT_SUBTITLE_STYLE.color;
  const size =
    typeof partial.size === "number" && Number.isFinite(partial.size)
      ? Math.min(72, Math.max(28, Math.round(partial.size)))
      : DEFAULT_SUBTITLE_STYLE.size;
  const background: SubtitleBackground =
    partial.background === "dark" ||
    partial.background === "light" ||
    partial.background === "none"
      ? partial.background
      : DEFAULT_SUBTITLE_STYLE.background;
  return {
    font,
    position,
    color,
    stroke: partial.stroke === true,
    background,
    size,
  };
}

/** Stroke color that contrasts with the text color (for readability). */
export function strokeColorFor(textColor: string): string {
  const match = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(
    textColor,
  );
  if (!match) return "rgba(0,0,0,0.9)";
  const r = parseInt(match[1], 16) / 255;
  const g = parseInt(match[2], 16) / 255;
  const b = parseInt(match[3], 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? "rgba(0,0,0,0.9)" : "rgba(255,255,255,0.9)";
}

function backgroundFill(background: SubtitleBackground): string | null {
  if (background === "dark") return "rgba(0,0,0,0.68)";
  if (background === "light") return "rgba(255,255,255,0.85)";
  return null;
}

/**
 * Draw a styled caption on a canvas of the given size. Text wraps
 * to at most two lines (the rest is cut, never overflowed); the
 * font size scales with canvas width so captions keep their
 * relative size across 9:16, 16:9, and 1:1. Works with a real
 * CanvasRenderingContext2D and with a recording stub in tests.
 */
export function drawStyledCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  canvasWidth: number,
  canvasHeight: number,
  style: SubtitleStyle,
): void {
  const resolved = resolveSubtitleStyle(style);
  const scale = canvasWidth / 720;
  const fontSize = resolved.size * scale;
  const lineHeight = fontSize * 1.26;
  const padding = 18 * scale;
  const margin = 130 * scale;
  const maxWidth = canvasWidth - 80 * scale;

  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  ctx.font = `700 ${fontSize}px ${resolved.font}`;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
    if (lines.length === 2 && line) break;
  }
  if (lines.length < 2 && line) lines.push(line);
  if (lines.length === 0) return;

  const boxWidth = Math.min(
    maxWidth + padding * 2,
    Math.max(...lines.map((l) => ctx.measureText(l).width)) + padding * 2,
  );
  const boxHeight = lines.length * lineHeight + padding * 2;
  const x = (canvasWidth - boxWidth) / 2;
  const y =
    resolved.position === "top"
      ? margin
      : resolved.position === "middle"
        ? (canvasHeight - boxHeight) / 2
        : canvasHeight - boxHeight - margin;

  const fill = backgroundFill(resolved.background);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x, y, boxWidth, boxHeight, 18 * scale);
    ctx.fill();
  }
  ctx.font = `700 ${fontSize}px ${resolved.font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => {
    const cy = y + padding + lineHeight / 2 + i * lineHeight;
    if (resolved.stroke) {
      ctx.strokeStyle = strokeColorFor(resolved.color);
      ctx.lineWidth = Math.max(2, fontSize / 12);
      ctx.strokeText(l, canvasWidth / 2, cy);
    }
    ctx.fillStyle = resolved.color;
    ctx.fillText(l, canvasWidth / 2, cy);
  });
}
