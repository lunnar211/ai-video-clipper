const faqs = [
  {
    q: "Can I paste a YouTube, TikTok or Instagram link and clip that video?",
    a: "No. This tool has no link box and no downloader of any kind, on purpose. Clipping other people's videos gets channels struck for reused content and copyright. Only upload videos you recorded or own the rights to.",
  },
  {
    q: "What exactly leaves my browser?",
    a: "Your video file never leaves your browser. Transcription sends only the extracted audio track to Groq Whisper. Highlight picking sends only transcript text to a text model. Captions, cropping and rendering all happen on your device. If you use the voiceover option, only the clip title text is sent to ElevenLabs.",
  },
  {
    q: "What happens if no AI key is configured?",
    a: "Transcription, highlights and voiceover answer honestly with “AI is not connected yet” (HTTP 503). Manual clipping, cropping, captions you type yourself, rendering and SRT downloads all still work — the tool is never a dead page.",
  },
  {
    q: "What are the size and length limits?",
    a: "Videos up to 10 minutes and 500 MB (browser limits). Clips up to 3 minutes. Output is 720×1280 vertical video. Transcription audio is capped at 25 MB by the provider, which is why the browser resamples to 16 kHz mono (~2 MB per minute).",
  },
  {
    q: "Will my clip be MP4 or WebM?",
    a: "MP4 where your browser supports recording it (Chrome and Safari do), otherwise WebM. The download link always states the actual format used.",
  },
  {
    q: "How does face-centered cropping work?",
    a: "The browser samples about one frame per second of the clip, runs on-device face detection (MediaPipe, Apache 2.0), and centres the 9:16 window on the median face position. If no face is found or detection fails to load, it falls back to content-aware smart crop (smartcrop, MIT), then to centre crop.",
  },
  {
    q: "Do I need an account or payment?",
    a: "No. There is no sign-in, no database and no payment in this version. See the Pricing page.",
  },
  {
    q: "Can I use the clips commercially?",
    a: "Only if you own the rights to the source video. This tool does not grant you any rights, and it does not check rights for you — that responsibility is yours.",
  },
];

export default function Faq() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">FAQ</h1>
      {faqs.map((f) => (
        <section key={f.q} className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">{f.q}</h2>
          <p className="mt-1 text-slate-700">{f.a}</p>
        </section>
      ))}
    </div>
  );
}
