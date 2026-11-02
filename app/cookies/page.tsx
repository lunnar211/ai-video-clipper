export default function Cookies() {
  return (
    <div className="space-y-4 text-sm text-slate-700">
      <h1 className="text-2xl font-bold text-slate-900">Cookie Policy</h1>
      <p>
        AI Video Clipper uses as few cookies as possible, and no
        advertising trackers at all.
      </p>
      <h2 className="text-lg font-semibold text-slate-900">
        Strictly necessary cookies
      </h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Sign-in session cookies (Supabase Auth): kept only while you
          are signed in, so the site remembers your account across
          pages. Without them, sign-in cannot work.
        </li>
        <li>
          Security cookies set by the hosting platform (Vercel) for
          abuse prevention and load balancing.
        </li>
      </ul>
      <h2 className="text-lg font-semibold text-slate-900">
        What is NOT stored in cookies
      </h2>
      <p>
        Your video, transcript, clips, rights confirmation, quota
        count, and brand kit live in your browser&apos;s local or
        session storage — not in cookies — and never leave your device
        except for the specific server calls described on the Privacy
        Policy page. No analytics, advertising, or cross-site tracking
        cookies are set by this site.
      </p>
      <h2 className="text-lg font-semibold text-slate-900">
        Your choice
      </h2>
      <p>
        You can block or delete cookies in your browser settings. Doing
        so signs you out and may disable sign-in, but the core clipping
        tool keeps working signed-out.
      </p>
    </div>
  );
}
