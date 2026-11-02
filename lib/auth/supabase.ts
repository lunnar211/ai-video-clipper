import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-safe Supabase helpers (no next/headers here — this module
 * is imported by client components). Server helpers live in
 * lib/auth/supabase-server.ts.
 *
 * All values come from env; when they are absent, auth is honestly
 * "not configured" and the tool keeps working signed-out.
 */

export function isSupabaseConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function createSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) return null;
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );
}
