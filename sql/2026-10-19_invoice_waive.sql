-- 2026-10-19 Waive an invoice (pilot offer: first 5 suppliers, 0% commission for 2 months).
-- Run in the Supabase SQL editor for project dokgjfraatfzdnzqftvy (the one the app uses).
-- Safe to run before OR after deploying the new App.jsx: until this exists the app
-- hides the new columns and the Waive button reports an error instead of changing anything.
--
-- What it adds:
--   * invoices.waived_at, invoices.waive_reason
--   * a new invoice status 'waived' (works whether invoices.status is plain text with a
--     CHECK constraint, a Postgres enum, or unconstrained text)
--   * waive_invoice(target_id, reason)    admin only: due/overdue -> waived
--   * unwaive_invoice(target_id)          admin only: waived -> due (the daily job re-marks overdue)
--
-- The existing daily job "mark-overdue-invoices" only moves due -> overdue, so it leaves
-- waived invoices alone. Check with:  select command from cron.job where jobname = 'mark-overdue-invoices';

alter table public.invoices
  add column if not exists waived_at timestamptz,
  add column if not exists waive_reason text
    check (waive_reason is null or char_length(waive_reason) <= 200);

-- Let the status column accept 'waived', keeping every value it already allows.
do $$
declare
  col_type text;
  con record;
  vals text[];
begin
  select c.udt_name
    into col_type
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'invoices' and c.column_name = 'status'
     and c.data_type = 'USER-DEFINED';

  if col_type is not null then
    -- status is an enum: add the value
    execute format('alter type public.%I add value if not exists %L', col_type, 'waived');
  else
    -- status is text: widen any CHECK constraint that mentions it
    for con in
      select conname, pg_get_constraintdef(oid) as def
        from pg_constraint
       where conrelid = 'public.invoices'::regclass
         and contype = 'c'
         and pg_get_constraintdef(oid) ilike '%status%'
         and pg_get_constraintdef(oid) !~* 'waived'
    loop
      select array_agg(distinct v) into vals
        from (
          select (regexp_matches(con.def, '''([^'']+)''', 'g'))[1] as v
          union
          select status::text from public.invoices where status is not null
          union
          select 'waived'
        ) s;
      execute format('alter table public.invoices drop constraint %I', con.conname);
      execute format(
        'alter table public.invoices add constraint %I check (status in (%s))',
        con.conname,
        (select string_agg(quote_literal(x), ', ' order by x) from unnest(vals) x)
      );
    end loop;
  end if;
end;
$$;

create or replace function public.waive_invoice(target_id uuid, reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.invoices
     set status = 'waived',
         waived_at = now(),
         waive_reason = nullif(left(btrim(reason), 200), '')
   where id = target_id
     and status::text not in ('paid', 'waived');
  if not found then
    raise exception 'invoice not found, or already paid or waived';
  end if;
end;
$$;

create or replace function public.unwaive_invoice(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.invoices
     set status = 'due',
         waived_at = null,
         waive_reason = null
   where id = target_id
     and status::text = 'waived';
  if not found then
    raise exception 'invoice not found, or not waived';
  end if;
end;
$$;

-- Same grant pattern as the other admin RPCs: signed-in users may call them
-- (is_admin() inside is the real gate); anonymous callers may not.
revoke execute on function public.waive_invoice(uuid, text) from public, anon;
grant execute on function public.waive_invoice(uuid, text) to authenticated;
revoke execute on function public.unwaive_invoice(uuid) from public, anon;
grant execute on function public.unwaive_invoice(uuid) to authenticated;
