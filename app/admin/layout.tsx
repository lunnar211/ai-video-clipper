import type { ReactNode } from "react";
import Link from "next/link";
import AdminBanner from "./AdminBanner";

/**
 * Admin console layout (ClipForge Phase 4). Wraps every /admin page
 * (including the Phase 2 strikes queue) with the view-as banner and
 * console navigation. The banner is a client component that reads
 * only the session endpoint — no tokens or content ever reach it.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
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
      </nav>
      {children}
    </div>
  );
}
