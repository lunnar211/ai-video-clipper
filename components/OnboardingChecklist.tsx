"use client";

import { useEffect, useState } from "react";

/**
 * First-run guide for the clipper (ClipForge Phase 7 onboarding).
 *
 * A short, dismissible checklist shown above the tool until the
 * visitor dismisses it; the dismissal persists in localStorage. It
 * guides, it does not track — no step is marked done automatically,
 * because the tool deliberately keeps no account or progress state
 * for signed-out visitors.
 */

const ONBOARDING_KEY = "clipper-onboarding-dismissed";

const STEPS = [
  "Upload a video you own — or pick one up from the homepage hero.",
  "Confirm you own or licensed the video and its music.",
  "Transcribe with AI, or cut moments by hand when AI is off.",
  "Render vertical clips with captions, then download, share, or queue them.",
];

export default function OnboardingChecklist() {
  const [visible, setVisible] = useState(false);

  // Client-only read: localStorage does not exist during SSR, so the
  // dismissal is checked after mount. Deferred past commit so the
  // mount sync does not cascade renders during the commit phase.
  useEffect(() => {
    queueMicrotask(() => {
      if (window.localStorage.getItem(ONBOARDING_KEY) !== "1") {
        setVisible(true);
      }
    });
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    window.localStorage.setItem(ONBOARDING_KEY, "1");
    setVisible(false);
  };

  return (
    <section
      aria-label="First-run guide"
      className="rounded-xl border border-primary/25 bg-primary/5 p-5 dark:bg-primary/10"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg font-semibold text-foreground">
          First time here? Four steps to your first clip
        </h2>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss the first-run guide"
          className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center rounded-lg border border-border bg-card px-3 py-1 text-sm text-foreground transition-colors duration-200 hover:bg-muted"
        >
          Dismiss
        </button>
      </div>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        {STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="mt-2 text-sm text-muted-foreground">
        Stuck? <a href="/how-it-works" className="underline">How it works</a>{" "}
        explains each step, and <a href="/faq" className="underline">FAQ</a>{" "}
        answers what leaves your browser.
      </p>
    </section>
  );
}
