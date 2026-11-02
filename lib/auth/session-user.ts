/**
 * Signed-in user resolution for user-facing (non-admin) routes
 * (ClipForge Phase 8).
 *
 * Billing and project routes used to trust a caller-asserted userId
 * from the query string or request body, which lets any caller read
 * or mutate another user's billing data. These routes now resolve
 * the user from the Supabase session instead: the session cookie
 * proves who the caller is, and nothing the caller types can change
 * it. Never throws — a missing session or database resolves to null
 * and the route answers 401 (or keeps a documented guest path).
 */

import { createSupabaseServerClient } from "./supabase-server";

/** Supabase user id for the current session, or null. */
export async function getSessionUserId(): Promise<string | null> {
  let client;
  try {
    client = await createSupabaseServerClient();
  } catch {
    return null;
  }
  if (!client) return null;
  try {
    const { data } = await client.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}
