export default function Privacy() {
  return (
    <div className="space-y-4 text-sm text-slate-700">
      <h1 className="text-2xl font-bold text-slate-900">Privacy Policy</h1>
      <p>
        AI Video Clipper is built so that as little as possible leaves
        your browser. This page describes what is sent where, in plain
        language.
      </p>
      <h2 className="text-lg font-semibold text-slate-900">
        What stays in your browser
      </h2>
      <p>
        Your video file never leaves your device. Cropping, caption
        burn-in and rendering all run on-device. Clips you render are
        stored only as browser object URLs until you download them.
      </p>
      <h2 className="text-lg font-semibold text-slate-900">
        What is sent to the server
      </h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Transcription: only the resampled audio track (16 kHz mono) is
          sent to the transcription provider (Groq Whisper).
        </li>
        <li>
          Highlight picking and viral metadata: only transcript text is
          sent to the text providers (Groq, Gemini, OpenRouter).
        </li>
        <li>
          Voiceover: only the clip title text is sent to the voice
          provider (ElevenLabs).
        </li>
        <li>
          Music check: only a ≤15 second audio sample is sent to the
          recognition provider (AudD).
        </li>
      </ul>
      <h2 className="text-lg font-semibold text-slate-900">
        Publishing (only if you use it)
      </h2>
      <p>
        If you connect a social account and publish a clip, the rendered
        clip file is uploaded to short-lived object storage (see the
        publish consent screen) and deleted automatically within 24
        hours. The platform you publish to receives the clip, title,
        description and tags you chose. Publishing is off by default and
        requires your explicit connection and consent for each platform.
      </p>
      <h2 className="text-lg font-semibold text-slate-900">
        Accounts and cookies
      </h2>
      <p>
        Sign-in is optional. If you sign in, your account email and your
        projects, clips and usage are stored so your history works across
        devices. The rights confirmation is stored only in your browser
        session (sessionStorage) and is never sent to the server. The
        site uses no advertising trackers.
      </p>
      <h2 className="text-lg font-semibold text-slate-900">Contact</h2>
      <p>
        Privacy questions go to the contact address on the Contact page.
        The address there is a placeholder until the owner publishes a
        real one — see the Contact page.
      </p>
    </div>
  );
}
