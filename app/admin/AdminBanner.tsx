"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type SessionInfo = {
  userId: string;
  role: string;
  mfaVerified: boolean;
  viewAs: { targetUserId: string; reason: string } | null;
};

/**
 * View-as banner (ClipForge Phase 4). Shown on every admin console
 * page while an admin is viewing as another user. The banner states
 * plainly who is being viewed and why, and offers an end button.
 * It reads only the session endpoint (target id + reason) — never
 * any token or user content.
 */
export default function AdminBanner() {
  const [viewAs, setViewAs] = useState<SessionInfo["viewAs"] | null>(null);
  const [ending, setEnding] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Refetch on every navigation: starting or ending view-as moves
  // the admin to another console page without remounting this banner.
  useEffect(() => {
    fetch("/api/admin/session")
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json().catch(() => ({}))) as SessionInfo;
        setViewAs(data.viewAs ?? null);
      })
      .catch(() => {
        /* banner stays hidden when the session cannot be read */
      });
  }, [pathname]);

  if (!viewAs) return null;

  const end = async () => {
    setEnding(true);
    await fetch("/api/admin/impersonate/end", { method: "POST" }).catch(
      () => {},
    );
    setViewAs(null);
    router.push("/admin");
  };

  return (
    <div className="border-b-4 border-amber-500 bg-amber-50 px-4 py-3">
      <p className="text-sm font-semibold text-amber-900">
        Viewing as user {viewAs.targetUserId} — read-only. Reason:{" "}
        {viewAs.reason}
      </p>
      <p className="text-xs text-amber-800">
        You cannot publish, bill, or change anything as this user. End
        view-as to return to your own admin session.
      </p>
      <button
        type="button"
        onClick={end}
        disabled={ending}
        className="mt-2 rounded bg-amber-600 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        {ending ? "Ending…" : "End view-as"}
      </button>
    </div>
  );
}
