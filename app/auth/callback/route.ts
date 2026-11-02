import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { validNextPath } from "@/lib/auth/email-login";
import { scheduleAudit } from "@/lib/admin/audit";

/**
 * Supabase Auth callback: exchanges the provider code for a session
 * and redirects home. If Supabase is not configured, the route says
 * so honestly instead of crashing.
 *
 * Redirect safety: `next` is validated to an internal path only
 * (see validNextPath) — an absolute or protocol-relative `next` can
 * never bounce a user to another site. Sign-in callers pass
 * redirectTo = their own origin + /auth/callback, so Supabase returns
 * here; the allowlist entry for this callback URL lives in the
 * Supabase dashboard (owner-managed), not in code.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = validNextPath(url.searchParams.get("next")); // internal only
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
  // Audit only: a successful sign-in (OAuth or email confirmation).
  // Never changes the redirect; failures are swallowed by design.
  try {
    const { data } = await client.auth.getUser();
    if (data.user) {
      scheduleAudit({
        actor: data.user.id,
        action: "auth.login",
        target: null,
        metadata: null,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
        user_agent: req.headers.get("user-agent"),
      });
    }
  } catch {
    /* audit must never break sign-in */
  }
  return NextResponse.redirect(new URL(next, req.url));
}
