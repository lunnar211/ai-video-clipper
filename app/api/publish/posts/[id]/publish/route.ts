import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { prePublishDraftSchema } from "@/lib/rights/policy";
import { getChecklistRow } from "@/lib/rights/checklist";
import { isPublishingPaused } from "@/lib/rights/strikes";
import { buildPublishGates } from "@/lib/publish/gates";
import {
  publishOneTarget,
  type PlatformUploader,
} from "@/lib/publish/publisher";
import { uploadYoutubeShort } from "@/lib/publish/adapters/youtube";
import { stubUploader } from "@/lib/publish/adapters/stubs";
import {
  resolveOAuthConfig,
  refreshAccessToken,
} from "@/lib/publish/oauth";
import {
  createEnvTokenCrypto,
  tokenNeedsRefresh,
} from "@/lib/publish/tokens";
import {
  resolvePublishDb,
  getPostRow,
  getAccountRow,
  listTargetRows,
  updateTargetRow,
  updatePostStatus,
  updateAccountTokens,
} from "@/lib/publish/store";
import { resolveStorage } from "@/lib/storage/r2";
import {
  deleteTempMediaNow,
  TEMP_MEDIA_PREFIX,
} from "@/lib/publish/tempmedia";
import { notifyPublishFailure } from "@/lib/publish/notify";
import { scheduleAudit } from "@/lib/admin/audit";
import { dispatchEventSafe } from "@/lib/integrations/dispatch";
import { makeDomainEvent } from "@/lib/integrations/events";
import { isViewAsRequest } from "@/lib/admin/impersonation";

export const runtime = "nodejs";

const publishBodySchema = z.object({
  clipFacts: z.object({
    durationSec: z.number().positive(),
    sizeBytes: z.number().nonnegative(),
    aspect: z.string().min(1).max(10),
  }),
});

function uploaderFor(platform: string): PlatformUploader {
  if (platform === "youtube") {
    return {
      upload: async (input) => uploadYoutubeShort(input),
    };
  }
  return stubUploader(platform as never);
}

/**
 * Publish a post now (ClipForge Phase 3).
 *
 * Re-enforces every gate (platform approval, limits, checklist,
 * pause, pre-publish verdict), then publishes each pending target
 * with idempotency + retries. Already-published posts return their
 * current status (idempotent). Temp media is deleted only when every
 * target published — a failed target keeps its media for retry.
 * Without a database, storage, or token key, 503 honestly.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  // View-as sessions are read-only: an admin viewing as a user may
  // never publish as that user.
  if (isViewAsRequest(req)) {
    return NextResponse.json(
      { error: "View-as sessions are read-only and cannot publish." },
      { status: 403 },
    );
  }
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const parsed = publishBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid publish request.", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const clipFacts = parsed.data.clipFacts;
  const db = resolvePublishDb();
  if (!db) {
    return NextResponse.json(
      { error: "Publishing needs database setup." },
      { status: 503 },
    );
  }
  const post = await getPostRow(db, id);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }
  const existingTargets = await listTargetRows(db, id);
  if (post.status === "published") {
    return NextResponse.json({
      postId: post.id,
      status: post.status,
      targets: existingTargets,
    });
  }
  const crypto = createEnvTokenCrypto();
  if (!crypto) {
    return NextResponse.json(
      { error: "Token encryption is not configured." },
      { status: 503 },
    );
  }
  if (!post.media_key) {
    return NextResponse.json(
      {
        error:
          "This post has no staged media. Upload the clip via resumable " +
          "upload first, then retry.",
      },
      { status: 400 },
    );
  }
  const storage = resolveStorage();
  if (!storage) {
    return NextResponse.json(
      { error: "Media storage is not connected yet." },
      { status: 503 },
    );
  }
  let mediaBytes: Uint8Array;
  try {
    const url = await storage.presignedGet(post.media_key);
    const mediaRes = await fetch(url);
    if (!mediaRes.ok) {
      throw new Error(`Media fetch failed (HTTP ${mediaRes.status})`);
    }
    mediaBytes = new Uint8Array(await mediaRes.arrayBuffer());
  } catch {
    return NextResponse.json(
      { error: "Staged media could not be loaded." },
      { status: 502 },
    );
  }
  const checklist = post.checklist_post_ref
    ? await getChecklistRow(db, post.checklist_post_ref)
    : null;
  const prePublishParsed = post.pre_publish
    ? prePublishDraftSchema.safeParse(post.pre_publish)
    : null;
  const prePublish = prePublishParsed?.success
    ? prePublishParsed.data
    : null;
  let paused = false;
  if (post.user_id) {
    try {
      paused = await isPublishingPaused(post.user_id);
    } catch {
      return NextResponse.json(
        { error: "Pause lookup failed — try again." },
        { status: 502 },
      );
    }
  }
  const results = [];
  for (const target of existingTargets) {
    if (target.status === "published") {
      results.push(target);
      continue;
    }
    const account = await getAccountRow(db, target.account_id);
    if (!account) {
      await updateTargetRow(db, target.id, {
        status: "failed",
        error: "Account is no longer connected.",
      });
      results.push({ ...target, status: "failed" });
      continue;
    }
    const gates = buildPublishGates({
      platform: target.platform,
      clipFacts,
      checklistTicks: checklist ? checklist.ticks : null,
      paused,
      prePublish,
    });
    if (!gates.ok) {
      await updateTargetRow(db, target.id, {
        status: "refused",
        error: gates.reason,
      });
      results.push({ ...target, status: "refused", error: gates.reason });
      continue;
    }
    let accessToken: string;
    try {
      accessToken = crypto.decrypt(account.access_token_enc);
    } catch {
      await updateTargetRow(db, target.id, {
        status: "failed",
        error: "Stored tokens could not be decrypted.",
      });
      results.push({ ...target, status: "failed" });
      continue;
    }
    if (
      account.refresh_token_enc &&
      tokenNeedsRefresh(account.token_expires_at)
    ) {
      const config = resolveOAuthConfig(target.platform);
      if (config) {
        try {
          const refreshToken = crypto.decrypt(account.refresh_token_enc);
          const tokens = await refreshAccessToken(
            target.platform,
            config,
            refreshToken,
          );
          accessToken = tokens.accessToken;
          await updateAccountTokens(db, account.id, {
            access_token_enc: crypto.encrypt(tokens.accessToken),
            refresh_token_enc: tokens.refreshToken
              ? crypto.encrypt(tokens.refreshToken)
              : account.refresh_token_enc,
            token_expires_at: tokens.expiresInSec
              ? new Date(
                  Date.now() + tokens.expiresInSec * 1000,
                ).toISOString()
              : account.token_expires_at,
            token_key_id: crypto.keyId,
          });
        } catch {
          await updateTargetRow(db, target.id, {
            status: "failed",
            error: "Token refresh failed at the provider.",
          });
          results.push({ ...target, status: "failed" });
          continue;
        }
      }
    }
    const outcome = await publishOneTarget(
      {
        accessToken,
        title: target.title,
        description: target.description,
        tags: target.tags,
        visibility: target.visibility,
        mediaBytes,
      },
      { gates: { ok: true }, uploader: uploaderFor(target.platform) },
    );
    await updateTargetRow(db, target.id, {
      status: outcome.status,
      provider_post_id: outcome.providerPostId ?? null,
      provider_url: outcome.providerUrl ?? null,
      error: outcome.error ?? null,
      attempts: outcome.attempts,
    });
    if (outcome.status === "failed" && outcome.error) {
      await notifyPublishFailure(db, {
        userId: post.user_id,
        postId: post.id,
        platform: target.platform,
        error: outcome.error,
      });
    }
    results.push({
      ...target,
      status: outcome.status,
      provider_post_id: outcome.providerPostId ?? null,
      error: outcome.error ?? null,
      attempts: outcome.attempts,
    });
  }
  const finalTargets = await listTargetRows(db, id);
  const publishedCount = finalTargets.filter(
    (t) => t.status === "published",
  ).length;
  const nextStatus =
    publishedCount === finalTargets.length
      ? "published"
      : publishedCount > 0
        ? "partial"
        : "failed";
  await updatePostStatus(db, id, nextStatus);
  if (
    nextStatus === "published" &&
    post.media_key.startsWith(TEMP_MEDIA_PREFIX)
  ) {
    await deleteTempMediaNow(storage, post.media_key);
  }
  // Audit only: fully published or fully failed. A partial outcome
  // is visible in the queue/analytics, not as a single audit action.
  if (nextStatus === "published" || nextStatus === "failed") {
    scheduleAudit({
      actor: post.user_id ?? "guest",
      action: nextStatus === "published" ? "post.published" : "post.failed",
      target: post.id,
      metadata: {
        platforms: finalTargets.map((t) => t.platform),
        publishedCount,
      },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    // Phase 5: same event on the integration bus (webhook fan-out).
    // Swallowed on failure — never changes this response.
    void dispatchEventSafe(
      makeDomainEvent(
        nextStatus === "published" ? "post.published" : "post.failed",
        {
          targetId: post.id,
          actor: post.user_id ?? "guest",
          payload: {
            platforms: finalTargets.map((t) => t.platform),
            publishedCount,
          },
        },
      ),
    );
  }
  return NextResponse.json({
    postId: post.id,
    status: nextStatus,
    targets: finalTargets,
  });
}
