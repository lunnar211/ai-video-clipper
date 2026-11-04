"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/auth/supabase";

/**
 * Admin nav link for the main layout (admin hard gate).
 *
 * Renders nothing when there is no signed-in session, so logged-out
 * visitors never see an Admin entry point. It intentionally knows
 * only "signed in or not" — the role check is server-side, in the
 * /admin layout gate, which still closes the console to signed-in
 * non-admins. Kept as a client component so the root layout stays
 * static (a server session check there would make every page dynamic).
 */
export default function AdminNavLink() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    if (!client) return;
    client.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
    });
    const { data: listener } = client.auth.onAuthStateChange(
      (_event, session) => {
        setSignedIn(!!session);
      },
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured() || !signedIn) return null;
  return (
    <Link href="/admin" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-sm text-muted-foreground">
      Admin
    </Link>
  );
}
