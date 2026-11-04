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
      {/* Scrollable link bar (Phase 20): the old wrapping row broke
          into ragged lines on a phone. One scrollable row keeps
          every console link reachable at a 44px touch height. */}
      <nav className="mb-6 flex flex-nowrap items-center gap-4 overflow-x-auto border-b border-border pb-3 text-sm">
        <Link href="/admin" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-primary underline">
          Dashboard
        </Link>
        <Link href="/admin/users" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-primary underline">
          Users
        </Link>
        <Link href="/admin/audit" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-primary underline">
          Audit log
        </Link>
        <Link href="/admin/alerts" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-primary underline">
          Alerts
        </Link>
        <Link href="/admin/mfa" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-primary underline">
          MFA setup
        </Link>
        <Link href="/admin/break-glass" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-primary underline">
          Break-glass
        </Link>
        <Link href="/admin/events" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-primary underline">
          Live feed
        </Link>
        <Link href="/admin/strikes" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-primary underline">
          Strikes queue
        </Link>
        <Link href="/admin/integrations" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-primary underline">
          Integrations
        </Link>
        <Link href="/admin/webhooks" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-primary underline">
          Webhooks
        </Link>
        <Link href="/admin/api-keys" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-primary underline">
          API keys
        </Link>
        <Link href="/admin/api-docs" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-primary underline">
          API docs
        </Link>
        <Link href="/admin/sso" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-primary underline">
          SSO
        </Link>
        <Link href="/admin/gdpr" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-primary underline">
          GDPR
        </Link>
        <Link href="/admin/billing" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-primary underline">
          Billing
        </Link>
      </nav>
      {children}
    </div>
  );
}
