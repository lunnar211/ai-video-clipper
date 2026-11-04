"use client";

import { useState } from "react";
import {
  DIRECT_POST_PLATFORMS,
  POST_COPYRIGHT_SENTENCE,
  POST_NOT_PUBLISHED_NOTE,
  POST_NO_LOGIN_NOTE,
  POST_UPLOAD_PAGE_HEDGE,
  shareClipFile,
  type DirectPostPlatform,
} from "@/lib/post/direct-share";

type PostClipProps = {
  clipId: string;
  title: string;
  hashtags: string[];
  mimeType: string;
  /** Loads the rendered clip bytes, kept in state by the caller
   * (never fetched back from a blob: URL — the site's CSP
   * connect-src does not list blob:). */
  getBlob: () => Promise<Blob>;
};

function fileExt(mimeType: string): string {
  return mimeType.includes("mp4") ? "mp4" : "webm";
}

/**
 * Post clip — without connecting (ClipForge Phase 13).
 *
 * From a finished clip, the visitor can:
 *  (a) share through the device's native share sheet (the clip file
 *      itself, plus title + hashtags), or
 *  (b) download the clip and open a platform's own upload page in a
 *      new tab, where they are already signed in on that platform.
 *
 * The site never asks for a platform login, never stores one, and
 * never embeds a platform login page (platforms block those inside
 * other websites). Activity is recorded as "shared" / "cancelled" /
 * "opened" / "unsupported" — never "published": only the platform
 * itself can confirm a live post. If activity recording fails
 * (database not set up), the post action still worked — the UI says
 * so instead of claiming a record.
 */
export default function PostClip({
  clipId,
  title,
  hashtags,
  mimeType,
  getBlob,
}: PostClipProps) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);

  const record = async (
    platform: string,
    outcome: string,
  ): Promise<boolean> => {
    try {
      const res = await fetch("/api/post-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clip_id: clipId,
          platform,
          outcome,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const share = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const blob = await getBlob();
      const file = new File([blob], `${clipId}.${fileExt(mimeType)}`, {
        type: mimeType,
      });
      const result = await shareClipFile(
        navigator,
        file,
        title,
        hashtags.join(" "),
      );
      if (result === "unsupported") {
        setShowFallback(true);
        await record("share_sheet", "unsupported");
        setStatus(
          "Your device cannot share video files directly, so here are the download + platform links instead.",
        );
        return;
      }
      const recorded = await record("share_sheet", result);
      setStatus(
        result === "shared"
          ? recorded
            ? "Shared through your device's share sheet. Recorded as shared — only the platform itself can confirm a live post."
            : "Shared through your device's share sheet. The activity log could not record it (database not set up) — the share itself still happened."
          : recorded
            ? "Share cancelled. Recorded as cancelled."
            : "Share cancelled. The activity log could not record it.",
      );
    } catch {
      setStatus("Sharing failed. Use the download + platform links below.");
      setShowFallback(true);
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    try {
      const blob = await getBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${clipId}.${fileExt(mimeType)}`;
      a.click();
      setStatus("Clip downloaded. Upload it from the platform's own page.");
    } catch {
      setStatus("Download failed. Try the clip download link above.");
    }
  };

  const openPlatform = async (platform: DirectPostPlatform) => {
    if (!platform.uploadUrl) return;
    window.open(platform.uploadUrl, "_blank", "noopener,noreferrer");
    const recorded = await record(platform.id, "opened");
    setStatus(
      recorded
        ? `Opened ${platform.label}'s upload page. Recorded as opened — only ${platform.label} itself can confirm a live post.`
        : `Opened ${platform.label}'s upload page. The activity log could not record it (database not set up).`,
    );
  };

  return (
    <div className="mt-3 rounded-lg border border-border p-4">
      <p className="font-medium">Post clip — without connecting</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {POST_NO_LOGIN_NOTE}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {POST_COPYRIGHT_SENTENCE}
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <button
          className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-primary px-3 py-1.5 font-medium text-on-primary transition-colors duration-200 hover:opacity-90 active:opacity-80 disabled:opacity-50"
          onClick={share}
          disabled={busy}
        >
          {busy ? "Sharing…" : "Post clip (share sheet)"}
        </button>
        <button
          className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-border bg-card px-3 py-1.5 text-foreground transition-colors duration-200 hover:bg-muted"
          onClick={() => setShowFallback((v) => !v)}
        >
          {showFallback ? "Hide platform links" : "Post via platform links"}
        </button>
      </div>
      {status && <p className="mt-2 text-sm">{status}</p>}
      {showFallback && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">
            {POST_NOT_PUBLISHED_NOTE} {POST_UPLOAD_PAGE_HEDGE}
          </p>
          <button
            className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground transition-colors duration-200 hover:bg-muted"
            onClick={download}
          >
            Download clip first
          </button>
          <ul className="space-y-2">
            {DIRECT_POST_PLATFORMS.map((platform) => (
              <li key={platform.id} className="text-sm">
                {platform.uploadUrl ? (
                  <button
                    className="font-medium text-primary underline"
                    onClick={() => openPlatform(platform)}
                  >
                    Open {platform.label} upload page
                  </button>
                ) : (
                  <button
                    className="font-medium text-primary underline"
                    onClick={share}
                    disabled={busy}
                  >
                    {platform.label} (share sheet / app)
                  </button>
                )}
                <span className="text-muted-foreground">
                  {" "}
                  — {platform.note}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            Tip: on your phone, the share sheet lists the apps you
            already use — pick the platform there and the clip goes
            with it. On a computer, download the clip, then upload it
            from the platform&apos;s own page.
          </p>
        </div>
      )}
    </div>
  );
}
