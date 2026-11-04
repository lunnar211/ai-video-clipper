import type { Metadata } from "next";
import ClipperTool from "@/components/ClipperTool";
import OnboardingChecklist from "@/components/OnboardingChecklist";

/**
 * The clipper tool (ClipForge Phase 7).
 *
 * The tool used to be the homepage; the marketing homepage took that
 * spot, so the tool lives here now. The hero upload box on / hands a
 * chosen file to this page in memory (see lib/upload-pending.ts).
 * The video workspace stays light by design even in dark mode, for
 * accurate color preview while editing.
 */

export const metadata: Metadata = {
  title: "Create clips — AI Video Clipper",
  description:
    "Upload a video you own, transcribe it, pick the best moments, and render vertical clips with captions.",
};

export default function Create() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Create clips
        </h1>
        <p className="mt-2 text-muted-foreground">
          Upload a video you own. AI transcribes it and picks the best
          15–60 second moments, then you render them as 9:16 clips with
          burned-in captions, titles and hashtags — ready for TikTok,
          Reels and Shorts. No AI key? Cut clips by hand; the tool never
          becomes a dead page.
        </p>
      </section>
      <OnboardingChecklist />
      <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Want a short made from scratch?{" "}
        <a href="/generate" className="font-medium text-primary underline">
          Generate one from a topic
        </a>{" "}
        — no video upload or link needed.
      </p>
      <ClipperTool />
      <section className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">
          Honest limits, up front
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Videos up to 10 minutes and 500 MB (browser limits).</li>
          <li>Clips up to 3 minutes; output is 720×1280 vertical video.</li>
          <li>Download is MP4 where your browser supports it, otherwise WebM.</li>
          <li>
            Transcription audio is capped at 25 MB by the transcription
            provider — the browser resamples to 16 kHz mono (~2 MB per
            minute), so a 10-minute video fits.
          </li>
          <li>
            Without AI keys, transcription, highlights and voiceover say
            “AI is not connected yet” and manual clipping still works.
          </li>
        </ul>
      </section>
    </div>
  );
}
