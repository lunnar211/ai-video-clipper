import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/session";
import { adminLayoutGate } from "@/lib/admin/guard";
import AdminBanner from "./AdminBanner";

/**
 * Admin console layout (ClipForge Phase 4 + admin hard gate).
 * Wraps every /admin page (including the Phase 2 strikes queue) with
 * the view-as banner and console navigation. The banner is a client
 * component that reads only the session endpoint — no tokens or
 * content ever reach it.
 *
 * HARD GATE: the session is resolved server-side BEFORE any console
 * UI renders. No session -> redirect to /signin; signed in without a
 * console role (or suspended) -> redirect home. MFA is not checked
 * here (API routes still enforce it, and /admin/mfa must stay
 * reachable for enrolment).
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const verdict = adminLayoutGate(await getAdminSession());
  if (!verdict.allowed) redirect(verdict.redirectTo);
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <AdminBanner />
      <nav className="mb-6 flex flex-wrap gap-4 border-b pb-3 text-sm">
        <Link href="/admin" className="text-violet-700 underline">
          Dashboard
        </Link>
        <Link href="/admin/users" className="text-violet-700 underline">
          Users
        </Link>
        <Link href="/admin/audit" className="text-violet-700 underline">
          Audit log
        </Link>
        <Link href="/admin/alerts" className="text-violet-700 underline">
          Alerts
        </Link>
        <Link href="/admin/mfa" className="text-violet-700 underline">
          MFA setup
        </Link>
        <Link href="/admin/break-glass" className="text-violet-700 underline">
          Break-glass
        </Link>
        <Link href="/admin/events" className="text-violet-700 underline">
          Live feed
        </Link>
        <Link href="/admin/strikes" className="text-violet-700 underline">
          Strikes queue
        </Link>
        <Link href="/admin/integrations" className="text-violet-700 underline">
          Integrations
        </Link>
        <Link href="/admin/webhooks" className="text-violet-700 underline">
          Webhooks
        </Link>
        <Link href="/admin/api-keys" className="text-violet-700 underline">
          API keys
        </Link>
        <Link href="/admin/api-docs" className="text-violet-700 underline">
          API docs
        </Link>
        <Link href="/admin/sso" className="text-violet-700 underline">
          SSO
        </Link>
        <Link href="/admin/gdpr" className="text-violet-700 underline">
          GDPR
        </Link>
        <Link href="/admin/billing" className="text-violet-700 underline">
          Billing
        </Link>
      </nav>
      {children}
    </div>
  );
}
