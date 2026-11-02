/**
 * Admin dashboard aggregates (ClipForge Phase 4).
 *
 * Pure functions over rows the routes already fetched. Every number
 * comes from real aggregates — when a source table has no rows the
 * metric is 0 or empty, never invented. Revenue/MRR explicitly report
 * `mrrAvailable: false` until subscription data exists, because no
 * subscription table exists in this repo yet (Paddle webhooks are a
 * later slice, not faked here).
 */

import type { AuditEntry } from "./audit";

export type MinimalUser = {
  id: string;
  plan: string;
  created_at: string;
};

export type MinimalRenderJob = {
  status: string;
  created_at: string;
};

export type MinimalTarget = {
  platform: string;
  status: string;
  error: string | null;
};

export type MinimalStrike = {
  status: string;
  created_at: string;
};

export function distinctActors(
  entries: AuditEntry[],
  sinceMs: number,
): number {
  const actors = new Set<string>();
  for (const e of entries) {
    if (Date.parse(e.created_at) >= sinceMs) actors.add(e.actor);
  }
  return actors.size;
}

/** DAU (last 24h) / MAU (last 30d) from audit actors. */
export function dauMau(
  entries: AuditEntry[],
  nowMs = Date.now(),
): { dau: number; mau: number } {
  return {
    dau: distinctActors(entries, nowMs - 24 * 60 * 60 * 1000),
    mau: distinctActors(entries, nowMs - 30 * 24 * 60 * 60 * 1000),
  };
}

export type Funnel = {
  signups: number;
  firstClip: number;
  firstPublish: number;
  paid: number;
};

/** Funnel: signup → first clip → first publish → paid plan. */
export function funnel(
  users: MinimalUser[],
  entries: AuditEntry[],
): Funnel {
  const clipActors = new Set(
    entries.filter((e) => e.action === "clip.rendered").map((e) => e.actor),
  );
  const publishActors = new Set(
    entries.filter((e) => e.action === "post.published").map((e) => e.actor),
  );
  return {
    signups: users.length,
    firstClip: clipActors.size,
    firstPublish: publishActors.size,
    paid: users.filter((u) => u.plan === "pro").length,
  };
}

/** Queue health: render-job + publish-post counts by status. */
export function queueHealth(
  renderJobs: MinimalRenderJob[],
  posts: { status: string }[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const job of renderJobs) {
    const key = `render.${job.status}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  for (const post of posts) {
    const key = `post.${post.status}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** AI/provider cost from audit metadata cost_usd (0 when unrecorded). */
export function costByUser(entries: AuditEntry[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const e of entries) {
    const cost = (e.metadata as Record<string, unknown> | null)?.cost_usd;
    if (typeof cost === "number" && Number.isFinite(cost)) {
      totals[e.actor] = (totals[e.actor] ?? 0) + cost;
    }
  }
  return totals;
}

/** Cost grouped by feature family (action prefix before the dot). */
export function costByFeature(entries: AuditEntry[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const e of entries) {
    const cost = (e.metadata as Record<string, unknown> | null)?.cost_usd;
    if (typeof cost !== "number" || !Number.isFinite(cost)) continue;
    const feature = e.action.split(".")[0];
    totals[feature] = (totals[feature] ?? 0) + cost;
  }
  return totals;
}

/** Plan distribution + explicit MRR availability flag. */
export function revenue(users: MinimalUser[]): {
  planCounts: Record<string, number>;
  mrrAvailable: boolean;
  mrrUsd: number | null;
} {
  const planCounts: Record<string, number> = {};
  for (const u of users) planCounts[u.plan] = (planCounts[u.plan] ?? 0) + 1;
  return { planCounts, mrrAvailable: false, mrrUsd: null };
}

/** Publish success rate per platform from target rows. */
export function publishSuccessByPlatform(
  targets: MinimalTarget[],
): Record<string, { attempted: number; published: number; rate: number }> {
  const byPlatform: Record<string, { attempted: number; published: number }> = {};
  for (const t of targets) {
    const row = byPlatform[t.platform] ?? { attempted: 0, published: 0 };
    row.attempted += 1;
    if (t.status === "published") row.published += 1;
    byPlatform[t.platform] = row;
  }
  const out: Record<string, { attempted: number; published: number; rate: number }> = {};
  for (const [platform, row] of Object.entries(byPlatform)) {
    out[platform] = {
      ...row,
      rate: row.attempted === 0 ? 0 : row.published / row.attempted,
    };
  }
  return out;
}

/** Most frequent error strings across audit metadata + targets. */
export function topErrors(
  entries: AuditEntry[],
  targets: MinimalTarget[],
  limit = 10,
): { error: string; count: number }[] {
  const counts = new Map<string, number>();
  const bump = (value: unknown) => {
    if (typeof value === "string" && value.length > 0) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  };
  for (const e of entries) {
    bump((e.metadata as Record<string, unknown> | null)?.error);
  }
  for (const t of targets) bump(t.error);
  return [...counts.entries()]
    .map(([error, count]) => ({ error, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Strike/takedown counts by status. */
export function strikeStats(strikes: MinimalStrike[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of strikes) counts[s.status] = (counts[s.status] ?? 0) + 1;
  return counts;
}

export type Anomaly = {
  rule: string;
  severity: "warning" | "critical";
  detail: string;
};

/** Abuse/anomaly detection over audit rows (pure, threshold-driven). */
export function detectAnomalies(
  entries: AuditEntry[],
  volumeThresholdPerHour: number,
  ipUsersThreshold: number,
  nowMs = Date.now(),
): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const hourAgo = nowMs - 60 * 60 * 1000;
  const perUser = new Map<string, number>();
  const perIp = new Map<string, Set<string>>();
  for (const e of entries) {
    if (Date.parse(e.created_at) < hourAgo) continue;
    perUser.set(e.actor, (perUser.get(e.actor) ?? 0) + 1);
    if (e.ip) {
      const users = perIp.get(e.ip) ?? new Set<string>();
      users.add(e.actor);
      perIp.set(e.ip, users);
    }
  }
  for (const [actor, count] of perUser) {
    if (count > volumeThresholdPerHour) {
      anomalies.push({
        rule: "unusual_volume",
        severity: count > volumeThresholdPerHour * 3 ? "critical" : "warning",
        detail: `Actor ${actor} produced ${count} events in the last hour (threshold ${volumeThresholdPerHour}).`,
      });
    }
  }
  for (const [ip, users] of perIp) {
    if (users.size > ipUsersThreshold) {
      anomalies.push({
        rule: "many_accounts_per_ip",
        severity: "warning",
        detail: `IP ${ip} was used by ${users.size} distinct actors in the last hour (threshold ${ipUsersThreshold}).`,
      });
    }
  }
  return anomalies;
}
