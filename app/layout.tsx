import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import AuthButtons from "@/components/AuthButtons";
import AdminNavLink from "@/components/AdminNavLink";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

/* Design-system font (Phase 9): Plus Jakarta Sans for headings and
   body, loaded via next/font so there is no render-blocking webfont
   request and no layout shift from a font swap. */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
});

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
      <body className={`${jakarta.variable} font-sans antialiased`}>
        {/* Theme bootstrap: applies the stored theme before first paint
            so the toggle never flashes the wrong mode. The value is
            allowlisted in lib/theme.ts; anything else stays light. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("clipper-theme");if(t==="dark"){document.documentElement.classList.add("dark");}}catch(e){}})();`,
          }}
        />
        <header className="border-b border-border bg-card">
          <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-4 px-4 py-3">
            <Link href="/" className="inline-flex min-h-[44px] items-center text-lg font-bold tracking-tight text-primary">
              <span
                aria-hidden="true"
                className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-accent"
              />
              AI Video Clipper
            </Link>
            <Link href="/create" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-foreground">
              Create
            </Link>
            <Link href="/generate" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-foreground">
              AI Video Generation
            </Link>
            <Link href="/how-it-works" className="inline-flex min-h-[44px] items-center text-sm text-muted-foreground">
              How it works
            </Link>
            <Link href="/faq" className="inline-flex min-h-[44px] items-center text-sm text-muted-foreground">
              FAQ
            </Link>
            <Link href="/pricing" className="inline-flex min-h-[44px] items-center text-sm text-muted-foreground">
              Pricing
            </Link>
            <Link href="/publish" className="inline-flex min-h-[44px] items-center text-sm text-muted-foreground">
              Publish
            </Link>
            <Link href="/accounts" className="inline-flex min-h-[44px] items-center text-sm text-muted-foreground">
              Accounts
            </Link>
            <Link href="/analytics" className="inline-flex min-h-[44px] items-center text-sm text-muted-foreground">
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
        <footer className="border-t border-border bg-card">
          <div className="mx-auto max-w-4xl px-4 py-6 text-sm text-muted-foreground">
            <p>
              Clip your own videos only — you must own the rights to
              the video you clip, or use a link to a video with a
              verified free licence. This tool never downloads videos
              from YouTube, TikTok, or Instagram.
            </p>
            <p className="mt-2 flex flex-wrap gap-4">
              <a className="inline-flex min-h-[44px] items-center underline" href="/privacy">Privacy Policy</a>
              <a className="inline-flex min-h-[44px] items-center underline" href="/terms">Terms of Use</a>
              <a className="inline-flex min-h-[44px] items-center underline" href="/contact">Contact</a>
              <a className="inline-flex min-h-[44px] items-center underline" href="/copyright">Copyright / DMCA</a>
              <a className="inline-flex min-h-[44px] items-center underline" href="/cookies">Cookie Policy</a>
              <a className="inline-flex min-h-[44px] items-center underline" href="/acceptable-use">Acceptable Use</a>
              <a className="inline-flex min-h-[44px] items-center underline" href="/report">Report infringement</a>
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
