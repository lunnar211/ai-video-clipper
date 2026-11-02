/**
 * Fraud signals (ClipForge Phase 6).
 *
 * Pure velocity checks over audit-log billing entries: many
 * checkouts from one actor, or many users behind one IP, inside a
 * window. Flags are SIGNALS for the admin console, not verdicts —
 * nothing is auto-blocked on a flag alone. The admin route reads
 * recent billing.checkout audit entries and reports breaches; the
 * admin decides what to do (suspend lives in Phase 4).
 */

export type BillingAuditEntryLike = {
  actor: string;
  ip: string | null;
  created_at: string;
};

export type FraudFlag = {
  kind: "checkout_velocity_actor" | "checkout_velocity_ip";
  key: string;
  count: number;
  windowMinutes: number;
};

export function flagVelocity(
  entries: BillingAuditEntryLike[],
  opts: {
    windowMinutes?: number;
    maxPerActor?: number;
    maxPerIp?: number;
    nowMs?: number;
  } = {},
): FraudFlag[] {
  const windowMinutes = opts.windowMinutes ?? 60;
  const maxPerActor = opts.maxPerActor ?? 5;
  const maxPerIp = opts.maxPerIp ?? 5;
  const nowMs = opts.nowMs ?? Date.now();
  const cutoff = nowMs - windowMinutes * 60 * 1000;
  const recent = entries.filter(
    (e) => Date.parse(e.created_at) >= cutoff,
  );
  const flags: FraudFlag[] = [];
  const byActor = new Map<string, number>();
  const byIp = new Map<string, number>();
  for (const e of recent) {
    byActor.set(e.actor, (byActor.get(e.actor) ?? 0) + 1);
    if (e.ip) byIp.set(e.ip, (byIp.get(e.ip) ?? 0) + 1);
  }
  for (const [actor, count] of byActor) {
    if (count > maxPerActor) {
      flags.push({
        kind: "checkout_velocity_actor",
        key: actor,
        count,
        windowMinutes,
      });
    }
  }
  for (const [ip, count] of byIp) {
    if (count > maxPerIp) {
      flags.push({
        kind: "checkout_velocity_ip",
        key: ip,
        count,
        windowMinutes,
      });
    }
  }
  return flags;
}
