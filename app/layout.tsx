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
          {/* Two-row header (Phase 20): row 1 is the brand + theme +
              auth; row 2 is a single horizontally scrollable link
              bar. The old one-row flex-wrap header wrapped into
              4–5 ragged rows on a phone and buried links. Every
              link keeps a 44px touch height and stays reachable by
              scrolling the bar — nothing wraps, nothing strands. */}
          <div className="mx-auto max-w-4xl px-4 pt-3">
            <div className="flex items-center gap-3">
              {/* Brand never wraps: on a 390px phone the old text-lg
                  wordmark broke into two lines and crowded the auth
                  area. text-base on phones, text-lg from sm up. */}
              <Link href="/" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-base font-bold tracking-tight text-primary sm:text-lg">
                <span
                  aria-hidden="true"
                  className="mr-2 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-accent"
                />
                AI Video Clipper
              </Link>
              <span className="ml-auto flex min-w-0 items-center gap-2">
                <ThemeToggle />
                <AuthButtons />
              </span>
            </div>
          </div>
          <nav aria-label="Main" className="mx-auto max-w-4xl px-4">
            {/* The bar scrolls horizontally on phones; a fade at the
                right edge shows there is more to scroll to — the old
                bar just cut links off with no cue. */}
            <div className="flex flex-nowrap items-center gap-4 overflow-x-auto pb-3 [mask-image:linear-gradient(to_right,black_92%,transparent_100%)]">
              <Link href="/create" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-sm font-semibold text-foreground">
                Create
              </Link>
              <Link href="/generate" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-sm font-semibold text-foreground">
                AI Video Generation
              </Link>
              <Link href="/how-it-works" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-sm text-muted-foreground">
                How it works
              </Link>
              <Link href="/faq" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-sm text-muted-foreground">
                FAQ
              </Link>
              <Link href="/pricing" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-sm text-muted-foreground">
                Pricing
              </Link>
              <Link href="/publish" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-sm text-muted-foreground">
                Publish
              </Link>
              <Link href="/accounts" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-sm text-muted-foreground">
                Accounts
              </Link>
              <Link href="/analytics" className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-sm text-muted-foreground">
                Analytics
              </Link>
              <AdminNavLink />
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
        <footer className="border-t border-border bg-card">
          <div className="mx-auto max-w-4xl px-4 py-8 text-sm text-muted-foreground">
            {/* Structured footer: brand + three link columns instead
                of one flat wrap of links. Same links, same compliance
                paragraph, same MediaPipe credit — only the layout
                changed. */}
            <div className="grid gap-6 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
              <div>
                <p className="inline-flex items-center font-bold text-foreground">
                  <span
                    aria-hidden="true"
                    className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-accent"
                  />
                  AI Video Clipper
                </p>
                <p className="mt-2">
                  Turn videos you own into captioned vertical clips —
                  in your browser.
                </p>
              </div>
              <nav aria-label="Product">
                <p className="font-semibold text-foreground">Product</p>
                <ul className="mt-2 space-y-1">
                  <li><a className="inline-flex min-h-[32px] items-center underline" href="/create">Create clips</a></li>
                  <li><a className="inline-flex min-h-[32px] items-center underline" href="/generate">Generate a short</a></li>
                  <li><a className="inline-flex min-h-[32px] items-center underline" href="/publish">Publish</a></li>
                  <li><a className="inline-flex min-h-[32px] items-center underline" href="/pricing">Pricing</a></li>
                </ul>
              </nav>
              <nav aria-label="Learn">
                <p className="font-semibold text-foreground">Learn</p>
                <ul className="mt-2 space-y-1">
                  <li><a className="inline-flex min-h-[32px] items-center underline" href="/how-it-works">How it works</a></li>
                  <li><a className="inline-flex min-h-[32px] items-center underline" href="/faq">FAQ</a></li>
                  <li><a className="inline-flex min-h-[32px] items-center underline" href="/contact">Contact</a></li>
                </ul>
              </nav>
              <nav aria-label="Legal">
                <p className="font-semibold text-foreground">Legal</p>
                <ul className="mt-2 space-y-1">
                  <li><a className="inline-flex min-h-[32px] items-center underline" href="/privacy">Privacy Policy</a></li>
                  <li><a className="inline-flex min-h-[32px] items-center underline" href="/terms">Terms of Use</a></li>
                  <li><a className="inline-flex min-h-[32px] items-center underline" href="/copyright">Copyright / DMCA</a></li>
                  <li><a className="inline-flex min-h-[32px] items-center underline" href="/cookies">Cookie Policy</a></li>
                  <li><a className="inline-flex min-h-[32px] items-center underline" href="/acceptable-use">Acceptable Use</a></li>
                  <li><a className="inline-flex min-h-[32px] items-center underline" href="/report">Report infringement</a></li>
                </ul>
              </nav>
            </div>
            <p className="mt-6 border-t border-border pt-4">
              Clip your own videos only — you must own the rights to
              the video you clip, or use a link to a video with a
              verified free licence. This tool never downloads videos
              from YouTube, TikTok, or Instagram.
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
