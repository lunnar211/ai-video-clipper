import type { Metadata } from "next";
import Link from "next/link";
import AuthButtons from "@/components/AuthButtons";
import AdminNavLink from "@/components/AdminNavLink";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Video Clipper — turn your videos into vertical clips",
  description:
    "Cut 9:16 short-form clips from videos you own, with AI transcripts, highlight moments, burned-in captions, titles and hashtags. Your video stays in your browser.",
  openGraph: {
    title: "AI Video Clipper — turn your videos into vertical clips",
    description:
      "Cut 9:16 short-form clips from videos you own, with AI transcripts, highlight moments, burned-in captions, titles and hashtags.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Theme bootstrap: applies the stored theme before first paint
            so the toggle never flashes the wrong mode. The value is
            allowlisted in lib/theme.ts; anything else stays light. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("clipper-theme");if(t==="dark"){document.documentElement.classList.add("dark");}}catch(e){}})();`,
          }}
        />
        <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-4 px-4 py-3">
            <Link href="/" className="text-lg font-bold text-violet-700 dark:text-violet-400">
              AI Video Clipper
            </Link>
            <Link href="/create" className="text-sm font-semibold text-slate-900 dark:text-white">
              Create
            </Link>
            <Link href="/how-it-works" className="text-sm text-slate-700 dark:text-slate-200">
              How it works
            </Link>
            <Link href="/faq" className="text-sm text-slate-700 dark:text-slate-200">
              FAQ
            </Link>
            <Link href="/pricing" className="text-sm text-slate-700 dark:text-slate-200">
              Pricing
            </Link>
            <Link href="/publish" className="text-sm text-slate-700 dark:text-slate-200">
              Publish
            </Link>
            <Link href="/accounts" className="text-sm text-slate-700 dark:text-slate-200">
              Accounts
            </Link>
            <Link href="/analytics" className="text-sm text-slate-700 dark:text-slate-200">
              Analytics
            </Link>
            <AdminNavLink />
            <span className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <AuthButtons />
            </span>
          </nav>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
        <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto max-w-4xl px-4 py-6 text-sm text-slate-600 dark:text-slate-400">
            <p>
              Clip your own videos only — you must own the rights to the
              video you clip. This tool never downloads videos from any
              platform.
            </p>
            <p className="mt-2 flex flex-wrap gap-4">
              <a className="underline" href="/privacy">Privacy Policy</a>
              <a className="underline" href="/terms">Terms of Use</a>
              <a className="underline" href="/contact">Contact</a>
              <a className="underline" href="/copyright">Copyright / DMCA</a>
              <a className="underline" href="/cookies">Cookie Policy</a>
              <a className="underline" href="/acceptable-use">Acceptable Use</a>
              <a className="underline" href="/report">Report infringement</a>
            </p>
            <p className="mt-2">
              Face detection uses MediaPipe (Apache 2.0); content-aware
              cropping uses smartcrop (MIT). See the FAQ for what leaves
              your browser and what does not.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
