"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setPendingUpload } from "@/lib/upload-pending";

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
 */
export default function HeroUploadBox({ id = "hero-upload" }: { id?: string }) {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);

  const handOff = (file: File | undefined) => {
    if (!file) return;
    setPendingUpload(file);
    router.push("/create");
  };

  return (
    <div className="rounded-xl border-2 border-dashed border-primary/50 bg-card p-5">
      <label
        htmlFor={id}
        className={`block cursor-pointer rounded-lg px-4 py-6 text-center transition-colors duration-200 ${
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
      <p className="mt-3 text-center text-sm">
        <a href="/create" className="inline-flex min-h-[44px] items-center font-semibold text-primary underline">
          Open the clipper without a file
        </a>
      </p>
    </div>
  );
}
