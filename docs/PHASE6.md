# ClipForge Phase 6 — Billing + Growth

Week 10 of the ClipForge plan. Builds on Phases 1–5 without changing
their behavior. **Production charging stays OFF until the owner
completes MoR onboarding AND sets real prices** — see "Pricing
decisions still owed" below.

## The one rule that matters

**Activation happens ONLY on a verified MoR webhook, server to
server.** A checkout redirect, a client claim, or a "payment
succeeded" page never activates anything. Every MoR event id is
recorded exactly once (`clipper_webhook_events`, UNIQUE on provider
+ event id), so duplicate deliveries are ignored — that is the
duplicate-payment protection. Money is integer minor units only,
everywhere. No card or payment-instrument data is ever stored,
logged, or shown: the MoR holds it, the app stores references.

## Files changed

### Core libs (`lib/billing/`)

- `plans.ts` — plan definitions (free/pro/agency) with PLACEHOLDER
  limits, `BILLING_PLANS_JSON` overrides, price-ID lookup from env
  (prices are NOT in code), limit helpers.
- `mor.ts` — swappable MoR interface; Paddle adapter (checkout +
  HMAC webhook verification + cancel); Lemon Squeezy adapter SLOT
  (real webhook verification, checkout deliberately inert);
  provider selection + status mapping.
- `store.ts` — PostgREST helpers for subscriptions, invoices, the
  minute ledger, coupons + redemptions, referral codes +
  referrals + commissions, webhook events, notifications, and the
  user-plan lookup.
- `metering.ts` — minute balance as a SUM (never a stored column),
  monthly consumption, whole-minute rounding, low-balance flag,
  fire-and-forget recording for user flows.
- `coupons.ts` — coupon validation (expiry, use cap, per-user-once,
  plan scope) and integer discount math (percent rounds down).
- `invoices.ts` — invoice numbers (`INV-YYYYMMDD-XXXXXXXX`) and
  integer line-item totals.
- `dunning.ts` — retry schedule (default days 1, 3, 7) + grace
  (default 14 days) + next-step decisions.
- `cancellation.ts` — immediate vs end-of-period cancel patches
  and remaining-access checks. Cancel is never delete.
- `affiliates.ts` — referral code generation, attribution rules
  (no self-referral, one referrer per user), integer commission
  math. Payouts are manual — no rail wired.
- `fraud.ts` — velocity flags over checkout audit entries (actor
  and IP bursts). Signals only — nothing auto-blocks.
- `paddle.ts` — UNCHANGED from Phase 3 (the legacy provider is
  still used by nothing new; `mor.ts` is the Phase 6 seam).

### Audit wiring

- `lib/admin/audit.ts` — 16 new billing actions
  (`billing.subscription_created/updated/canceled`,
  `billing.invoice_created`, `billing.credit_grant/consumed/
  purchase`, `billing.coupon_created/redeemed`,
  `billing.dunning_step`, `billing.cancel`,
  `billing.affiliate_attributed`, `billing.commission`,
  `billing.fraud_signal`).

### User routes (`app/api/billing/`)

- `checkout/route.ts` — extended: plan validation, price-ID
  lookup per MoR, app-coupon validation, MoR checkout, pending
  subscription + redemption bookkeeping (best-effort). Still 503s
  honestly without keys/prices.
- `webhook/route.ts` — the ONLY activation path: HMAC verify →
  idempotency → apply (subscription upsert, invoice + credit-pack
  grant + first-paid commission, past-due + notification, cancel).
  503 without a database so the MoR retries; 401 on bad signature.
- `subscriptions/route.ts` — the caller's subscriptions (GET).
- `subscriptions/cancel/route.ts` — cancel; MoR cancel runs FIRST
  when configured, and a MoR failure blocks local recording.
- `invoices/route.ts` + `invoices/[id]/route.ts` — invoice records
  with an ownership check (a foreign id 404s).
- `limits/route.ts` — plan + limits + monthly use + minute balance
  + low-balance flag in one place.
- `coupons/redeem/route.ts` — validate + record a redemption with
  specific rejection reasons.
- `referrals/code/route.ts` — get-or-create the caller's code.
- `referrals/attribute/route.ts` — attribute a user to a code owner.
- `notifications/route.ts` — in-app billing notices.

### Admin routes (`app/api/admin/billing/`)

- `overview/route.ts` — counts + integer totals (no payment data).
- `subscriptions/route.ts` — console list, optional status filter.
- `invoices/route.ts` — console list.
- `coupons/route.ts` — list + create (owner/admin, audited).
- `dunning/run/route.ts` — advance every past_due subscription one
  step (retry / cancel / wait), audited per subscription.
- `affiliates/route.ts` — referrals + commissions lists.
- `fraud-signals/route.ts` — velocity flags from checkout audit
  entries.
- `metering/record/route.ts` — explicit ledger entries; consumption
  past the monthly cap is refused with 402 + remaining minutes.
- `credits/route.ts` — grant MINUTE credits (separate from Phase 4
  CLIP credits — the two units are never mixed).

### Wiring (additive only)

- `app/api/publish/posts/[id]/publish/route.ts` — on a completed
  publish, records whole minutes for the clip length
  (best-effort, guest posts skipped) + a `billing.credit_consumed`
  audit entry. Never changes the publish response.

### Pages

- `app/admin/billing/page.tsx` — overview + fraud signals + links.
- `app/admin/billing/subscriptions/page.tsx` — list + status filter.
- `app/admin/billing/invoices/page.tsx` — list.
- `app/admin/billing/coupons/page.tsx` — list + create form.
- `app/admin/billing/affiliates/page.tsx` — referrals + commissions.
- `app/admin/billing/dunning/page.tsx` — past-due queue + run button.
- `app/admin/layout.tsx` — Billing nav link.
- `app/billing/page.tsx` — user billing: plan/limits/balance,
  subscriptions, invoices, notices, referral code.
- `app/billing/invoices/[id]/page.tsx` — printable HTML invoice
  record (PDF generation is a later slice).

### Tests

- `tests/phase6-billing.test.ts` — 20 unit tests: plans, metering
  math, coupons, invoices, dunning, cancellation, affiliates,
  fraud velocity, MoR signature verification + event parsing.
- `tests/phase6-billing-routes.test.ts` — 12 route tests with a
  stubbed PostgREST + Paddle: webhook auth/idempotency/
  activation, checkout validation, cancel, redeem, metering cap,
  dunning cancel, fraud flags, attribution rules.

## Database migration (NOT applied)

`supabase/migrations/006_clipforge_phase6.sql` — ADDITIVE ONLY,
files only, nothing auto-applies. Apply after base schema +
001→005. Creates: `clipper_subscriptions`,
`clipper_invoices`, `clipper_credit_ledger` (MINUTES — different
unit from Phase 4 `clipper_credit_adjustments`, which counts CLIPS
and is untouched), `clipper_coupons`,
`clipper_coupon_redemptions`, `clipper_referral_codes` (code →
owner registry) + `clipper_referrals` + `clipper_commissions`,
`clipper_webhook_events` (UNIQUE provider + event id),
`clipper_notifications`. Also widens `clipper_users.plan` to
include `agency` (via a DO block that drops whatever the existing
plan check is called). RLS enabled with NO policies on all new
tables (same pattern as 002–005): only service-role API routes can
read/write them.

NOTE: migration 006 was amended during this phase (referral-code
registry added) BEFORE it was ever applied anywhere — it has never
touched a live database, so the amendment is safe. Do NOT apply an
older copy if one exists anywhere else.

## Env vars (names only — values live in Vercel, never in code)

New in Phase 6 (see `.env.example` for the full annotated list):

- `BILLING_MOR_PROVIDER` — `paddle` (default) or `lemonsqueezy`
  (slot only — checkout inert).
- `PADDLE_WEBHOOK_SECRET` — from the Paddle dashboard; required
  for webhook activation.
- `PADDLE_AGENCY_PRICE_ID` — agency price id from Paddle.
- `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_WEBHOOK_SECRET`,
  `LEMONSQUEEZY_PRO_PRICE_ID`, `LEMONSQUEEZY_AGENCY_PRICE_ID` —
  Lemon Squeezy slot (webhook verification real, checkout inert).
- `BILLING_PLANS_JSON` — JSON plan-limit overrides.
- `BILLING_LOW_BALANCE_MINUTES` — default 10.
- `BILLING_DUNNING_RETRY_DAYS` — default "1,3,7".
- `BILLING_DUNNING_GRACE_DAYS` — default 14.
- `BILLING_AFFILIATE_RATE_PERCENT` — PLACEHOLDER default 10.

Reused: `PADDLE_API_KEY`, `PADDLE_ENV` (sandbox default — set to
`live` only for a real launch), `PADDLE_PRO_PRICE_ID`,
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Pricing-config guide (what the owner must decide + set)

NOTHING below is decided. Placeholder limits are product behavior
defaults, not prices; prices do not exist in this repo at all.

1. **Confirm or replace plan limits** — built-in placeholders:
   free 30 / pro 600 / agency 3000 minutes per month; projects
   3 / 50 / unlimited; seats 1 / 1 / 5; publish targets 1 / 3 / 10.
   Override with `BILLING_PLANS_JSON` (no redeploy of code needed
   beyond the env change).
2. **Set real prices in the MoR dashboard** — create pro + agency
   prices in Paddle (sandbox first), then paste
   `PADDLE_PRO_PRICE_ID` + `PADDLE_AGENCY_PRICE_ID` into Vercel.
   Until then, checkout for that tier honestly 503s.
3. **Set the webhook secret** — Paddle dashboard → Developer tools
   → Notifications → webhook secret → `PADDLE_WEBHOOK_SECRET` in
   Vercel. Webhook URL:
   `<site>/api/billing/webhook?provider=paddle`.
4. **Coupons need MoR-side codes too** — an app coupon code must
   also exist as a discount code in the MoR dashboard, or checkout
   with that code fails honestly (it never silently charges full
   price while claiming a discount).
5. **Affiliate rate + payout rail** — rate placeholder is 10%
   (`BILLING_AFFILIATE_RATE_PERCENT`); payouts are MANUAL until
   the owner picks a rail. No payout date or method is promised
   anywhere in copy.
6. **Flip to live only when ready** — `PADDLE_ENV=live` + live
   price ids + live webhook secret, then a real sandbox-style
   test purchase in live mode with a refund. Never flip on a guess.

## Setup steps (owner taps)

1. Apply SQL in order: base schema → 001 → 002 → 003 → 004 → 005
   → **006** (files only, nothing auto-applies).
2. Confirm Supabase env vars in Vercel + redeploy (the Phase 6
   deploy carries the previously copied Supabase env into effect).
3. Paddle sandbox app + sandbox price ids + webhook secret into
   Vercel + redeploy.
4. Set plan limits (`BILLING_PLANS_JSON`) or confirm placeholders.
5. Optional: dunning/grace config, low-balance threshold,
   affiliate rate.
6. Run the MANUAL QA CHECKLIST below.

## Manual QA checklist

- [ ] Plan limits: `/api/billing/limits?userId=…` shows the right
  plan, limits, monthly use, balance, low-balance flag.
- [ ] Checkout pending: a sandbox checkout returns a MoR URL and
  records a `pending` subscription — and NOTHING is active before
  the webhook.
- [ ] Webhook activation only: a signed sandbox webhook activates
  the subscription and updates `clipper_users.plan`; an unsigned
  one 401s; a bad-signature one processes nothing.
- [ ] Duplicate webhook ignored: replaying the same event id
  returns `{ignored: "duplicate"}` and creates no second row.
- [ ] Metering + balance math: publish a clip, confirm the ledger
  gains whole minutes and the balance is the SUM (grant − use).
- [ ] Metering cap: recording consumption past the monthly cap
  answers 402 with remaining minutes.
- [ ] Coupon limits: expired / used-up / already-used / wrong-plan
  coupons are refused with the specific reason; a valid one
  redeems and increments uses.
- [ ] Invoice records: a completed transaction creates an invoice
  with line items and an integer total; the printable page renders.
- [ ] Dunning transitions: a past-due subscription retries on
  schedule, notifies in-app, and cancels after grace.
- [ ] Cancellation modes: immediate ends access now; end-of-period
  keeps access to period end; cancel never deletes data.
- [ ] Affiliate attribution: a code attributes once; self-referral
  refused; a first paid event creates a pending commission.
- [ ] Fraud signals: a checkout burst flags actor + IP in the
  console; nothing auto-blocks on a flag alone.
- [ ] Admin pages show NO payment data anywhere (statuses,
  references, and integer totals only).

## Honest gaps (deliberate, documented)

- **Everything is DB-gated until migration 006 + env land**
  (honest 503s, never fake data). At Phase 6 handoff time, 001–005
  application is in flight via a separate browser task and 006 is
  still owed — billing routes 503 until 006 lands.
- **Production charging OFF**: sandbox-first Paddle; Lemon
  Squeezy checkout is a slot (verification real, checkout inert).
  No live charge path exists until MoR onboarding + real prices.
- **PDF invoices**: printable HTML today; PDF generation is a
  later slice if the library proves heavy.
- **Email notices**: in-app only. The known-bad Brevo key is NOT
  wired; email needs a working mail provider later.
- **User identity on billing routes**: `userId` is caller-asserted
  (same standing gap as the Phase 3 checkout route). Session
  binding is a later hardening slice — do not treat these routes
  as authenticated until it lands.
- **Hard gating at render/publish time**: metering records
  consumption on publish completion, but user flows are never
  blocked by metering today. The explicit metering route enforces
  the cap; gating inside render/publish is a later slice once
  usage accounting is live.
- **Render/AI-job metering**: the publish path meters; the server
  render worker completion callback does not exist yet (Phase 4
  gap), so render minutes meter only via the explicit route until
  the worker callback lands.
- **Paddle signature construction**: follows Paddle's published
  verification docs (`ts:body` HMAC); live confirmation against a
  Paddle sandbox test webhook is still owed before relying on
  live activation.
- **No Playwright suite** (no browsers in this env) — the manual
  QA checklist above is the smoke path.
- **No scheduled dunning sweeper**: dunning advances on the manual
  admin run (or a later cron); missed runs just delay retries.
