"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isYoutubeLink } from "@/lib/imports/youtube-link";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/auth/supabase";
import {
  verifyYoutubeOwned,
  type YoutubeOwnedMeta,
  type YoutubeOwnedResult,
} from "@/lib/imports/youtube-owned-client";

/**
 * "Your YouTube video" paste entry (ClipForge Phase 14).
 *
 * This is the UI the Phase 8 own-YouTube import API never had: a
 * signed-in user pastes their own YouTube link, the server proves
 * (via the YouTube Data API) that the video sits on their connected
 * channel, and the verified facts go to the parent for the project's
 * source record. On success the parent shows the verified banner
 * with the YouTube Studio download step.
 *
 * This verifies ownership ONLY. No video bytes are fetched from
 * YouTube by any means — no downloader, no third-party download
 * service, no Data API download (none exists). The file itself still
 * arrives via direct upload, exactly like every other source.
 *
 * Props: onVerified receives the verified facts (video title +
 * connected channel). Every failure shows the server's specific
 * message plus the fix that matches it — never a generic refusal.
 */

export default function YoutubeOwnedImport({
  onVerified,
  initialUrl = null,
  autoVerify = false,
}: {
  onVerified: (meta: YoutubeOwnedMeta) => void;
  /**
   * Phase 16: a YouTube link handed over from the homepage hero.
   * The hero used to drop this link — the user arrived at an empty
   * box and had to re-paste. initialUrl + autoVerify mirror the CC
   * flow: the input follows a late-arriving initialUrl, and the
   * check runs once on arrival so the journey continues where the
   * hero left off.
   */
  initialUrl?: string | null;
  autoVerify?: boolean;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [phase, setPhase] = useState<"idle" | "checking" | "verified" | "error">(
    "idle",
  );
  const [result, setResult] = useState<YoutubeOwnedResult | null>(null);
  const autoRan = useRef(false);
  // Verification needs a signed-in account (the server answers 401
  // otherwise), so the Verify button stays disabled until a session
  // is seen — instead of letting a logged-out visitor paste a link
  // and only discover the failure after pressing Verify. `null`
  // means the session check has not answered yet; unconfigured
  // auth starts false via the initializer (no setState in effect).
  const [signedIn, setSignedIn] = useState<boolean | null>(() =>
    isSupabaseConfigured() ? null : false,
  );

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    if (!client) return; // Unconfigured: initial state is already false.
    client.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session?.user);
    });
    const { data: listener } = client.auth.onAuthStateChange(
      (_event, session) => {
        setSignedIn(!!session?.user);
      },
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  // The hero hands the link over after mount (module memory), so
  // the input must follow a late-arriving initialUrl — useState
  // alone would keep the first-render empty value forever.
  // Deferred past commit (queueMicrotask), the same pattern the
  // CC panel and the tool use for their mount handoffs.
  useEffect(() => {
    if (!initialUrl) return;
    queueMicrotask(() => setUrl(initialUrl));
  }, [initialUrl]);

  const check = useCallback(async (value?: string) => {
    const trimmed = (value ?? url).trim();
    if (!trimmed) {
      setResult({
        ok: false,
        kind: "invalid",
        message: "Paste a YouTube link first.",
      });
      setPhase("error");
      return;
    }
    if (!isYoutubeLink(trimmed)) {
      setResult({
        ok: false,
        kind: "invalid",
        message:
          "That is not a YouTube link — paste a youtube.com or youtu.be video link here.",
      });
      setPhase("error");
      return;
    }
    setPhase("checking");
    setResult(null);
    const res = await verifyYoutubeOwned(trimmed);
    if (res.ok) {
      setPhase("verified");
      onVerified(res.meta);
    } else {
      setResult(res);
      setPhase("error");
    }
  }, [url, onVerified]);

  useEffect(() => {
    // Only auto-run for a signed-in visitor: a logged-out auto-run
    // would hit the server's 401 before the visitor has read the
    // sign-in hint above. Waits for the session check (signedIn
    // starts null) rather than firing on mount.
    if (autoVerify && initialUrl && signedIn === true && !autoRan.current) {
      autoRan.current = true;
      void check(initialUrl);
    }
  }, [autoVerify, initialUrl, signedIn, check]);

  const failure = result && !result.ok ? result : null;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Signed in with a connected YouTube channel? Paste one of your
        own video links and the site checks it is on your channel.
        This only verifies ownership — the video itself is never
        downloaded from YouTube. You upload the file yourself after
        verifying.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="yt-owned-url"
          type="url"
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v=… or https://youtu.be/…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void check();
            }
          }}
        />
        <button
          type="button"
          className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void check()}
          disabled={phase === "checking" || signedIn === false}
          title={
            signedIn === false
              ? "Sign in first — verification needs a signed-in account"
              : undefined
          }
        >
          {phase === "checking"
            ? "Verifying ownership…"
            : signedIn === false
              ? "Sign in to verify"
              : "Verify ownership"}
        </button>
      </div>
      {signedIn === false && (
        <p className="text-sm text-muted-foreground">
          Verification needs a signed-in account —{" "}
          <a href="/signin" className="underline">
            sign in first
          </a>
          , then paste your link again. (Connecting a YouTube
          channel is also not set up yet, so verification
          can&apos;t succeed until the owner sets up the YouTube
          app.)
        </p>
      )}

      {phase === "verified" && (
        <p className="text-sm text-emerald-800 dark:text-emerald-300">
          Ownership verified — details below.
        </p>
      )}

      {phase === "error" && failure && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          <p>{failure.message}</p>
          {failure.kind === "signin" && (
            <p className="mt-2">
              <a href="/signin" className="underline">
                Sign in first
              </a>
              , then paste your link again.
            </p>
          )}
          {failure.kind === "not_connected" && (
            <div className="mt-2 space-y-1">
              <p>
                <a href="/accounts" className="underline">
                  Connect your YouTube channel on the account page
                </a>
                , then paste your link again.
              </p>
              <p>
                If the YouTube connect button there shows Not enabled,
                the site&apos;s YouTube connection itself is not set
                up yet — that step belongs to the site owner, and no
                connection can be made until it is.
              </p>
            </div>
          )}
          {failure.kind === "reconnect" && (
            <p className="mt-2">
              <a href="/accounts" className="underline">
                Reconnect your YouTube account on the account page
              </a>
              , then paste your link again.
            </p>
          )}
          <p className="mt-2">
            Or{" "}
            <a href="#upload-dropzone" className="underline">
              upload a video file directly
            </a>{" "}
            — the file route does not need a link.
          </p>
        </div>
      )}
    </div>
  );
}
