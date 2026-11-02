-- ClipForge Phase 1 migration (ADDITIVE ONLY — NOT APPLIED).
--
-- DO NOT APPLY BLINDLY. The owner chooses the Supabase project and
-- approves applying this file in the Supabase SQL editor. Nothing in
-- the app applies it, and no live database is touched by this repo.
-- All tables are new; nothing existing is altered. RLS is ON
-- everywhere; every policy is owner-only (auth.uid()).
-- PREREQUISITE: apply supabase/clipper-schema.sql first (it creates
-- clipper_users / clipper_clips, which this file references).
--
-- Tables: clipper_shares (public share links + view counts),
-- clipper_render_jobs (server render job records), clipper_brand_kits
-- (persisted brand kits), clipper_imports (import audit records),
-- clipper_clip_versions (editor versions).

create table if not exists public.clipper_shares (
  token text primary key,
  user_id uuid references public.clipper_users (id) on delete cascade,
  title text not null,
  video_url text,
  clip_start double precision not null,
  clip_end double precision not null,
  views integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_render_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.clipper_users (id) on delete cascade,
  source_key text not null,
  clip_start double precision not null,
  clip_end double precision not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed')),
  progress double precision not null default 0,
  output_key text,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_brand_kits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.clipper_users (id) on delete cascade,
  primary_color text not null default '#0ea5e9',
  font_family text not null default 'system-ui, sans-serif',
  watermark_text text not null default '',
  watermark_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.clipper_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.clipper_users (id) on delete cascade,
  source text not null
    check (source in ('youtube-owned', 'drive', 'dropbox', 'loom', 'cc-licensed', 'direct-upload')),
  source_url text,
  license text,
  attribution text,
  status text not null default 'validated'
    check (status in ('validated', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_clip_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.clipper_users (id) on delete cascade,
  clip_id uuid references public.clipper_clips (id) on delete cascade,
  label text not null,
  start_seconds double precision not null,
  end_seconds double precision not null,
  preset_id text not null default 'pop',
  created_at timestamptz not null default now()
);

alter table public.clipper_shares enable row level security;
alter table public.clipper_render_jobs enable row level security;
alter table public.clipper_brand_kits enable row level security;
alter table public.clipper_imports enable row level security;
alter table public.clipper_clip_versions enable row level security;

-- Owner-only policies. Shares are readable by anyone WITH the token
-- via the service-role API route only; the anon policy below is
-- deliberately absent for shares (no public read through PostgREST).
drop policy if exists "own render jobs" on public.clipper_render_jobs;
create policy "own render jobs" on public.clipper_render_jobs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own brand kits" on public.clipper_brand_kits;
create policy "own brand kits" on public.clipper_brand_kits
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own imports" on public.clipper_imports;
create policy "own imports" on public.clipper_imports
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own clip versions" on public.clipper_clip_versions;
create policy "own clip versions" on public.clipper_clip_versions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
