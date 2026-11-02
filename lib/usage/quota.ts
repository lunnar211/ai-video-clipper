/**
 * Free-tier quota + watermark rules (Phase 3).
 *
 * Free tier: 3 rendered clips per day. Without a configured database
 * the count lives in the browser (localStorage, per calendar day), so
 * it is a fair-use guard, not a hard server gate — the server-side
 * count arrives with the Phase 3 database once the owner applies the
 * schema. Signed-out users and free users get a watermark; paid users
 * do not (paid tier resolution needs the database + billing webhook).
 */

export const FREE_CLIPS_PER_DAY = 3;

export type Tier = "free" | "pro";

const STORAGE_KEY = "clipper-usage";

/** Local calendar day key, e.g. "2026-11-02". Pure + tested. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type UsageMap = Record<string, number>;

function readUsage(): UsageMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as UsageMap;
    return {};
  } catch {
    return {};
  }
}

function writeUsage(map: UsageMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable — quota is not enforced in this browser.
  }
}

export function clipsUsedToday(now = new Date()): number {
  return readUsage()[dayKey(now)] ?? 0;
}

export function canRenderToday(now = new Date()): boolean {
  return clipsUsedToday(now) < FREE_CLIPS_PER_DAY;
}

export function recordRenderToday(now = new Date()): void {
  const map = readUsage();
  const key = dayKey(now);
  map[key] = (map[key] ?? 0) + 1;
  writeUsage(map);
}

/** Free and signed-out renders carry the watermark; pro renders do not. */
export function shouldWatermark(tier: Tier): boolean {
  return tier === "free";
}
