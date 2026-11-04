import type { Metadata } from "next";
import HeroUploadBox from "@/components/HeroUploadBox";
import { getPlans } from "@/lib/billing/plans";
import {
  FEATURES,
  HERO,
  HOME_FAQS,
  PLANS_NOTE,
  PLATFORM_STRIP,
  STEPS,
  VALUE_STRIP,
} from "@/lib/marketing";

/**
 * Marketing homepage (ClipForge Phase 7, revised Phase 10).
 *
 * Structure: hero → value strip → see-it-work (the real tool) →
 * feature grid → 3 steps → plans comparison → FAQ. The Phase 7
 * illustrated demo section was deleted in Phase 10: no drawings, no
 * fake clips, no placeholder videos anywhere on the site. The "See it
 * work" section below reuses the real hero upload box — it opens the
 * actual clipper, it does not simulate output.
 *
 * Honesty rules enforced here:
 * - no prices: plan prices are unset ("coming soon"), limits come from
 *   the billing config (placeholders until the owner confirms them)
 * - no competitor numbers: the comparison is across this site's own
 *   plans, because no competitor figure was firsthand-verified
 * - gated states are stated (publishing off until app approval)
 */

export const metadata: Metadata = {
  title: "AI Video Clipper — turn your videos into vertical clips",
  description:
    "Turn videos you own into captioned vertical clips for TikTok, Reels, and Shorts — in your browser, with no account needed to try.",
  openGraph: {
    title: "AI Video Clipper — turn your videos into vertical clips",
    description:
      "Turn videos you own into captioned vertical clips for TikTok, Reels, and Shorts — in your browser, with no account needed to try.",
    type: "website",
  },
};

function formatLimit(value: number): string {
  return value === -1 ? "Unlimited" : String(value);
}

export default function Home() {
  const plans = getPlans();
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: HOME_FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <div className="space-y-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* Hero */}
      <section aria-labelledby="hero-title" className="space-y-4">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">
          {HERO.eyebrow}
        </p>
        <h1 id="hero-title" className="text-4xl font-bold tracking-tight text-foreground md:text-5xl md:leading-tight">
          {HERO.title}
        </h1>
        <p className="text-lg text-muted-foreground">{HERO.sub}</p>
        <HeroUploadBox />
        <p className="text-sm font-medium text-foreground">
          {PLATFORM_STRIP}
        </p>
        <p className="text-sm text-muted-foreground">
          {HERO.reassurance}
        </p>
        <p className="text-sm font-medium text-foreground">
          {HERO.rightsNote}
        </p>
      </section>

      {/* Value strip */}
      <section
        aria-labelledby="value-title"
        className="rounded-xl border border-border bg-primary p-6 text-on-primary shadow-sm"
      >
        <h2 id="value-title" className="text-2xl font-bold tracking-tight">
          {VALUE_STRIP.title}
        </h2>
        <p className="mt-1 text-on-primary/90">{VALUE_STRIP.body}</p>
      </section>

      {/* See it work: the real tool, not a preview (Phase 10). */}
      <section aria-labelledby="see-it-work-title" className="space-y-4">
        <h2 id="see-it-work-title" className="text-2xl font-bold tracking-tight text-foreground">
          See it work
        </h2>
        <p className="text-muted-foreground">
          No preview video, no staged result. The box below is the real
          tool: choose a video you own and it opens in the clipper,
          where transcription, moments, captions, and rendering happen
          for real, on your own recording.
        </p>
        <HeroUploadBox id="see-it-work-upload" />
      </section>

      {/* Feature grid */}
      <section aria-labelledby="features-title" className="space-y-4">
        <h2 id="features-title" className="text-2xl font-bold tracking-tight text-foreground">
          What the clipper does
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="rounded-xl border border-border bg-card p-6 shadow-sm transition-colors duration-200 hover:border-primary/40"
            >
              <h3 className="text-lg font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {feature.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* 3 steps */}
      <section aria-labelledby="steps-title" className="space-y-4">
        <h2 id="steps-title" className="text-2xl font-bold tracking-tight text-foreground">
          Three steps to a posted clip
        </h2>
        <ol className="space-y-4">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="rounded-xl border border-border bg-card p-6 shadow-sm"
            >
              <h3 className="text-lg font-semibold text-foreground">
                Step {index + 1}: {step.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {step.body}
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {step.proof}
              </p>
            </li>
          ))}
        </ol>
        <p className="text-sm">
          <a
            href="/create"
            className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-accent px-6 py-3 font-semibold text-on-accent transition-colors duration-200 hover:opacity-90 active:opacity-80"
          >
            Open the clipper
          </a>
        </p>
      </section>

      {/* Plans comparison (this site's own plans — no competitor numbers) */}
      <section aria-labelledby="plans-title" className="space-y-4">
        <h2 id="plans-title" className="text-2xl font-bold tracking-tight text-foreground">
          Plans at a glance
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-3 text-foreground">Plan</th>
                <th scope="col" className="px-4 py-3 text-foreground">Source minutes / month</th>
                <th scope="col" className="px-4 py-3 text-foreground">Projects</th>
                <th scope="col" className="px-4 py-3 text-foreground">Seats</th>
                <th scope="col" className="px-4 py-3 text-foreground">Publish targets</th>
                <th scope="col" className="px-4 py-3 text-foreground">Price</th>
              </tr>
            </thead>
            <tbody>
              {(["free", "pro", "agency"] as const).map((id) => (
                <tr
                  key={id}
                  className="border-b border-border transition-colors duration-200 last:border-0 hover:bg-muted/60"
                >
                  <th scope="row" className="px-4 py-3 font-semibold capitalize text-foreground">
                    {id}
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatLimit(plans[id].minutesPerMonth)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatLimit(plans[id].projects)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatLimit(plans[id].seats)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatLimit(plans[id].publishTargets)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Coming soon
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground">
          {PLANS_NOTE}{" "}
          <a href="/pricing" className="underline">
            Read the full pricing page
          </a>
          .
        </p>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-title" className="space-y-4">
        <h2 id="faq-title" className="text-2xl font-bold tracking-tight text-foreground">
          Common questions
        </h2>
        {HOME_FAQS.map((faq) => (
          <article
            key={faq.q}
            className="rounded-xl border border-border bg-card p-6 shadow-sm"
          >
            <h3 className="text-lg font-semibold text-foreground">
              {faq.q}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {faq.a}
            </p>
          </article>
        ))}
        <p className="text-sm">
          <a href="/faq" className="underline">
            Read all frequently asked questions
          </a>
        </p>
        <p className="text-sm text-muted-foreground">
          Still have questions?{" "}
          <a href="/contact" className="underline">
            Contact the site owner
          </a>
          .
        </p>
      </section>

      {/* Final call to action */}
      <section
        aria-labelledby="cta-title"
        className="rounded-xl border border-border bg-card p-6 text-center shadow-sm"
      >
        <h2 id="cta-title" className="text-2xl font-bold tracking-tight text-foreground">
          Ready to cut your first clip?
        </h2>
        <p className="mt-3">
          <a
            href="/create"
            className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-accent px-6 py-3 font-semibold text-on-accent transition-colors duration-200 hover:opacity-90 active:opacity-80"
          >
            Open the clipper
          </a>
        </p>
        <p className="mt-3 text-sm">
          <a href="/generate" className="underline">
            Or generate a short from a topic — no video needed
          </a>
        </p>
      </section>
    </div>
  );
}
