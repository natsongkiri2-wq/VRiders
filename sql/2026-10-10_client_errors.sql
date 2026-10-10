-- Item 5: in-app error tracking. Run in the Supabase SQL editor for project
-- dokgjfraatfzdnzqftvy. Until this runs, error reports are silently dropped.

create table if not exists public.client_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  message     text not null check (char_length(message) <= 500),
  stack       text check (stack is null or char_length(stack) <= 4000),
  source      text check (source is null or char_length(source) <= 40),
  path        text check (path is null or char_length(path) <= 200),
  user_agent  text check (user_agent is null or char_length(user_agent) <= 300),
  app_version text check (app_version is null or char_length(app_version) <= 40)
);

alter table public.client_errors enable row level security;

-- Anyone (including signed-out visitors) may INSERT a report; nobody but an
-- admin may read them. Length limits above cap how much junk one row can hold.
drop policy if exists "Anyone can report errors" on public.client_errors;
create policy "Anyone can report errors" on public.client_errors
  for insert to anon, authenticated with check (true);

drop policy if exists "Admins read errors" on public.client_errors;
create policy "Admins read errors" on public.client_errors
  for select to authenticated using (public.is_admin());

revoke all on public.client_errors from anon, authenticated;
grant insert on public.client_errors to anon, authenticated;
grant select on public.client_errors to authenticated;

-- To review recent errors:
--   select created_at, source, message, path, app_version
--   from public.client_errors order by created_at desc limit 50;
