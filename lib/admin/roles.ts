/**
 * Admin roles (ClipForge Phase 4).
 *
 * Roles live on the clipper_users row (migration 002 added `role`).
 * Role assignment stays a database-level setup step — the owner
 * assigns roles directly in the Supabase dashboard. No route in this
 * app can grant a role, by design.
 *
 * Permissions:
 * - owner, admin: full console + all admin actions (suspend, credits,
 *   impersonation, break-glass). MFA-verified session required.
 * - support: read console + write support notes + review strikes.
 *   No suspend/credits/impersonation/break-glass.
 * - analyst: read dashboards + audit + metrics only.
 * - viewer: read-only console access (no actions at all).
 * - user: no console access.
 */

export type AdminRole =
  | "owner"
  | "admin"
  | "support"
  | "analyst"
  | "viewer"
  | "user";

export const CONSOLE_ROLES: AdminRole[] = [
  "owner",
  "admin",
  "support",
  "analyst",
  "viewer",
];

export const ACTION_ROLES: AdminRole[] = ["owner", "admin"];

export const SUPPORT_ROLES: AdminRole[] = ["owner", "admin", "support"];

export function canViewConsole(role: AdminRole): boolean {
  return CONSOLE_ROLES.includes(role);
}

/** Roles allowed to take state-changing admin actions. */
export function canTakeAdminAction(role: AdminRole): boolean {
  return ACTION_ROLES.includes(role);
}

/** Roles allowed to write support notes / review strikes. */
export function canSupport(role: AdminRole): boolean {
  return SUPPORT_ROLES.includes(role);
}

/**
 * Roles that must present a verified MFA session before the console
 * answers anything other than the MFA setup flow itself.
 */
export function mfaRequiredFor(role: AdminRole): boolean {
  return role === "owner" || role === "admin";
}
