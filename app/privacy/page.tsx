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
          recognition provider (AudD, or ACRCloud when configured).
        </li>
        <li>
          Caption safety: only caption/title text is sent to the safety
          provider (NVIDIA) for a content check.
        </li>
      </ul>
      <h2 className="text-lg font-semibold text-slate-900">
        AI and data flow, in plain words
      </h2>
      <p>
        No provider receives your video file. Providers receive only
        the pieces listed above, only when you use the feature that
        needs them, and only while the matching key is configured on
        the server — otherwise the feature honestly says it is not
        connected. Providers&apos; own retention policies apply to
        what they receive; this site does not send them your name,
        email, or video. Translation sends transcript text through the
        same text providers.
      </p>
      <h2 className="text-lg font-semibold text-slate-900">
        What is stored, and for how long
      </h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          In your browser: video, transcript, clips, brand kit, quota
          count, and the session rights confirmation — until you clear
          browser storage or close the session (session items).
        </li>
        <li>
          On the server (only after database setup lands, and only
          when signed in where an account is required): projects,
          clips, usage, share links, brand kits, ownership
          declarations (immutable — they are never edited or deleted
          through the app), checklist records, takedown notices, and
          appeals. These are kept while your account exists; write to
          the Contact page to ask for deletion.
        </li>
        <li>
          Fingerprint scans store only the result (match or no match),
          never the audio sample.
        </li>
      </ul>
      <h2 className="text-lg font-semibold text-slate-900">
        Admin activity logging
      </h2>
      <p>
        Admin actions are logged: who reviewed a strike, changed a
        publishing-pause flag, or viewed the review queue, with
        timestamps. Admins do not see your video content, transcripts,
        or tokens by default; any content access requires a logged,
        reasoned break-glass action. The full admin console, with its
        complete audit log, arrives in a later phase.
      </p>
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
        devices. The rights confirmation is stored in your browser
        session (sessionStorage) and, once database setup lands, also as
        an immutable server record for the project — a record the app
        never edits or deletes. The site uses no advertising trackers.
        See the Cookie Policy for what cookies are used.
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
