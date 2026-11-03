"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setPendingUpload, setPendingCcUrl } from "@/lib/upload-pending";
import { isYoutubeLink } from "@/lib/imports/youtube-link";

/**
 * Hero upload box (ClipForge Phase 7, Phase 10: reusable id).
 *
 * The marketing homepage hero lets a visitor pick a video; the file is
 * handed to the clipper on /create in module memory (never uploaded,
 * never persisted). Validation (size, type, header sniff) happens once
 * in the tool, not here — this box only carries the file across.
 *
 * Phase 10 reuses this same box in the "See it work" section, so the
 * input id is a prop: two boxes on one page must never share an id,
 * or the labels would both point at the first input.
 *
 * Phase 11 adds a "Paste a link" tab: a pasted CC link is carried to
 * /create the same way, where the tool verifies the licence before
 * anything loads. The hero never verifies or loads the link itself.
 */
export default function HeroUploadBox({ id = "hero-upload" }: { id?: string }) {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [link, setLink] = useState("");

  const handOff = (file: File | undefined) => {
    if (!file) return;
    setPendingUpload(file);
    router.push("/create");
  };

  const handOffLink = () => {
    const trimmed = link.trim();
    if (!trimmed) return;
    // Phase 14: a YouTube link pasted here goes straight to the
    // own-YouTube flow on /create — the CC box would only route it
    // there anyway, and this skips the detour. The user re-pastes
    // in that flow's own box; nothing is verified from the hero.
    if (isYoutubeLink(trimmed)) {
      router.push("/create#your-youtube-video");
      return;
    }
    setPendingCcUrl(trimmed);
    router.push("/create");
  };

  const tabClass = (active: boolean) =>
    `inline-flex min-h-[44px] items-center rounded-lg px-4 py-2 text-sm font-medium ${
      active ? "bg-primary text-on-primary" : "text-muted-foreground"
    }`;

  return (
    <div className="rounded-xl border-2 border-dashed border-primary/50 bg-card p-5">
      <div role="tablist" aria-label="Add a video" className="flex gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "upload"}
          className={tabClass(mode === "upload")}
          onClick={() => setMode("upload")}
        >
          Upload a file
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "paste"}
          className={tabClass(mode === "paste")}
          onClick={() => setMode("paste")}
        >
          Paste a link
        </button>
      </div>

      {mode === "upload" ? (
        <label
          htmlFor={id}
          className={`mt-3 block cursor-pointer rounded-lg px-4 py-6 text-center transition-colors duration-200 ${
            dragging ? "bg-primary/10" : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handOff(e.dataTransfer.files?.[0]);
          }}
        >
          <span className="block text-lg font-semibold text-foreground">
            Drop your video here, or choose a file
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">
            Up to 10 minutes and 500 MB. Only videos you recorded or own the
            rights to.
          </span>
          <input
            id={id}
            type="file"
            accept="video/*"
            className="sr-only"
            onChange={(e) => handOff(e.target.files?.[0])}
          />
        </label>
      ) : (
        <div className="mt-3 space-y-3">
          <label
            htmlFor={`${id}-link`}
            className="block text-center text-lg font-semibold text-foreground"
          >
            Paste a Wikimedia Commons or Internet Archive link
          </label>
          <p className="text-center text-sm text-muted-foreground">
            The licence is checked in the clipper before anything loads.
            Other links are refused — upload a file instead.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={`${id}-link`}
              type="url"
              inputMode="url"
              placeholder="https://commons.wikimedia.org/wiki/File:… or https://archive.org/details/…"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handOffLink();
                }
              }}
            />
            <button
              type="button"
              className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors duration-200 hover:opacity-90 disabled:opacity-50"
              onClick={handOffLink}
              disabled={!link.trim()}
            >
              Continue in the clipper
            </button>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Your own YouTube video?{" "}
            <a
              href="/create#your-youtube-video"
              className="font-semibold text-primary underline"
            >
              Verify ownership in the clipper
            </a>
            .
          </p>
        </div>
      )}
      <p className="mt-3 text-center text-sm">
        <a href="/create" className="inline-flex min-h-[44px] items-center font-semibold text-primary underline">
          Open the clipper without a file
        </a>
      </p>
    </div>
  );
}
