import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";

/**
 * Supabase OAuth callback: exchanges the provider code for a session
 * and redirects home. If Supabase is not configured, the route says
 * so honestly instead of crashing.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const client = await createSupabaseServerClient();
  if (!client) {
    return new NextResponse("Sign-in is not configured yet.", {
      status: 503,
    });
  }
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/?auth_error=${encodeURIComponent(error.message)}`, req.url),
      );
    }
  }
  return NextResponse.redirect(new URL(next, req.url));
}
