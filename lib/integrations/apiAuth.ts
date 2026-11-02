/**
 * Public API authentication (ClipForge Phase 5).
 *
 * Resolves a v1/MCP caller from an API key: extract the secret,
 * look up the row by prefix, verify the hash timing-safely, reject
 * revoked keys, enforce the required scope, and apply the per-key
 * rate limit. Returns either an authenticated key (with its owner)
 * or a ready-made error. Last-used tracking is fire-and-forget and
 * never breaks a call.
 */

import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  apiKeyHashMatches,
  apiKeyPrefixFor,
  apiKeyRateLimitPerMinute,
  extractApiKeySecret,
  scopeSatisfies,
  type ApiKeyScope,
} from "./apikeys";
import {
  findApiKeyByPrefix,
  resolveIntegrationDb,
  touchApiKeyLastUsed,
  type ApiKeyRow,
} from "./store";

export type ApiAuth =
  | { key: ApiKeyRow; errorResponse: null }
  | { key: null; errorResponse: Response };

export async function apiKeyAuth(
  req: Request,
  requiredScope: ApiKeyScope,
): Promise<ApiAuth> {
  const db = resolveIntegrationDb();
  if (!db) {
    return {
      key: null,
      errorResponse: NextResponse.json(
        { error: "The integrations database is not configured yet." },
        { status: 503 },
      ),
    };
  }
  const secret = extractApiKeySecret(req);
  if (!secret || !secret.startsWith("cf_")) {
    return {
      key: null,
      errorResponse: NextResponse.json(
        { error: "Provide a valid API key." },
        { status: 401 },
      ),
    };
  }
  let row: ApiKeyRow | null;
  try {
    row = await findApiKeyByPrefix(db, apiKeyPrefixFor(secret));
  } catch {
    return {
      key: null,
      errorResponse: NextResponse.json(
        { error: "API key lookup failed." },
        { status: 500 },
      ),
    };
  }
  if (!row || row.revoked_at) {
    return {
      key: null,
      errorResponse: NextResponse.json(
        { error: "Invalid or revoked API key." },
        { status: 401 },
      ),
    };
  }
  if (!apiKeyHashMatches(secret, row.key_hash)) {
    return {
      key: null,
      errorResponse: NextResponse.json(
        { error: "Invalid API key." },
        { status: 401 },
      ),
    };
  }
  const scopes = (Array.isArray(row.scopes) ? row.scopes : []) as ApiKeyScope[];
  if (!scopeSatisfies(scopes, requiredScope)) {
    return {
      key: null,
      errorResponse: NextResponse.json(
        { error: "This API key lacks the required scope." },
        { status: 403 },
      ),
    };
  }
  if (
    !checkRateLimit(
      `apikey:${row.id}`,
      apiKeyRateLimitPerMinute(),
      60_000,
    )
  ) {
    return {
      key: null,
      errorResponse: NextResponse.json(
        { error: "API key rate limit reached — try again in a minute." },
        { status: 429 },
      ),
    };
  }
  void touchApiKeyLastUsed(db, row.id);
  return { key: row, errorResponse: null };
}
