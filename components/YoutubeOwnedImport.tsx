"use client";

import { useCallback, useState } from "react";
import { isYoutubeLink } from "@/lib/imports/youtube-link";
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
}: {
  onVerified: (meta: YoutubeOwnedMeta) => void;
}) {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<"idle" | "checking" | "verified" | "error">(
    "idle",
  );
  const [result, setResult] = useState<YoutubeOwnedResult | null>(null);

  const check = useCallback(async () => {
    const trimmed = url.trim();
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
          className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors duration-200 hover:opacity-90 disabled:opacity-50"
          onClick={() => void check()}
          disabled={phase === "checking"}
        >
          {phase === "checking" ? "Verifying ownership…" : "Verify ownership"}
        </button>
      </div>

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
            Or upload a video file directly above — the file route
            does not need a link.
          </p>
        </div>
      )}
    </div>
  );
}
