/**
 * Admin role checks (ClipForge Phase 2).
 *
 * Roles live on the clipper_users row (migration 002 adds `role`).
 * The owner assigns admin/owner roles directly in the Supabase
 * dashboard (Table Editor → clipper_users → role) — that assignment
 * is a documented setup step, not something this app can grant
 * itself. Until the database + role column exist, every admin route
 * answers honestly (401/503) instead of pretending to be gated.
 */

import { createSupabaseServerClient } from "@/lib/auth/supabase-server";

export type AdminRole = "owner" | "admin" | "support" | "analyst" | "viewer" | "user";

/** Roles allowed into the admin review queue. */
const ADMIN_ROLES: AdminRole[] = ["owner", "admin"];

export type AdminIdentity = {
  userId: string;
  email: string | null;
  role: AdminRole;
  publishingPaused: boolean;
};

/**
 * Resolve the signed-in admin identity, or null when there is no
 * session, no database, or no user row. Never throws for a missing
 * session — callers map null to 401/503 honestly.
 */
export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  let client;
  try {
    client = await createSupabaseServerClient();
  } catch {
    return null;
  }
  if (!client) return null;
  let user;
  try {
    const res = await client.auth.getUser();
    user = res.data.user;
  } catch {
    return null;
  }
  if (!user) return null;
  type UserRow = { role?: string; publishing_paused?: boolean };
  let row: UserRow | null = null;
  try {
    const res = await client
      .from("clipper_users")
      .select("role,publishing_paused")
      .eq("id", user.id)
      .single();
    row = res.data as unknown as UserRow | null;
  } catch {
    return null;
  }
  if (!row) return null;
  const role = (row.role ?? "user") as AdminRole;
  return {
    userId: user.id,
    email: user.email ?? null,
    role,
    publishingPaused: row.publishing_paused ?? false,
  };
}

export function isAdmin(identity: AdminIdentity | null): boolean {
  return identity !== null && ADMIN_ROLES.includes(identity.role);
}
