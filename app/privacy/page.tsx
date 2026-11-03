export default function Privacy() {
  return (
    <div className="space-y-4 text-sm text-muted-foreground">
      <h1 className="text-2xl font-bold text-foreground">Privacy Policy</h1>
      <p>
        AI Video Clipper is built so that as little as possible leaves
        your browser. This page describes what is sent where, in plain
        language.
      </p>
      <h2 className="text-lg font-semibold text-foreground">
        What stays in your browser
      </h2>
      <p>
        Your video file never leaves your device. Cropping, caption
        burn-in and rendering all run on-device. Clips you render are
        stored only as browser object URLs until you download them.
      </p>
      <h2 className="text-lg font-semibold text-foreground">
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
      <h2 className="text-lg font-semibold text-foreground">
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
      <h2 className="text-lg font-semibold text-foreground">
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
      <h2 className="text-lg font-semibold text-foreground">
        Admin activity logging
      </h2>
      <p>
        Admin actions are logged: who reviewed a strike, changed a
        publishing-pause flag, or viewed the review queue, with
        timestamps. Admins do not see your video content, transcripts,
        or tokens by default; any content access requires a logged,
        reasoned break-glass action. The full admin console is live:
        role-based access (owner, admin, support, analyst, viewer),
        with TOTP two-factor authentication required for owner and
        admin sessions. Its audit log records sign-ins, uploads,
        project creation, AI jobs and their recorded cost, renders,
        account links, scheduled/published/failed posts, billing
        events, rights declarations, fingerprint results, strikes, and
        every admin action — each entry with actor, action, target,
        metadata, IP, user-agent, and timestamp. The log is
        append-only: nothing in the app can edit or delete an entry,
        except a retention purge (default 365 days, configurable) that
        itself writes an audit entry. Admins can view dashboards
        (activity, funnel, queue health, cost, revenue, publish
        success, errors, strikes, anomaly alerts) built only from real
        database aggregates — without a configured database the
        dashboards show setup instructions, never invented numbers.
        An admin may view the console as another user only with a
        written reason: that view-as session is read-only (it can
        never publish, bill, or change anything as the user), shows a
        visible banner for its whole duration, and its start and end
        are audited. Content access beyond safe metadata requires a
        separate break-glass grant: one item, one reason, 15 minutes,
        single use, fully audited, and the item&apos;s content is
        never copied into any log. A live event feed streams recent
        audit entries to the console, and anomaly alerts can be sent
        to configured Slack, Discord, or email webhooks (inert until a
        webhook URL is configured; in-console alerts always work).
      </p>
      <h2 className="text-lg font-semibold text-foreground">
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
      <h2 className="text-lg font-semibold text-foreground">
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
      <h2 className="text-lg font-semibold text-foreground">Contact</h2>
      <p>
        Privacy questions go to the contact address on the Contact page.
        The address there is a placeholder until the owner publishes a
        real one — see the Contact page.
      </p>
    </div>
  );
}
