-- ClipForge Phase 5 migration (ADDITIVE ONLY — NOT APPLIED).
--
-- DO NOT APPLY BLINDLY. The owner chooses the Supabase project and
-- approves applying this file in the Supabase SQL editor. Nothing in
-- the app applies it, and no live database is touched by this repo.
-- PREREQUISITE: apply supabase/clipper-schema.sql first, then
-- supabase/migrations/001_clipforge_phase1.sql, then
-- supabase/migrations/002_clipforge_phase2.sql, then
-- supabase/migrations/003_clipforge_phase3.sql, then
-- supabase/migrations/004_clipforge_phase4.sql.
--
-- Tables: clipper_integrations (per-user registry instances; secret
-- config ENCRYPTED, never plaintext), clipper_webhook_endpoints
-- (signing secrets ENCRYPTED), clipper_webhook_deliveries (delivery
-- log; payloads are sanitized before storage), clipper_api_keys
-- (SHA-256 hash only — the secret is shown once at creation and
-- never stored), clipper_sso_configs (one per user; secrets
-- ENCRYPTED).
--
-- NOTE (same honesty note as migrations 002/003/004): the
-- service-role key bypasses RLS in raw SQL. The app only ever
-- accesses these tables through its service-role API routes, which
-- enforce the role gates in code. The policies below deny anonymous
-- PostgREST access.

create table if not exists public.clipper_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.clipper_users (id) on delete cascade,
  integration_id text not null,
  enabled boolean not null default false,
  config_public jsonb not null default '{}'::jsonb,
  config_enc jsonb,
  key_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, integration_id)
);

create table if not exists public.clipper_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.clipper_users (id) on delete cascade,
  url text not null,
  events jsonb not null default '[]'::jsonb,
  secret_enc jsonb not null,
  key_id text not null default 'env-v1',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.clipper_webhook_endpoints (id) on delete cascade,
  event text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'delivered', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.clipper_users (id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  scopes jsonb not null default '["read"]'::jsonb,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_sso_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.clipper_users (id) on delete cascade,
  provider text not null check (provider in ('oidc', 'saml')),
  config_public jsonb not null default '{}'::jsonb,
  secret_enc jsonb,
  key_id text,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clipper_integrations enable row level security;
alter table public.clipper_webhook_endpoints enable row level security;
alter table public.clipper_webhook_deliveries enable row level security;
alter table public.clipper_api_keys enable row level security;
alter table public.clipper_sso_configs enable row level security;

-- The Phase 5 tables intentionally have NO policies: with RLS
-- enabled and no policy, direct PostgREST access is denied and only
-- the service-role API routes (which enforce role gates in code) can
-- read or write them. Delivery rows are never updated by anonymous
-- callers; replay goes through the admin-gated route.
