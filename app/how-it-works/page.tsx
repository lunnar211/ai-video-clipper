export default function HowItWorks() {
  const steps = [
    {
      title: "1. Upload a video you own",
      body: "Drop a video file (up to 10 minutes, 500 MB). It stays in your browser — the site has no upload of the raw video, and no video database.",
    },
    {
      title: "2. Transcribe (AI, optional)",
      body: "The browser extracts the audio track, resamples it to 16 kHz mono, and sends only that audio to the transcription service (Groq Whisper). You get timestamped segments back.",
    },
    {
      title: "3. Pick moments (AI, optional)",
      body: "The transcript text (never the video) goes to a text model — Groq first, then Gemini, then OpenRouter — which picks up to 5 moments of 30–60 seconds with a title and hashtags each.",
    },
    {
      title: "4. Or cut by hand (always works)",
      body: "Enter start and end times yourself, add an optional caption, and the clip is ready to render. No key, no account, no waiting.",
    },
    {
      title: "5. Render vertical, with captions",
      body: "The browser crops the clip to 9:16 — face-centered when a face is found, smart-cropped otherwise — burns the captions onto the picture, mixes in the original audio (plus an optional AI voiceover reading the title), and gives you a download plus an SRT caption file.",
    },
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">How it works</h1>
      {steps.map((s) => (
        <section key={s.title} className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">{s.title}</h2>
          <p className="mt-1 text-slate-700">{s.body}</p>
        </section>
      ))}
    </div>
  );
}
