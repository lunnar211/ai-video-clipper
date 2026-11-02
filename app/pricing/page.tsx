export default function Pricing() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Pricing</h1>
      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Free — for now</h2>
        <p className="mt-2 text-slate-700">
          This tool is free to use in its current version: upload your own
          video, transcribe, find highlights, and render vertical clips
          with captions. There is no price, no checkout, and no paid plan —
          because paid plans are not configured yet.
        </p>
        <p className="mt-2 text-slate-700">
          The free tier allows 3 rendered clips per day, and free clips
          carry a small watermark. Sign-in (Google) is available once
          the owner configures it; until then everyone uses the free
          tier. If paid plans are added later, they will be announced
          here first with a real price. Nothing on this page is a
          promise of a future price, and no payment details are
          collected anywhere on this site.
        </p>
      </section>
      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">What costs the operator money</h2>
        <p className="mt-2 text-slate-700">
          Honestly: the AI calls. Transcription and highlight picking are
          billed per use to the site operator by the AI providers, while
          rendering runs on your own device for free. That is why the
          server routes are rate-limited (5 requests per minute per
          visitor) — abuse protection, not a paywall.
        </p>
      </section>
    </div>
  );
}
