import ClipperTool from "@/components/ClipperTool";

export default function Home() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-bold">
          Turn your videos into vertical clips
        </h1>
        <p className="mt-2 text-slate-600">
          Upload a video you own. AI transcribes it and picks the best
          30–60 second moments, then you render them as 9:16 clips with
          burned-in captions, titles and hashtags — ready for TikTok,
          Reels and Shorts. No AI key? Cut clips by hand; the tool never
          becomes a dead page.
        </p>
      </section>
      <ClipperTool />
      <section className="rounded-xl bg-white p-5 text-sm text-slate-700 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
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
