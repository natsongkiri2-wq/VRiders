-- 2026-10-19 Attempt log for the licence photo check (limits how often the AI check can run per renter).
-- Run in the Supabase SQL editor. The verify-licence edge function writes to it with the service role;
-- no one else can read or write it. If this table is missing the function still works, just without the limit.
create table if not exists public.licence_checks (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  passed boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists licence_checks_user_time on public.licence_checks (user_id, created_at desc);
alter table public.licence_checks enable row level security;  -- no policies: only the service role can use it
