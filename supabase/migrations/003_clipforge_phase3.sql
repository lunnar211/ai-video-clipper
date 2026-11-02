-- ClipForge Phase 3 migration (ADDITIVE ONLY — NOT APPLIED).
--
-- DO NOT APPLY BLINDLY. The owner chooses the Supabase project and
-- approves applying this file in the Supabase SQL editor. Nothing in
-- the app applies it, and no live database is touched by this repo.
-- PREREQUISITE: apply supabase/clipper-schema.sql first, then
-- supabase/migrations/001_clipforge_phase1.sql, then
-- supabase/migrations/002_clipforge_phase2.sql.
--
-- Tables: publish_accounts (encrypted OAuth tokens — NEVER plaintext),
-- publish_posts (composer posts + stored pre-publish draft),
-- publish_targets (one row per post × account, with idempotency keys
-- and per-target status), publish_analytics (unified synced stats),
-- publish_notifications (in-app failure notifications).
--
-- Token columns hold ENCRYPTED records (ciphertext + iv + auth tag +
-- key id, see lib/publish/tokens.ts). Plaintext tokens are never
-- written to any table, and API responses strip rows to status-only
-- fields before returning them.
--
-- NOTE (same honesty note as migration 002): the service-role key
-- bypasses RLS in raw SQL. The app only ever accesses these tables
-- through its service-role API routes, which enforce the gates in
-- code. The policies below deny anonymous PostgREST access.

create table if not exists public.publish_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.clipper_users (id) on delete set null,
  platform text not null,
  account_label text not null,
  scopes text[] not null default '{}',
  access_token_enc jsonb not null,
  refresh_token_enc jsonb,
  token_expires_at timestamptz,
  token_key_id text not null default 'env-v1',
  status text not null default 'connected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.publish_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.clipper_users (id) on delete set null,
  clip_ref text not null,
  project_id text not null,
  media_key text,
  title text,
  schedule_at timestamptz,
  timezone text,
  pre_publish jsonb,
  checklist_post_ref text,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'published', 'partial', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.publish_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.publish_posts (id) on delete cascade,
  platform text not null,
  account_id uuid not null references public.publish_accounts (id) on delete cascade,
  title text,
  description text not null,
  tags text[] not null default '{}',
  visibility text not null default 'unlisted',
  idempotency_key text not null,
  status text not null default 'pending'
    check (status in ('pending', 'published', 'failed', 'refused')),
  provider_post_id text,
  provider_url text,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, platform, account_id)
);

create table if not exists public.publish_analytics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.publish_posts (id) on delete cascade,
  target_id uuid not null references public.publish_targets (id) on delete cascade,
  platform text not null,
  views integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  synced_at timestamptz not null default now(),
  unique (target_id, platform)
);

create table if not exists public.publish_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.clipper_users (id) on delete set null,
  type text not null,
  title text not null,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.publish_accounts enable row level security;
alter table public.publish_posts enable row level security;
alter table public.publish_targets enable row level security;
alter table public.publish_analytics enable row level security;
alter table public.publish_notifications enable row level security;

-- Owner-only policies (service-role API routes enforce the rest in
-- code; anonymous PostgREST access is denied unless a policy below
-- allows it — none of these tables gets a permissive anon policy).
drop policy if exists "own publish accounts" on public.publish_accounts;
create policy "own publish accounts" on public.publish_accounts
  for all using (user_id = auth.uid() or user_id is null)
  with check (user_id = auth.uid() or user_id is null);

drop policy if exists "own publish posts" on public.publish_posts;
create policy "own publish posts" on public.publish_posts
  for all using (user_id = auth.uid() or user_id is null)
  with check (user_id = auth.uid() or user_id is null);

drop policy if exists "own publish targets" on public.publish_targets;
create policy "own publish targets" on public.publish_targets
  for all using (
    exists (
      select 1 from public.publish_posts p
      where p.id = publish_targets.post_id
        and (p.user_id = auth.uid() or p.user_id is null)
    )
  )
  with check (
    exists (
      select 1 from public.publish_posts p
      where p.id = publish_targets.post_id
        and (p.user_id = auth.uid() or p.user_id is null)
    )
  );

drop policy if exists "own publish analytics" on public.publish_analytics;
create policy "own publish analytics" on public.publish_analytics
  for all using (
    exists (
      select 1 from public.publish_posts p
      where p.id = publish_analytics.post_id
        and (p.user_id = auth.uid() or p.user_id is null)
    )
  )
  with check (
    exists (
      select 1 from public.publish_posts p
      where p.id = publish_analytics.post_id
        and (p.user_id = auth.uid() or p.user_id is null)
    )
  );

drop policy if exists "own publish notifications" on public.publish_notifications;
create policy "own publish notifications" on public.publish_notifications
  for all using (user_id = auth.uid() or user_id is null)
  with check (user_id = auth.uid() or user_id is null);
