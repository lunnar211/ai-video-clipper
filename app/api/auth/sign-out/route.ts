import { NextResponse } from "next/server";
import { z } from "zod";
import { MFA_MARKER_COOKIE } from "@/lib/admin/session";

/**
 * POST /api/auth/sign-out — clear the admin MFA marker cookie.
 *
 * The Supabase session itself is cleared client-side by
 * client.auth.signOut() (unchanged behavior); this route exists because
 * the MFA marker cookie is httpOnly, so browser JavaScript cannot clear
 * it. The header's sign-out handler calls this route first, then signs
 * out of Supabase, so a signed-out browser keeps no verified MFA
 * session behind. The route takes no input (empty body) and never
 * touches the database. No rate limit: there is nothing here worth
 * brute-forcing, and locking a user out of signing out would be worse.
 */
const EmptySchema = z.object({});

export async function POST(req: Request) {
  const parsed = EmptySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const res = NextResponse.json({ signedOut: true });
  res.cookies.set(MFA_MARKER_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
