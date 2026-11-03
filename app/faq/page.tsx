const faqs = [
  {
    q: "Can I paste a YouTube, TikTok or Instagram link and clip that video?",
    a: "No. Links from those platforms are refused, and there is no downloader of any kind. Clipping other people's videos gets channels struck for reused content and copyright. You can upload a video you recorded or own the rights to, or paste a link to a video with a verified free licence from Wikimedia Commons or Internet Archive — the licence is checked before anything loads, and attribution is added automatically.",
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
    a: "The clipper works without an account. Sign-in, publishing, and paid tiers exist only when the server is configured for them (see the Publish and Accounts pages); without that setup the tool keeps working in its free browser mode. See the Pricing page.",
  },
  {
    q: "Can I use the clips commercially?",
    a: "Only if you own the rights to the source video. This tool does not grant you any rights, and it does not check rights for you — that responsibility is yours.",
  },
  {
    q: "What leaves this site when I publish a clip?",
    a: "Only what the target platform needs: the rendered clip bytes, the title, description, tags, and visibility you chose for that post, sent to that platform's official API over HTTPS using the account you connected. Your account tokens are encrypted on the server and are never sent to any platform except that platform itself, and never shown to you or to admins. Publishing is refused until the platform's feature flag is on and its app review is approved.",
  },
  {
    q: "Where does my staged media live, and for how long?",
    a: "Clips staged for publishing live in object storage under a temporary prefix. They are deleted automatically after publishing, and a bucket lifecycle rule removes anything left behind after 24 hours. Nothing staged for publishing is kept longer than that.",
  },
  {
    q: "Are the view counts on the Analytics page real?",
    a: "Yes — they are exactly what the platform's own API reported for that post, synced after publishing. Platforms whose analytics adapters are not built yet report as unsupported, never as invented numbers. With no connected accounts, the page says so plainly.",
  },
  {
    q: "Can I publish to a platform before its app is approved?",
    a: "No. Each platform stays off until its app review is approved and its approval flag is set. Connect may still show for testing, but any publish attempt is refused with the reason stated.",
  },
];

export default function Faq() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">FAQ</h1>
      {faqs.map((f) => (
        <section key={f.q} className="rounded-xl bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">{f.q}</h2>
          <p className="mt-1 text-muted-foreground">{f.a}</p>
        </section>
      ))}
    </div>
  );
}
