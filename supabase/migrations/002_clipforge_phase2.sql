-- ClipForge Phase 2 migration (ADDITIVE ONLY — NOT APPLIED).
--
-- DO NOT APPLY BLINDLY. The owner chooses the Supabase project and
-- approves applying this file in the Supabase SQL editor. Nothing in
-- the app applies it, and no live database is touched by this repo.
-- PREREQUISITE: apply supabase/clipper-schema.sql first, then
-- supabase/migrations/001_clipforge_phase1.sql.
--
-- Tables: clipper_declarations (IMMUTABLE per-project ownership
-- records), clipper_fingerprint_scans (scan results only, never
-- audio), clipper_checklists (per-post compliance records),
-- clipper_strikes (DMCA/takedown intake + review), clipper_appeals
-- (appeals against strikes). Columns: clipper_users.role (admin
-- gating) and clipper_users.publishing_paused (auto-pause flag).
--
-- Immutability: clipper_declarations has INSERT + SELECT policies
-- ONLY. There is deliberately NO UPDATE or DELETE policy, so no API
-- path — not even the service role through PostgREST RLS — can
-- rewrite or erase a declaration. (The service key bypasses RLS in
-- raw SQL; the guarantee is at the API/policy layer, and the owner
-- should additionally revoke direct table write access from any
-- human operator who should not touch it.)
--
-- NOTE on the honesty of that comment: PostgREST requests made with
-- the service-role key BYPASS RLS. The app only ever issues INSERT
-- and SELECT against clipper_declarations (see lib/rights/
-- declarations.ts — no update/delete helper exists), so the
-- append-only property holds for everything the app can do. The
-- "no UPDATE/DELETE policy" line above means: even an anon-keyed
-- request cannot update or delete. Keep it that way — do not add
-- such policies later.

create table if not exists public.clipper_declarations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.clipper_users (id) on delete set null,
  project_id text not null,
  ip text,
  user_agent text,
  declaration_text text not null,
  declaration_text_version text not null,
  accepted_at timestamptz not null default now()
);

create table if not exists public.clipper_fingerprint_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.clipper_users (id) on delete set null,
  project_id text not null,
  provider text not null,
  detected boolean not null,
  artist text,
  title text,
  policy_outcome text,
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_checklists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.clipper_users (id) on delete set null,
  post_ref text not null,
  project_id text not null,
  declaration boolean not null,
  music_licence boolean not null,
  fingerprint_reviewed boolean not null,
  platform_rules boolean not null,
  policy_outcome text,
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_strikes (
  id uuid primary key default gen_random_uuid(),
  reporter_name text not null,
  reporter_email text not null,
  work_description text not null,
  infringing_ref text not null,
  accused_user_id uuid references public.clipper_users (id) on delete set null,
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'upheld', 'overturned')),
  admin_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_appeals (
  id uuid primary key default gen_random_uuid(),
  strike_id uuid not null references public.clipper_strikes (id) on delete cascade,
  appellant_name text not null,
  appellant_email text not null,
  reason text not null,
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'upheld', 'overturned')),
  admin_note text,
  created_at timestamptz not null default now()
);

-- Role gating for the admin review queue + the auto-pause flag.
alter table public.clipper_users
  add column if not exists role text not null default 'user'
    check (role in ('owner', 'admin', 'support', 'analyst', 'viewer', 'user'));
alter table public.clipper_users
  add column if not exists publishing_paused boolean not null default false;

alter table public.clipper_declarations enable row level security;
alter table public.clipper_fingerprint_scans enable row level security;
alter table public.clipper_checklists enable row level security;
alter table public.clipper_strikes enable row level security;
alter table public.clipper_appeals enable row level security;

-- Declarations: INSERT + SELECT for the owning user only. NO UPDATE
-- or DELETE policy exists on purpose (see the header comment).
drop policy if exists "own declarations insert" on public.clipper_declarations;
create policy "own declarations insert" on public.clipper_declarations
  for insert with check (user_id = auth.uid() or user_id is null);
drop policy if exists "own declarations select" on public.clipper_declarations;
create policy "own declarations select" on public.clipper_declarations
  for select using (user_id = auth.uid() or user_id is null);

-- Scan/checklist rows: owner-only for all operations.
drop policy if exists "own fingerprint scans" on public.clipper_fingerprint_scans;
create policy "own fingerprint scans" on public.clipper_fingerprint_scans
  for all using (user_id = auth.uid() or user_id is null)
  with check (user_id = auth.uid() or user_id is null);

drop policy if exists "own checklists" on public.clipper_checklists;
create policy "own checklists" on public.clipper_checklists
  for all using (user_id = auth.uid() or user_id is null)
  with check (user_id = auth.uid() or user_id is null);

-- Strikes/appeals: NO anon policy on purpose. Reporter emails and
-- appeal details must not be listable through PostgREST by anyone.
-- All access goes through the service-role API routes, which check
-- the admin role in code (review queue) or accept a single intake
-- POST (public form). RLS enabled + no policy = deny for anon.
-- Do not add a permissive select policy here later.
