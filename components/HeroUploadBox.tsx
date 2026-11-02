"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setPendingUpload } from "@/lib/upload-pending";

/**
 * Hero upload box (ClipForge Phase 7).
 *
 * The marketing homepage hero lets a visitor pick a video; the file is
 * handed to the clipper on /create in module memory (never uploaded,
 * never persisted). Validation (size, type, header sniff) happens once
 * in the tool, not here — this box only carries the file across.
 */
export default function HeroUploadBox() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);

  const handOff = (file: File | undefined) => {
    if (!file) return;
    setPendingUpload(file);
    router.push("/create");
  };

  return (
    <div className="rounded-xl border-2 border-dashed border-violet-300 bg-white p-5 dark:border-violet-700 dark:bg-slate-900">
      <label
        htmlFor="hero-upload"
        className={`block cursor-pointer rounded-lg px-4 py-6 text-center ${
          dragging ? "bg-violet-50 dark:bg-violet-950" : ""
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
        <span className="block text-lg font-semibold text-slate-900 dark:text-white">
          Drop your video here, or choose a file
        </span>
        <span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">
          Up to 10 minutes and 500 MB. Only videos you recorded or own the
          rights to.
        </span>
        <input
          id="hero-upload"
          type="file"
          accept="video/*"
          className="sr-only"
          onChange={(e) => handOff(e.target.files?.[0])}
        />
      </label>
      <p className="mt-3 text-center text-sm">
        <a href="/create" className="font-semibold text-violet-700 underline dark:text-violet-400">
          Open the clipper without a file
        </a>
      </p>
    </div>
  );
}
