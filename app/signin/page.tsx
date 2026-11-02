"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/auth/supabase";
import {
  signInWithEmailPassword,
  validNextPath,
} from "@/lib/auth/email-login";

/**
 * Email + password sign-in page (owner-requested addition).
 *
 * Sign-IN only — there is no public sign-up form. Accounts are created
 * by the site owner in the Supabase dashboard. Google sign-in keeps
 * working unchanged (same button as the header). A signed-in user has
 * the same role/MFA treatment as a Google-signed-in user: a plain
 * 'user' role still cannot open the admin console.
 */
export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isSupabaseConfigured()) {
    return (
      <main>
        <h1 className="text-xl font-bold text-slate-900">Sign in</h1>
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Sign-in is not configured yet.
        </p>
      </main>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const client = createSupabaseBrowserClient();
      if (!client) {
        setError("Sign-in is not configured yet.");
        return;
      }
      const result = await signInWithEmailPassword(client, {
        email,
        password,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const next = validNextPath(
        new URLSearchParams(window.location.search).get("next"),
      );
      router.push(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    const client = createSupabaseBrowserClient();
    await client?.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <main>
      <h1 className="text-xl font-bold text-slate-900">Sign in</h1>
      <form
        onSubmit={submit}
        className="mt-4 flex max-w-sm flex-col gap-3"
      >
        <label className="text-sm text-slate-700">
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 text-slate-900"
          />
        </label>
        <label className="text-sm text-slate-700">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 text-slate-900"
          />
        </label>
        {error ? (
          <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in with email"}
        </button>
      </form>
      <div className="mt-4 flex max-w-sm flex-col gap-2">
        <button
          type="button"
          onClick={signInWithGoogle}
          className="rounded-lg border px-3 py-2 text-sm font-medium text-slate-800"
        >
          Sign in with Google
        </button>
        <p className="text-xs text-slate-500">
          No account? Accounts are created by the site owner in the
          Supabase dashboard — there is no public sign-up here. Password
          resets are also done in the Supabase dashboard.
        </p>
      </div>
    </main>
  );
}
