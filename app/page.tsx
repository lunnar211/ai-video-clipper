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
        <p className="text-sm font-semibold tracking-wide text-violet-700 uppercase dark:text-violet-400">
          {HERO.eyebrow}
        </p>
        <h1 id="hero-title" className="text-4xl font-bold text-slate-900 dark:text-white">
          {HERO.title}
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-300">{HERO.sub}</p>
        <HeroUploadBox />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {PLATFORM_STRIP}
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {HERO.reassurance}
        </p>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {HERO.rightsNote}
        </p>
      </section>

      {/* Value strip */}
      <section
        aria-labelledby="value-title"
        className="rounded-xl bg-violet-700 p-6 text-white dark:bg-violet-900"
      >
        <h2 id="value-title" className="text-2xl font-bold">
          {VALUE_STRIP.title}
        </h2>
        <p className="mt-1 text-violet-100">{VALUE_STRIP.body}</p>
      </section>

      {/* Demo: illustrated caption-style previews */}
      <section aria-labelledby="demo-title" className="space-y-4">
        <h2 id="demo-title" className="text-2xl font-bold text-slate-900 dark:text-white">
          See what captioned clips look like
        </h2>
        <div className="flex flex-wrap gap-6">
          {DEMO_STYLES.map((style) => (
            <figure key={style.name} className="w-44">
              <div
                aria-hidden="true"
                className="flex aspect-[9/16] flex-col justify-end rounded-2xl border border-slate-300 bg-slate-900 p-3 dark:border-slate-700"
              >
                <div className="h-1.5 w-full rounded bg-slate-700">
                  <div className="h-1.5 w-2/3 rounded bg-violet-400" />
                </div>
                <p className="mt-3 text-center text-sm font-bold text-white">
                  {style.caption}
                </p>
              </div>
              <figcaption className="mt-2 text-center text-sm font-semibold text-slate-900 dark:text-white">
                {style.name}
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{DEMO_NOTE}</p>
      </section>

      {/* Feature grid */}
      <section aria-labelledby="features-title" className="space-y-4">
        <h2 id="features-title" className="text-2xl font-bold text-slate-900 dark:text-white">
          Everything the clipper does, in one place
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="rounded-xl bg-white p-5 shadow-sm dark:bg-slate-900"
            >
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {feature.title}
              </h3>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                {feature.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* 3 steps */}
      <section aria-labelledby="steps-title" className="space-y-4">
        <h2 id="steps-title" className="text-2xl font-bold text-slate-900 dark:text-white">
          Three steps to a posted clip
        </h2>
        <ol className="space-y-4">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="rounded-xl bg-white p-5 shadow-sm dark:bg-slate-900"
            >
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Step {index + 1}: {step.title}
              </h3>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                {step.body}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                {step.proof}
              </p>
            </li>
          ))}
        </ol>
        <p className="text-sm">
          <a
            href="/create"
            className="inline-block rounded-lg bg-violet-700 px-6 py-3 font-semibold text-white hover:bg-violet-800"
          >
            Open the clipper
          </a>
        </p>
      </section>

      {/* Plans comparison (this site's own plans — no competitor numbers) */}
      <section aria-labelledby="plans-title" className="space-y-4">
        <h2 id="plans-title" className="text-2xl font-bold text-slate-900 dark:text-white">
          Plans at a glance
        </h2>
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm dark:bg-slate-900">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th scope="col" className="px-4 py-3 text-slate-900 dark:text-white">Plan</th>
                <th scope="col" className="px-4 py-3 text-slate-900 dark:text-white">Source minutes / month</th>
                <th scope="col" className="px-4 py-3 text-slate-900 dark:text-white">Projects</th>
                <th scope="col" className="px-4 py-3 text-slate-900 dark:text-white">Seats</th>
                <th scope="col" className="px-4 py-3 text-slate-900 dark:text-white">Publish targets</th>
                <th scope="col" className="px-4 py-3 text-slate-900 dark:text-white">Price</th>
              </tr>
            </thead>
            <tbody>
              {(["free", "pro", "agency"] as const).map((id) => (
                <tr
                  key={id}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                >
                  <th scope="row" className="px-4 py-3 font-semibold capitalize text-slate-900 dark:text-white">
                    {id}
                  </th>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {formatLimit(plans[id].minutesPerMonth)}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {formatLimit(plans[id].projects)}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {formatLimit(plans[id].seats)}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {formatLimit(plans[id].publishTargets)}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    Coming soon
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {PLANS_NOTE}{" "}
          <a href="/pricing" className="underline">
            Read the full pricing page
          </a>
          .
        </p>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-title" className="space-y-4">
        <h2 id="faq-title" className="text-2xl font-bold text-slate-900 dark:text-white">
          Questions, answered honestly
        </h2>
        {HOME_FAQS.map((faq) => (
          <article
            key={faq.q}
            className="rounded-xl bg-white p-5 shadow-sm dark:bg-slate-900"
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {faq.q}
            </h3>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
              {faq.a}
            </p>
          </article>
        ))}
        <p className="text-sm">
          <a href="/faq" className="underline">
            Read all frequently asked questions
          </a>
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
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
        className="rounded-xl bg-white p-6 text-center shadow-sm dark:bg-slate-900"
      >
        <h2 id="cta-title" className="text-2xl font-bold text-slate-900 dark:text-white">
          Ready to cut your first clip?
        </h2>
        <p className="mt-3">
          <a
            href="/create"
            className="inline-block rounded-lg bg-violet-700 px-6 py-3 font-semibold text-white hover:bg-violet-800"
          >
            Open the clipper
          </a>
        </p>
      </section>
    </div>
  );
}
