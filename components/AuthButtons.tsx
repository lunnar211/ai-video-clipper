"use client";

import { useEffect, useState } from "react";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/auth/supabase";

/**
 * Sign-in/out buttons for the header. When Supabase env vars are
 * absent, this renders an honest "not configured" note and nothing
 * else — the tool keeps working signed-out.
 */
export default function AuthButtons() {
  const [email, setEmail] = useState<string | null>(null);
  // Unconfigured auth is ready immediately (no effect setState).
  const [ready, setReady] = useState(() => !isSupabaseConfigured());

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    if (!client) return;
    client.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null);
      setReady(true);
    });
    const { data: listener } = client.auth.onAuthStateChange(
      (_event, session) => {
        setEmail(session?.user?.email ?? null);
      },
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  if (!isSupabaseConfigured()) {
    return (
      <span className="text-xs text-muted-foreground">
        Sign-in is not configured yet
      </span>
    );
  }
  if (email) {
    return (
      <span className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{email}</span>
        <button
          type="button"
          className="inline-flex min-h-[44px] cursor-pointer items-center rounded border border-border bg-card px-2 py-1 text-xs text-foreground transition-colors duration-200 hover:bg-muted"
          onClick={async () => {
            // Clear the httpOnly admin MFA marker server-side first
            // (browser JS cannot clear httpOnly cookies), then sign
            // out of Supabase. Either step failing alone must not
            // leave the header showing a signed-in user.
            try {
              await fetch("/api/auth/sign-out", { method: "POST" });
            } catch {
              /* Supabase sign-out below still runs */
            }
            const client = createSupabaseBrowserClient();
            await client?.auth.signOut();
            setEmail(null);
          }}
        >
          Sign out
        </button>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-on-primary transition-colors duration-200 hover:opacity-90"
        onClick={async () => {
          const client = createSupabaseBrowserClient();
          await client?.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: `${window.location.origin}/auth/callback`,
            },
          });
        }}
      >
        Sign in with Google
      </button>
      <a
        href="/signin"
        className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-muted"
      >
        Sign in with email
      </a>
    </span>
  );
}
