import type { Metadata } from "next";
import HeroUploadBox from "@/components/HeroUploadBox";
import { getPlans } from "@/lib/billing/plans";
import {
  DEMO_NOTE,
  DEMO_STYLES,
  FEATURES,
  HERO,
  HOME_FAQS,
  PLANS_NOTE,
  PLATFORM_STRIP,
  STEPS,
  VALUE_STRIP,
} from "@/lib/marketing";

/**
 * Marketing homepage (ClipForge Phase 7).
 *
 * Structure follows the reference site (hero → demo → value strip →
 * feature grid → 3 steps → plans comparison → FAQ) with 100% original
 * copy from lib/marketing.ts. The clipper tool itself moved to /create
 * and stays one click away from the hero.
 *
 * Honesty rules enforced here:
 * - no prices: plan prices are unset ("coming soon"), limits come from
 *   the billing config (placeholders until the owner confirms them)
 * - no competitor numbers: the comparison is across this site's own
 *   plans, because no competitor figure was firsthand-verified
 * - demo frames are labelled illustrations, not real creator clips
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
        <h1 id="hero-title" className="text-4xl font-bold text-foreground">
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
        className="rounded-xl bg-primary p-6 text-on-primary"
      >
        <h2 id="value-title" className="text-2xl font-bold">
          {VALUE_STRIP.title}
        </h2>
        <p className="mt-1 text-on-primary/90">{VALUE_STRIP.body}</p>
      </section>

      {/* Demo: illustrated caption-style previews */}
      <section aria-labelledby="demo-title" className="space-y-4">
        <h2 id="demo-title" className="text-2xl font-bold text-foreground">
          See what captioned clips look like
        </h2>
        <div className="flex flex-wrap gap-6">
          {DEMO_STYLES.map((style) => (
            <figure key={style.name} className="w-44">
              <div
                aria-hidden="true"
                className="flex aspect-[9/16] flex-col justify-end rounded-2xl border border-border bg-slate-900 p-3"
              >
                <div className="h-1.5 w-full rounded bg-slate-700">
                  <div className="h-1.5 w-2/3 rounded bg-accent" />
                </div>
                <p className="mt-3 text-center text-sm font-bold text-white">
                  {style.caption}
                </p>
              </div>
              <figcaption className="mt-2 text-center text-sm font-semibold text-foreground">
                {style.name}
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{DEMO_NOTE}</p>
      </section>

      {/* Feature grid */}
      <section aria-labelledby="features-title" className="space-y-4">
        <h2 id="features-title" className="text-2xl font-bold text-foreground">
          Everything the clipper does, in one place
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="rounded-xl bg-card p-5 shadow-sm"
            >
              <h3 className="text-lg font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {feature.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* 3 steps */}
      <section aria-labelledby="steps-title" className="space-y-4">
        <h2 id="steps-title" className="text-2xl font-bold text-foreground">
          Three steps to a posted clip
        </h2>
        <ol className="space-y-4">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="rounded-xl bg-card p-5 shadow-sm"
            >
              <h3 className="text-lg font-semibold text-foreground">
                Step {index + 1}: {step.title}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
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
            className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-accent px-6 py-3 font-semibold text-on-accent transition-colors duration-200 hover:opacity-90"
          >
            Open the clipper
          </a>
        </p>
      </section>

      {/* Plans comparison (this site's own plans — no competitor numbers) */}
      <section aria-labelledby="plans-title" className="space-y-4">
        <h2 id="plans-title" className="text-2xl font-bold text-foreground">
          Plans at a glance
        </h2>
        <div className="overflow-x-auto rounded-xl bg-card shadow-sm">
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
                  className="border-b border-border last:border-0"
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
        <h2 id="faq-title" className="text-2xl font-bold text-foreground">
          Questions, answered honestly
        </h2>
        {HOME_FAQS.map((faq) => (
          <article
            key={faq.q}
            className="rounded-xl bg-card p-5 shadow-sm"
          >
            <h3 className="text-lg font-semibold text-foreground">
              {faq.q}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
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
        className="rounded-xl bg-card p-6 text-center shadow-sm"
      >
        <h2 id="cta-title" className="text-2xl font-bold text-foreground">
          Ready to cut your first clip?
        </h2>
        <p className="mt-3">
          <a
            href="/create"
            className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-accent px-6 py-3 font-semibold text-on-accent transition-colors duration-200 hover:opacity-90"
          >
            Open the clipper
          </a>
        </p>
      </section>
    </div>
  );
}
