"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CcImportMeta, CcVerifiedFile } from "@/lib/imports/cc-types";

/**
 * Paste-a-link import (ClipForge Phase 11).
 *
 * The visitor pastes a Wikimedia Commons or Internet Archive link.
 * The server checks the licence first (POST /api/imports/cc-verify);
 * only a verified free licence reaches the "Load this video" step,
 * and the file then loads straight from the source host into the
 * browser pipeline — no server copy, no download service. When the
 * source host blocks that direct browser load (CORS), the panel
 * says so plainly and points at the download link instead of
 * pretending the load worked.
 *
 * Props: onLoad receives the loaded File plus the verified licence
 * facts (the parent records them as the project's licence metadata
 * and carries the attribution into ZIP exports). initialUrl +
 * autoVerify let the homepage hero hand a pasted link to /create.
 */

type VerifyResponse =
  | ({ status: "verified" } & CcImportMeta & { files: CcVerifiedFile[] })
  | { error: string; reason?: string };

function mimeForName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".mkv")) return "video/x-matroska";
  if (lower.endsWith(".ogv")) return "video/ogg";
  if (lower.endsWith(".m4v")) return "video/x-m4v";
  if (lower.endsWith(".avi")) return "video/x-msvideo";
  return "video/mp4";
}

function displayName(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

export default function CcPasteImport({
  onLoad,
  initialUrl = null,
  autoVerify = false,
  idPrefix = "cc-paste",
}: {
  onLoad: (file: File, meta: CcImportMeta) => void;
  initialUrl?: string | null;
  autoVerify?: boolean;
  idPrefix?: string;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  // The hero hands the link over after mount (module memory), so the
  // input must follow a late-arriving initialUrl — useState alone
  // would keep the first-render empty value forever. Deferred past
  // commit (queueMicrotask), the same pattern the tool uses for its
  // mount handoff, so the sync does not cascade renders.
  useEffect(() => {
    if (!initialUrl) return;
    queueMicrotask(() => setUrl(initialUrl));
  }, [initialUrl]);
  const [phase, setPhase] = useState<
    "idle" | "checking" | "verified" | "error"
  >("idle");
  const [loadingFile, setLoadingFile] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [verified, setVerified] = useState<VerifyResponse | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const autoRan = useRef(false);

  const check = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setMessage("Paste a video link first.");
      setPhase("error");
      return;
    }
    setPhase("checking");
    setMessage(null);
    setVerified(null);
    try {
      const res = await fetch("/api/imports/cc-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as VerifyResponse;
      if (!res.ok || !("status" in data) || data.status !== "verified") {
        setMessage(
          "error" in data && data.error
            ? data.error
            : "That link could not be verified.",
        );
        setPhase("error");
        return;
      }
      setVerified(data);
      setSelectedUrl(data.files[0]?.url ?? null);
      setPhase("verified");
    } catch {
      setMessage("Licence check failed (network error). Try again.");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    if (autoVerify && initialUrl && !autoRan.current) {
      autoRan.current = true;
      void check(initialUrl);
    }
  }, [autoVerify, initialUrl, check]);

  const load = useCallback(async () => {
    if (!verified || !("status" in verified) || !selectedUrl) return;
    const fileEntry = verified.files.find((f) => f.url === selectedUrl);
    if (!fileEntry) return;
    // Loading keeps phase "verified" so the panel (and its source
    // links) stays visible; only the button shows the busy state.
    setLoadingFile(true);
    setMessage(null);
    try {
      const res = await fetch(selectedUrl);
      if (!res.ok) {
        setMessage(
          `The source host refused the file load (${res.status}). Download it from the source page and upload it here instead.`,
        );
        setPhase("error");
        return;
      }
      const blob = await res.blob();
      const name = displayName(fileEntry.name);
      const file = new File([blob], name, {
        type: blob.type.startsWith("video/")
          ? blob.type
          : mimeForName(name),
      });
      onLoad(file, {
        license: verified.license,
        author: verified.author,
        title: verified.title,
        sourceUrl: verified.sourceUrl,
        attribution: verified.attribution,
      });
    } catch {
      // A CORS block (and any other browser fetch failure) lands
      // here as a TypeError. Say so plainly, with the way through.
      setMessage(
        "This host blocks loading the file directly in your browser, so the video cannot be pulled in from the link. Download it from the source page and upload it here instead — the licence is already verified above.",
      );
      setPhase("error");
    } finally {
      setLoadingFile(false);
    }
  }, [verified, selectedUrl, onLoad]);

  const verifiedFiles =
    verified && "status" in verified ? verified.files : [];
  const meta =
    verified && "status" in verified
      ? (verified as CcImportMeta)
      : null;

  return (
    <div className="space-y-3">
      <label
        htmlFor={`${idPrefix}-url`}
        className="block text-sm font-medium"
      >
        Paste a video link
      </label>
      <p className="text-sm text-muted-foreground">
        Wikimedia Commons or Internet Archive links only. The licence
        is checked before anything loads — other links are refused,
        and the video itself loads straight from the source into
        your browser. No server copy is made.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={`${idPrefix}-url`}
          type="url"
          inputMode="url"
          placeholder="https://commons.wikimedia.org/wiki/File:… or https://archive.org/details/…"
          className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void check(url);
            }
          }}
        />
        <button
          type="button"
          className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors duration-200 hover:opacity-90 disabled:opacity-50"
          onClick={() => void check(url)}
          disabled={phase === "checking" || loadingFile}
        >
          {phase === "checking" ? "Checking licence…" : "Check licence"}
        </button>
      </div>

      {phase === "verified" && meta && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <p className="font-semibold">Licence verified — free to reuse.</p>
          <p className="mt-1">
            “{meta.title}” by {meta.author}, licensed under{" "}
            {meta.license}.{" "}
            <a
              href={meta.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Source page
            </a>
          </p>
          <p className="mt-1 text-muted-foreground">
            Attribution: {meta.attribution} — this line travels with
            your clips in the ZIP export.
          </p>
          {verifiedFiles.length > 1 && (
            <label className="mt-3 block">
              <span className="font-medium">Choose a file from this item</span>
              <select
                id={`${idPrefix}-file`}
                className="mt-1 block w-full max-w-full rounded border px-2 py-2 text-sm text-foreground"
                value={selectedUrl ?? ""}
                onChange={(e) => setSelectedUrl(e.target.value)}
              >
                {verifiedFiles.map((f) => (
                  <option key={f.url} value={f.url}>
                    {displayName(f.name)}
                    {f.size ? ` — ${(f.size / 1024 / 1024).toFixed(1)} MB` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="mt-3 inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors duration-200 hover:opacity-90 disabled:opacity-50"
            onClick={() => void load()}
            disabled={loadingFile || !selectedUrl}
          >
            {loadingFile ? "Loading video…" : "Load this video"}
          </button>
        </div>
      )}

      {phase === "error" && message && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          <p>{message}</p>
          {meta && (
            <p className="mt-2">
              <a
                href={meta.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Open the source page to download the file
              </a>
              , then upload it directly above — the licence is
              already verified.
            </p>
          )}
          {!meta && (
            <p className="mt-2">
              Or upload a video file directly above — the file route
              does not need a link.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
