-- ClipForge Phase 4 migration (ADDITIVE ONLY — NOT APPLIED).
--
-- DO NOT APPLY BLINDLY. The owner chooses the Supabase project and
-- approves applying this file in the Supabase SQL editor. Nothing in
-- the app applies it, and no live database is touched by this repo.
-- PREREQUISITE: apply supabase/clipper-schema.sql first, then
-- supabase/migrations/001_clipforge_phase1.sql, then
-- supabase/migrations/002_clipforge_phase2.sql, then
-- supabase/migrations/003_clipforge_phase3.sql.
--
-- Tables: clipper_audit_log (append-only: INSERT + SELECT policies
-- only — the app has no update path, and the only deletion path is
-- the documented retention purge, which itself writes an audit entry),
-- clipper_admin_mfa (TOTP secrets ENCRYPTED — never plaintext),
-- clipper_support_notes, clipper_credit_adjustments,
-- clipper_impersonation_sessions, clipper_breakglass_grants,
-- clipper_admin_alerts. Plus clipper_users.status for suspend/restore.
--
-- NOTE (same honesty note as migrations 002/003): the service-role
-- key bypasses RLS in raw SQL. The app only ever accesses these
-- tables through its service-role API routes, which enforce the role
-- gates in code. The policies below deny anonymous PostgREST access.

create table if not exists public.clipper_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  target text,
  metadata jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_admin_mfa (
  user_id uuid primary key references public.clipper_users (id) on delete cascade,
  secret_enc jsonb not null,
  key_id text not null default 'env-v1',
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_support_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.clipper_users (id) on delete cascade,
  admin_id uuid not null references public.clipper_users (id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_credit_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.clipper_users (id) on delete cascade,
  admin_id uuid not null references public.clipper_users (id) on delete cascade,
  delta_clips integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.clipper_users (id) on delete cascade,
  target_user_id uuid not null references public.clipper_users (id) on delete cascade,
  reason text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.clipper_breakglass_grants (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.clipper_users (id) on delete cascade,
  item_type text not null check (item_type in ('project', 'clip')),
  item_id text not null,
  reason text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_admin_alerts (
  id uuid primary key default gen_random_uuid(),
  rule text not null,
  severity text not null default 'warning',
  detail text not null,
  created_at timestamptz not null default now()
);

alter table public.clipper_users
  add column if not exists status text not null default 'active'
    check (status in ('active', 'suspended'));
alter table public.clipper_users
  add column if not exists suspended_reason text;

alter table public.clipper_audit_log enable row level security;
alter table public.clipper_admin_mfa enable row level security;
alter table public.clipper_support_notes enable row level security;
alter table public.clipper_credit_adjustments enable row level security;
alter table public.clipper_impersonation_sessions enable row level security;
alter table public.clipper_breakglass_grants enable row level security;
alter table public.clipper_admin_alerts enable row level security;

-- Append-only audit policy: INSERT + SELECT only, and only for
-- owner/admin rows. Deliberately NO UPDATE or DELETE policy exists
-- for clipper_audit_log, so no PostgREST caller can rewrite or erase
-- history. The retention purge runs through the service-role API
-- route (which enforces the admin role in code) and writes its own
-- audit entry. The app's audit emission goes through the service
-- role, which bypasses RLS; these policies govern direct PostgREST
-- access only.
drop policy if exists "audit insert" on public.clipper_audit_log;
create policy "audit insert" on public.clipper_audit_log
  for insert with check (
    exists (
      select 1 from public.clipper_users u
      where u.id = auth.uid() and u.role in ('owner', 'admin')
    )
  );
drop policy if exists "audit select" on public.clipper_audit_log;
create policy "audit select" on public.clipper_audit_log
  for select using (
    exists (
      select 1 from public.clipper_users u
      where u.id = auth.uid() and u.role in ('owner', 'admin')
    )
  );

-- The remaining Phase 4 tables intentionally have NO policies: with
-- RLS enabled and no policy, direct PostgREST access is denied and
-- only the service-role API routes (which enforce role gates in code)
-- can read or write them.
