-- ClipForge Phase 6 migration (ADDITIVE ONLY — NOT APPLIED).
--
-- DO NOT APPLY BLINDLY. The owner chooses the Supabase project and
-- approves applying this file in the Supabase SQL editor. Nothing in
-- the app applies it, and no live database is touched by this repo.
-- PREREQUISITE: apply supabase/clipper-schema.sql first, then
-- supabase/migrations/001_clipforge_phase1.sql, then
-- supabase/migrations/002_clipforge_phase2.sql, then
-- supabase/migrations/003_clipforge_phase3.sql, then
-- supabase/migrations/004_clipforge_phase4.sql, then
-- supabase/migrations/005_clipforge_phase5.sql.
--
-- Tables: clipper_subscriptions (MoR subscription references —
-- NEVER card or payment-instrument data; the MoR holds that),
-- clipper_invoices (stored records with integer minor-unit line
-- items), clipper_credit_ledger (MINUTE ledger; balance is always
-- SUM(delta_minutes) — never a mutable balance column; this is a
-- DIFFERENT unit from Phase 4 clipper_credit_adjustments, which
-- counts CLIPS and is left untouched), clipper_coupons +
-- clipper_coupon_redemptions, clipper_referrals +
-- clipper_commissions (payouts are manual — no payout rail wired),
-- clipper_webhook_events (MoR event ids, UNIQUE per provider —
-- the duplicate-payment protection), clipper_notifications
-- (in-app billing notices; email stays inert until a working mail
-- provider lands).
--
-- Also widens clipper_users.plan to include 'agency' (the base
-- schema only allowed free/pro). The DO block drops whatever the
-- existing plan check constraint is called, so it works regardless
-- of the auto-generated constraint name.
--
-- NOTE (same honesty note as migrations 002–005): the service-role
-- key bypasses RLS in raw SQL. The app only ever accesses these
-- tables through its service-role API routes, which enforce the
-- role gates in code. The policies below deny anonymous PostgREST
-- access.

DO $$
DECLARE
  c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.clipper_users'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%plan%';
  IF c IS NOT NULL THEN
    EXECUTE 'alter table public.clipper_users drop constraint ' || quote_ident(c);
  END IF;
END $$;

alter table public.clipper_users
  add constraint clipper_users_plan_check
  check (plan in ('free', 'pro', 'agency'));

create table if not exists public.clipper_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.clipper_users (id) on delete cascade,
  provider text not null,
  provider_subscription_id text,
  plan text not null check (plan in ('free', 'pro', 'agency')),
  status text not null default 'pending'
    check (status in ('pending', 'trialing', 'active', 'past_due', 'canceled')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  dunning_attempts integer not null default 0,
  dunning_next_retry_at timestamptz,
  dunning_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clipper_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.clipper_users (id) on delete cascade,
  subscription_id uuid references public.clipper_subscriptions (id) on delete set null,
  number text not null unique,
  status text not null default 'paid',
  currency text not null default 'USD',
  total_minor integer not null,
  line_items jsonb not null default '[]'::jsonb,
  provider text not null,
  provider_transaction_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.clipper_users (id) on delete cascade,
  delta_minutes integer not null,
  kind text not null
    check (kind in ('grant', 'purchase', 'consumption', 'adjustment', 'expiry')),
  reason text not null,
  reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null check (kind in ('percent', 'fixed')),
  value integer not null,
  max_uses integer,
  uses_count integer not null default 0,
  per_user_once boolean not null default true,
  plan text,
  expires_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.clipper_coupons (id) on delete cascade,
  user_id uuid not null references public.clipper_users (id) on delete cascade,
  checkout_reference text not null,
  created_at timestamptz not null default now(),
  unique (coupon_id, user_id, checkout_reference)
);

create table if not exists public.clipper_referrals (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  referrer_user_id uuid not null references public.clipper_users (id) on delete cascade,
  referred_user_id uuid not null references public.clipper_users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (referred_user_id)
);

create table if not exists public.clipper_commissions (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.clipper_referrals (id) on delete cascade,
  user_id uuid not null references public.clipper_users (id) on delete cascade,
  amount_minor integer not null,
  currency text not null default 'USD',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'paid')),
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  type text not null,
  processed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

create table if not exists public.clipper_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.clipper_users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.clipper_subscriptions enable row level security;
alter table public.clipper_invoices enable row level security;
alter table public.clipper_credit_ledger enable row level security;
alter table public.clipper_coupons enable row level security;
alter table public.clipper_coupon_redemptions enable row level security;
alter table public.clipper_referrals enable row level security;
alter table public.clipper_commissions enable row level security;
alter table public.clipper_webhook_events enable row level security;
alter table public.clipper_notifications enable row level security;

-- The Phase 6 tables intentionally have NO policies: with RLS
-- enabled and no policy, direct PostgREST access is denied and only
-- the service-role API routes (which enforce role gates in code) can
-- read or write them.
