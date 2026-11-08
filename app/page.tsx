import type { Metadata } from "next";
import HeroUploadBox from "@/components/HeroUploadBox";
import FeatureIcon from "@/components/FeatureIcon";
import PlanCards from "@/components/PlanCards";
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

      {/* Hero: copy left, the real tool panel right (desktop). The
          panel is the same upload box — on a phone it stacks below
          the copy, in the same order as before. */}
      <section aria-labelledby="hero-title" className="lg:grid lg:grid-cols-[1fr_1.05fr] lg:items-start lg:gap-10">
        <div className="space-y-4">
          <p className="text-sm font-semibold tracking-wide text-primary uppercase">
            {HERO.eyebrow}
          </p>
          <h1 id="hero-title" className="text-4xl font-bold tracking-tight text-foreground md:text-5xl md:leading-tight">
            {HERO.title}
          </h1>
          <p className="text-lg text-muted-foreground">{HERO.sub}</p>
          <p className="text-sm font-medium text-foreground">
            {PLATFORM_STRIP}
          </p>
          <p className="text-sm text-muted-foreground">
            {HERO.reassurance}
          </p>
          <p className="text-sm font-medium text-foreground">
            {HERO.rightsNote}
          </p>
        </div>
        <div className="mt-6 lg:mt-0">
          <HeroUploadBox />
        </div>
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

      {/* See it work: the real tool, not a preview (Phase 10).
          The box is the same upload entry as the hero, so it sits
          in a distinct dark "live tool" frame — the two entries
          must never look like a copy-paste of each other. */}
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
        <div className="rounded-xl border border-border bg-primary p-1.5 shadow-sm sm:p-2">
          <p className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-on-primary">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full bg-accent"
            />
            Live tool — the real clipper, not a preview
          </p>
          <div className="rounded-lg bg-background">
            <HeroUploadBox id="see-it-work-upload" />
          </div>
        </div>
      </section>

      {/* Feature grid: each feature gets its own drawn icon so the
          grid stops reading as ten identical text cards. The first
          feature spans the row on desktop — it is the core of the
          product. Copy is unchanged (pinned by marketing tests). */}
      <section aria-labelledby="features-title" className="space-y-4">
        <h2 id="features-title" className="text-2xl font-bold tracking-tight text-foreground">
          What the clipper does
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {FEATURES.map((feature, index) => (
            <article
              key={feature.title}
              className={`rounded-xl border bg-card p-6 shadow-sm transition-colors duration-200 hover:border-primary/40 ${
                index === 0
                  ? "border-primary/40 sm:col-span-2"
                  : "border-border"
              }`}
            >
              <span
                aria-hidden="true"
                className={`inline-flex h-11 w-11 items-center justify-center rounded-lg ${
                  index === 0
                    ? "bg-accent text-on-accent"
                    : "bg-muted text-foreground"
                }`}
              >
                <FeatureIcon title={feature.title} className="h-6 w-6" />
              </span>
              <h3 className="mt-3 text-lg font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {feature.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* 3 steps: a numbered timeline, not three identical cards. */}
      <section aria-labelledby="steps-title" className="space-y-4">
        <h2 id="steps-title" className="text-2xl font-bold tracking-tight text-foreground">
          Three steps to a posted clip
        </h2>
        <ol className="space-y-6">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex gap-4 rounded-xl border border-border bg-card p-6 shadow-sm"
            >
              <span
                aria-hidden="true"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-base font-bold text-on-accent"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-foreground">
                  Step {index + 1}: {step.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {step.proof}
                </p>
              </div>
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

      {/* Plans comparison (this site's own plans — no competitor numbers).
          Cards, not a six-column table: the table squeezed into a
          phone viewport and read as a placeholder grid. */}
      <section aria-labelledby="plans-title" className="space-y-4">
        <h2 id="plans-title" className="text-2xl font-bold tracking-tight text-foreground">
          Plans at a glance
        </h2>
        <PlanCards plans={plans} />
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
