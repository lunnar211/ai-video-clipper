-- ClipForge Phase 13 migration (ADDITIVE ONLY — NOT APPLIED).
--
-- DO NOT APPLY BLINDLY. The owner chooses the Supabase project and
-- approves applying this file in the Supabase SQL editor. Nothing in
-- the app applies it, and no live database is touched by this repo.
-- PREREQUISITE: apply supabase/clipper-schema.sql first, then
-- supabase/migrations/001_clipforge_phase1.sql, then 002, 003, 004,
-- 005, 006 (in order) — the activity route also needs
-- NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set.
--
-- Table: clipper_post_activity — activity-only log for the
-- post-without-connecting flow (device share sheet + deep links).
-- Columns are deliberately minimal: clip id, platform, outcome,
-- timestamp. There is NO column for any login, grant, session,
-- media content, or post URL, because the flow has none of those by
-- construction. Outcomes are "shared" / "cancelled" / "opened" /
-- "unsupported" — never "published": only the platform itself can
-- confirm a live post, and this log never claims otherwise.
--
-- RLS is on with deliberately NO anon/authenticated policy: the
-- table is reachable only through the service-role API routes
-- (POST /api/post-activity for recording, GET
-- /api/admin/post-activity behind the admin role + MFA gate for
-- aggregates). The service-role key bypasses RLS in raw SQL, as in
-- every earlier migration; the app enforces its gates in code.

create table if not exists public.clipper_post_activity (
  id uuid primary key default gen_random_uuid(),
  clip_id text not null,
  platform text not null check (
    platform in (
      'youtube', 'tiktok', 'instagram', 'facebook', 'x', 'linkedin',
      'share_sheet'
    )
  ),
  outcome text not null check (
    outcome in ('shared', 'cancelled', 'opened', 'unsupported')
  ),
  created_at timestamptz not null default now()
);

alter table public.clipper_post_activity enable row level security;

create index if not exists clipper_post_activity_created_idx
  on public.clipper_post_activity (created_at desc);
