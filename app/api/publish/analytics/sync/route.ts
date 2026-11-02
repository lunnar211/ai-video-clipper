import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
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
  listTargetRows,
  listPostRows,
  getAccountRow,
  updateAccountTokens,
  upsertAnalyticsRow,
} from "@/lib/publish/store";
import { syncTargetAnalytics } from "@/lib/publish/analytics";

export const runtime = "nodejs";

const syncSchema = z.object({
  targetId: z.string().max(200).nullable().optional(),
});

/**
 * Sync post-publish analytics (ClipForge Phase 3).
 *
 * For each published target (or one target when targetId is given):
 * refresh the account token if needed, fetch the platform's stats,
 * and upsert one unified row. Platforms without an analytics adapter
 * are listed as unsupported — never invented.
 */
export async function POST(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = syncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid sync request.", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const db = resolvePublishDb();
  if (!db) {
    return NextResponse.json(
      { error: "Publishing needs database setup." },
      { status: 503 },
    );
  }
  const crypto = createEnvTokenCrypto();
  if (!crypto) {
    return NextResponse.json(
      { error: "Token encryption is not configured." },
      { status: 503 },
    );
  }
  const posts = await listPostRows(db);
  const targets = [];
  for (const post of posts) {
    const rows = await listTargetRows(db, post.id);
    for (const target of rows) {
      if (target.status !== "published" || !target.provider_post_id) {
        continue;
      }
      if (parsed.data.targetId && target.id !== parsed.data.targetId) {
        continue;
      }
      targets.push({ post, target });
    }
  }
  let synced = 0;
  const unsupported: string[] = [];
  const errors: string[] = [];
  for (const { post, target } of targets) {
    const account = await getAccountRow(db, target.account_id);
    if (!account) {
      errors.push(`Target ${target.id}: account no longer connected.`);
      continue;
    }
    let accessToken: string;
    try {
      accessToken = crypto.decrypt(account.access_token_enc);
    } catch {
      errors.push(`Target ${target.id}: tokens could not be decrypted.`);
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
          errors.push(`Target ${target.id}: token refresh failed.`);
          continue;
        }
      }
    }
    if (!target.provider_post_id) {
      unsupported.push(`${target.platform}: no provider post id recorded.`);
      continue;
    }
    const result = await syncTargetAnalytics(
      target.platform,
      target.provider_post_id,
      accessToken,
    );
    if (!result.supported) {
      unsupported.push(`${target.platform}: ${result.reason}`);
      continue;
    }
    await upsertAnalyticsRow(db, {
      post_id: post.id,
      target_id: target.id,
      platform: target.platform,
      views: result.stats.views,
      likes: result.stats.likes,
      comments: result.stats.comments,
    });
    synced += 1;
  }
  return NextResponse.json({ synced, unsupported, errors });
}
