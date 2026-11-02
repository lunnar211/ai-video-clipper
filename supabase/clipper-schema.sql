-- AI Video Clipper schema (Phase 3 + Phase 4 queue tables).
--
-- DO NOT APPLY BLINDLY. The owner chooses the Supabase project and
-- approves applying this file in the Supabase SQL editor (or via
-- `supabase db push` from his machine). Nothing in the app applies it,
-- and no live database is touched by the code in this repo.
--
-- Tables: users (one row per Supabase Auth user), projects, clips,
-- usage_ledger (daily clip counts), scheduled_posts (Phase 4 queue).
-- Row Level Security is ON everywhere; every policy is owner-only.

create table if not exists public.clipper_users (
  id uuid primary key,
  email text not null,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.clipper_users (id) on delete cascade,
  title text not null default 'Untitled project',
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_clips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.clipper_projects (id) on delete cascade,
  user_id uuid not null references public.clipper_users (id) on delete cascade,
  start_seconds double precision not null,
  end_seconds double precision not null,
  title text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.clipper_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.clipper_users (id) on delete cascade,
  day date not null,
  clips_used integer not null default 0,
  unique (user_id, day)
);

create table if not exists public.clipper_scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.clipper_users (id) on delete cascade,
  platform text not null check (platform in ('youtube', 'tiktok', 'instagram')),
  title text not null,
  description text not null default '',
  tags text[] not null default '{}',
  visibility text not null default 'private'
    check (visibility in ('private', 'public', 'unlisted')),
  scheduled_at timestamptz,
  status text not null default 'queued'
    check (status in ('queued', 'publishing', 'published', 'failed')),
  error text,
  storage_key text,
  storage_expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.clipper_users enable row level security;
alter table public.clipper_projects enable row level security;
alter table public.clipper_clips enable row level security;
alter table public.clipper_usage enable row level security;
alter table public.clipper_scheduled_posts enable row level security;

-- Owner-only policies: a signed-in user sees only rows whose user_id
-- matches auth.uid(). (clipper_users rows are keyed by the auth id.)
drop policy if exists "own user row" on public.clipper_users;
create policy "own user row" on public.clipper_users
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "own projects" on public.clipper_projects;
create policy "own projects" on public.clipper_projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own clips" on public.clipper_clips;
create policy "own clips" on public.clipper_clips
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own usage" on public.clipper_usage;
create policy "own usage" on public.clipper_usage
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own scheduled posts" on public.clipper_scheduled_posts;
create policy "own scheduled posts" on public.clipper_scheduled_posts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
