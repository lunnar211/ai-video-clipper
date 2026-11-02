import { z } from "zod";

/**
 * Email + password sign-in (owner-requested addition, NOT a phase).
 *
 * This is a thin, testable seam over the Supabase Auth browser client:
 * the page calls signInWithEmailPassword(), which validates input and
 * forwards it to Supabase's signInWithPassword(). No password is ever
 * stored, logged, or sent anywhere except to Supabase Auth itself, and
 * no sign-up path exists — accounts are created by the owner in the
 * Supabase dashboard. Roles and MFA are untouched: a signed-in user
 * goes through the same clipper_users row + Phase 4 guard as a
 * Google-signed-in user, so a plain 'user' role still sees no console.
 */

export const EmailSignInSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(254, "Email is too long")
    .email("Enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .max(128, "Password is too long"),
});

export type EmailSignInInput = z.infer<typeof EmailSignInSchema>;

/** Normalize for lookup: trim + lowercase (Supabase treats email case-insensitively). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type EmailSignInClient = {
  auth: {
    signInWithPassword: (args: {
      email: string;
      password: string;
    }) => Promise<{
      data: { user: unknown; session: unknown };
      error: { message: string } | null;
    }>;
  };
};

export type EmailSignInResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Sign in with email + password via a Supabase Auth client.
 * Wrong credentials are rejected by Supabase ("Invalid login
 * credentials") and reported as-is — that message reveals nothing
 * about which field was wrong. A signed-in user with no session means
 * the email address is not confirmed yet.
 */
export async function signInWithEmailPassword(
  client: EmailSignInClient,
  input: EmailSignInInput,
): Promise<EmailSignInResult> {
  const parsed = EmailSignInSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid sign-in details",
    };
  }
  const { data, error } = await client.auth.signInWithPassword({
    email: normalizeEmail(parsed.data.email),
    password: parsed.data.password,
  });
  if (error) {
    return { ok: false, error: error.message || "Sign-in failed" };
  }
  if (!data.session) {
    return {
      ok: false,
      error: "Check your email to confirm this account, then sign in again.",
    };
  }
  return { ok: true };
}

/**
 * Validate a `next` redirect target for post-sign-in navigation.
 * Only internal paths are allowed (a single leading slash, never a
 * protocol-relative "//" URL and never an absolute URL).
 */
export function validNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}
