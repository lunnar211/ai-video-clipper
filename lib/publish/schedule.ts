/**
 * Scheduling helpers (ClipForge Phase 3).
 *
 * A scheduled post carries a UTC instant plus the timezone it was
 * scheduled in (for display). Validation is pure and testable: the
 * instant must parse, the timezone must be a real IANA name, and the
 * instant must be in the future.
 */

export type ScheduleCheck =
  | { ok: true; utcIso: string }
  | { ok: false; error: string };

/** Validate a schedule request. `now` is injectable for tests. */
export function validateSchedule(
  scheduleAt: string | null,
  timezone: string | null,
  now = Date.now(),
): ScheduleCheck {
  if (scheduleAt === null) {
    // No schedule = publish immediately.
    return { ok: true, utcIso: "" };
  }
  const parsed = Date.parse(scheduleAt);
  if (Number.isNaN(parsed)) {
    return { ok: false, error: "scheduleAt is not a valid date/time." };
  }
  if (timezone !== null) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      return { ok: false, error: `Unknown timezone: ${timezone}.` };
    }
  }
  if (parsed <= now) {
    return {
      ok: false,
      error: "scheduleAt must be in the future for a scheduled post.",
    };
  }
  return { ok: true, utcIso: new Date(parsed).toISOString() };
}

/** True when a scheduled post is due to publish. */
export function isDue(
  scheduleAt: string | null,
  status: string,
  now = Date.now(),
): boolean {
  if (status !== "scheduled" || scheduleAt === null) return false;
  const parsed = Date.parse(scheduleAt);
  return !Number.isNaN(parsed) && parsed <= now;
}
