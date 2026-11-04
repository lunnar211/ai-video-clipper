"use client";

import { useEffect, useState } from "react";

/**
 * Public share embed page. The share record comes from /api/share/[token]
 * (DB-backed); without the database the API honestly 503s and this page
 * says so. The video file itself is not hosted by the share link unless
 * the creator attached a hosted URL — browser-rendered clips live on
 * the creator's device until they upload them somewhere.
 */

type ShareData = {
  title: string;
  videoUrl: string | null;
  clipStart: number;
  clipEnd: number;
  views: number;
};

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void params.then((p) => {
      if (!cancelled) setToken(p.token);
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void fetch(`/api/share/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as ShareData & {
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) setError(json.error ?? "Share link could not be loaded.");
        else setData(json);
      })
      .catch(() => {
        if (!cancelled) setError("Share link could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Shared clip</h1>
      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      {data && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{data.title}</h2>
          <p className="text-sm text-muted-foreground">
            Clip {fmt(data.clipStart)} – {fmt(data.clipEnd)} · {data.views}{" "}
            view{data.views === 1 ? "" : "s"}
          </p>
          {data.videoUrl ? (
            <video
              src={data.videoUrl}
              controls
              className="w-full rounded-lg bg-black"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No hosted video is attached to this share link — the clip
              was rendered in the creator&apos;s browser. The creator can
              attach a hosted video URL when creating the link.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            This link is public to anyone who has it. View counts come
            from the share database, never invented.
          </p>
        </div>
      )}
    </div>
  );
}
