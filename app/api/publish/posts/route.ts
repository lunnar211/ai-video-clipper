import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { PLATFORM_IDS } from "@/lib/publish/platforms";
import { prePublishDraftSchema } from "@/lib/rights/policy";
import { getChecklistRow } from "@/lib/rights/checklist";
import { isPublishingPaused } from "@/lib/rights/strikes";
import { buildPublishGates } from "@/lib/publish/gates";
import { idempotencyKeyFor } from "@/lib/publish/publisher";
import { validateSchedule } from "@/lib/publish/schedule";
import {
  resolvePublishDb,
  createPostRow,
  createTargetRows,
  listPostRows,
  listTargetRows,
} from "@/lib/publish/store";
import { scheduleAudit } from "@/lib/admin/audit";
import { dispatchEventSafe } from "@/lib/integrations/dispatch";
import { makeDomainEvent } from "@/lib/integrations/events";
import { isViewAsRequest } from "@/lib/admin/impersonation";
import { getSessionUserId } from "@/lib/auth/session-user";
import {
  getUserPlan,
  listLedgerByUser,
  resolveBillingDb,
} from "@/lib/billing/store";
import { monthlyConsumption } from "@/lib/billing/metering";
import {
  checkMinutesGate,
  checkTargetsGate,
  gateRefusalMessage,
  minutesForClip,
} from "@/lib/billing/gates";

export const runtime = "nodejs";

const targetSchema = z.object({
  platform: z.enum(PLATFORM_IDS),
  accountId: z.string().min(1).max(200),
  title: z.string().max(100).nullable().optional(),
  description: z.string().min(1).max(5000),
  tags: z.array(z.string().max(40)).max(20).default([]),
  visibility: z.enum(["public", "unlisted", "private"]).default("unlisted"),
});

const createPostSchema = z.object({
  clipRef: z.string().min(1).max(200),
  projectId: z.string().min(1).max(200),
  mediaKey: z.string().max(500).nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  userId: z.string().max(200).nullable().optional(),
  /** Post ref of the Phase 2 checklist record for this post. */
  checklistPostRef: z.string().min(1).max(200),
  scheduleAt: z.string().max(100).nullable().optional(),
  timezone: z.string().max(100).nullable().optional(),
  clipFacts: z.object({
    durationSec: z.number().positive(),
    sizeBytes: z.number().nonnegative(),
    aspect: z.string().min(1).max(10),
  }),
  prePublish: prePublishDraftSchema,
  targets: z.array(targetSchema).min(1).max(10),
});

/**
 * Create a publish post (ClipForge Phase 3).
 *
 * Enforces every Phase 2 + platform gate BEFORE anything is stored:
 * checklist record complete, account not paused, schedule valid,
 * per-target platform approval + limits + pre-publish verdict. Any
 * failure refuses the whole post with a specific reason. Without a
 * database, 503 honestly — publishing needs database setup.
 */
export async function POST(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  // View-as sessions are read-only: an admin viewing as a user may
  // never create a post as that user.
  if (isViewAsRequest(req)) {
    return NextResponse.json(
      { error: "View-as sessions are read-only and cannot create posts." },
      { status: 403 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const parsed = createPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid post.", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const db = resolvePublishDb();
  if (!db) {
    return NextResponse.json(
      { error: "Publishing needs database setup." },
      { status: 503 },
    );
  }
  const checklist = await getChecklistRow(db, data.checklistPostRef);
  if (!checklist) {
    return NextResponse.json(
      {
        error:
          "Per-post compliance checklist not found for this post. " +
          "Complete the checklist first, then retry.",
      },
      { status: 400 },
    );
  }
  const schedule = validateSchedule(
    data.scheduleAt ?? null,
    data.timezone ?? null,
  );
  if (!schedule.ok) {
    return NextResponse.json({ error: schedule.error }, { status: 400 });
  }
  let paused = false;
  if (data.userId) {
    try {
      paused = await isPublishingPaused(data.userId);
    } catch {
      return NextResponse.json(
        { error: "Pause lookup failed — try again." },
        { status: 502 },
      );
    }
  }
  for (const target of data.targets) {
    const gates = buildPublishGates({
      platform: target.platform,
      clipFacts: data.clipFacts,
      checklistTicks: checklist.ticks,
      paused,
      prePublish: data.prePublish,
    });
    if (!gates.ok) {
      return NextResponse.json(
        { error: gates.reason, platform: target.platform },
        { status: 403 },
      );
    }
  }
  // Plan gate (Phase 8): when the caller is signed in and the
  // billing database resolves, the clip's minutes and the target
  // count are checked against the plan before anything is stored.
  // Guests pass through (no user to meter). Note: the post row
  // still carries the caller-supplied userId (legacy); binding
  // post ownership to the session is a follow-up slice.
  const sessionUserId = await getSessionUserId();
  const billingDb = resolveBillingDb();
  if (sessionUserId && billingDb) {
    const planId =
      (await getUserPlan(billingDb, sessionUserId).catch(() => null)) ??
      "free";
    const entries = await listLedgerByUser(billingDb, sessionUserId).catch(
      () => [],
    );
    const now = new Date();
    const used = monthlyConsumption(
      entries,
      now.getUTCFullYear(),
      now.getUTCMonth(),
    );
    const minutesGate = checkMinutesGate({
      planId,
      minutesUsedThisMonth: used,
      requestedMinutes: minutesForClip(data.clipFacts.durationSec),
    });
    if (!minutesGate.allowed) {
      return NextResponse.json(
        { error: gateRefusalMessage(minutesGate) },
        { status: 403 },
      );
    }
    const targetsGate = checkTargetsGate({
      planId,
      targetCount: data.targets.length,
    });
    if (!targetsGate.allowed) {
      return NextResponse.json(
        { error: gateRefusalMessage(targetsGate) },
        { status: 403 },
      );
    }
  }
  const post = await createPostRow(db, {
    user_id: data.userId ?? null,
    clip_ref: data.clipRef,
    project_id: data.projectId,
    media_key: data.mediaKey ?? null,
    title: data.title ?? null,
    schedule_at: schedule.utcIso || null,
    timezone: data.timezone ?? null,
    status: schedule.utcIso ? "scheduled" : "draft",
    pre_publish: data.prePublish,
    checklist_post_ref: data.checklistPostRef,
  });
  const targets = await createTargetRows(
    db,
    data.targets.map((target) => ({
      post_id: post.id,
      platform: target.platform,
      account_id: target.accountId,
      title: target.title ?? null,
      description: target.description,
      tags: target.tags,
      visibility: target.visibility,
      idempotency_key: idempotencyKeyFor(
        post.id,
        target.platform,
        target.accountId,
      ),
      status: "pending",
      provider_post_id: null,
      provider_url: null,
      error: null,
      attempts: 0,
    })),
  );
  // Audit only: a scheduled post (drafts are not audited actions).
  if (data.scheduleAt) {
    scheduleAudit({
      actor: data.userId ?? "guest",
      action: "post.scheduled",
      target: post.id,
      metadata: {
        platforms: data.targets.map((t) => t.platform),
      },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    // Phase 5: same event on the integration bus (webhook fan-out).
    // Swallowed on failure — never changes this response.
    void dispatchEventSafe(
      makeDomainEvent("post.scheduled", {
        targetId: post.id,
        actor: data.userId ?? "guest",
        payload: { platforms: data.targets.map((t) => t.platform) },
      }),
    );
  }
  return NextResponse.json({ post, targets }, { status: 201 });
}

/** List posts with their targets (status fields only, no tokens). */
export async function GET(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const db = resolvePublishDb();
  if (!db) {
    return NextResponse.json(
      { error: "Publishing needs database setup." },
      { status: 503 },
    );
  }
  const posts = await listPostRows(db);
  const withTargets = [];
  for (const post of posts) {
    withTargets.push({
      post,
      targets: await listTargetRows(db, post.id),
    });
  }
  return NextResponse.json({ posts: withTargets });
}
