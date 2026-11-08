import type { PlanId, PlanLimits } from "@/lib/billing/plans";

/**
 * Plan cards (ClipForge Phase 23) — shared by the homepage "Plans
 * at a glance" section and the pricing page, so the two never drift
 * apart. The old homepage plans table squeezed six columns into a
 * phone viewport and read as a placeholder grid; cards give each
 * plan room to state its limits.
 *
 * Honesty: prices are unset ("Coming soon") — no price is invented
 * here. Limits come from the billing config, which is placeholder
 * data until the owner confirms it.
 */

export type PlansMap = Record<PlanId, PlanLimits>;

const PLAN_BLURBS: Record<PlanId, string> = {
  free: "Try the clipper in your browser — no account, no payment.",
  pro: "For regular creators who cut clips every week.",
  agency: "For teams cutting for several channels at once.",
};

function formatLimit(value: number): string {
  return value === -1 ? "Unlimited" : String(value);
}

export default function PlanCards({ plans }: { plans: PlansMap }) {
  const order: PlanId[] = ["free", "pro", "agency"];
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {order.map((id) => {
        const plan = plans[id];
        const isFree = id === "free";
        return (
          <article
            key={id}
            aria-label={`${id} plan`}
            className={`flex flex-col rounded-xl border bg-card p-6 shadow-sm ${
              isFree
                ? "border-primary ring-1 ring-primary"
                : "border-border"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold capitalize text-foreground">
                {id}
              </h3>
              {isFree ? (
                <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-on-primary">
                  Free — for now
                </span>
              ) : (
                <span className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  Coming soon
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {PLAN_BLURBS[id]}
            </p>
            <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground">
                  Source minutes / month
                </dt>
                <dd className="font-semibold text-foreground">
                  {formatLimit(plan.minutesPerMonth)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground">Projects</dt>
                <dd className="font-semibold text-foreground">
                  {formatLimit(plan.projects)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground">Seats</dt>
                <dd className="font-semibold text-foreground">
                  {formatLimit(plan.seats)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground">Publish targets</dt>
                <dd className="font-semibold text-foreground">
                  {formatLimit(plan.publishTargets)}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-sm font-semibold text-foreground">
              Price: Coming soon
            </p>
          </article>
        );
      })}
    </div>
  );
}
