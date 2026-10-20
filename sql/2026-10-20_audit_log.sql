-- 2026-10-20 Audit log: who changed what, and when.
-- Run in the Supabase SQL editor for project dokgjfraatfzdnzqftvy. Safe to run before or after the app change
-- (until it exists the Admin > Activity tab just shows nothing).
--
-- Database triggers write one row per important change, so it can't be skipped or edited from the app.
-- Covers: bookings (created, status, cancelled by, pickup/return/deposit), invoices (paid, waived),
-- suppliers (verified, profile details), renter licence flags, disputes, licence reviews.
-- Licence numbers are never copied here: only "changed". Nobody can read the table directly; admins use
-- list_audit_log(). Logging never blocks the real action: if the log write fails the change still goes through.

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,                -- auth.uid(); null = scheduled job or SQL editor
  actor_kind text not null,     -- 'admin' | 'user' | 'system'
  entity text not null,         -- table name
  entity_id text not null,
  action text not null,         -- created | updated | status_changed | deleted
  details jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_time on public.audit_log (at desc);
create index if not exists audit_log_entity on public.audit_log (entity, entity_id, at desc);
alter table public.audit_log enable row level security;  -- no policies: functions only
revoke all on public.audit_log from anon, authenticated;

-- TG_ARGV[0] = comma list of columns to watch, TG_ARGV[1] = comma list of watched columns whose values must not be stored.
create or replace function public.log_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  watch text[] := string_to_array(coalesce(TG_ARGV[0], ''), ',');
  hide text[] := string_to_array(coalesce(TG_ARGV[1], ''), ',');
  n jsonb; o jsonb; k text; changed jsonb := '{}'::jsonb; ctx jsonb := '{}'::jsonb;
  act text; kind text; eid text;
begin
  begin
    if TG_OP = 'DELETE' then o := to_jsonb(OLD); n := '{}'::jsonb; eid := o->>'id';
    else n := to_jsonb(NEW); o := case when TG_OP = 'UPDATE' then to_jsonb(OLD) else '{}'::jsonb end; eid := n->>'id'; end if;

    foreach k in array array['supplier_id','user_id','customer_id','vehicle_id','booking_id','reference'] loop
      if (n ? k and n->k <> 'null'::jsonb) then ctx := ctx || jsonb_build_object(k, n->k);
      elsif (o ? k and o->k <> 'null'::jsonb) then ctx := ctx || jsonb_build_object(k, o->k); end if;
    end loop;

    foreach k in array watch loop
      if TG_OP = 'UPDATE' then
        if (o->k) is distinct from (n->k) then
          changed := changed || jsonb_build_object(k, case when k = any(hide) then to_jsonb('changed'::text) else jsonb_build_array(o->k, n->k) end);
        end if;
      elsif TG_OP = 'INSERT' and n ? k and n->k <> 'null'::jsonb and not (k = any(hide)) then
        changed := changed || jsonb_build_object(k, n->k);
      end if;
    end loop;

    if TG_OP = 'UPDATE' and changed = '{}'::jsonb then return null; end if;   -- nothing we watch changed
    act := case TG_OP when 'INSERT' then 'created' when 'DELETE' then 'deleted'
                      else case when changed ? 'status' then 'status_changed' else 'updated' end end;
    kind := case when auth.uid() is null then 'system' when public.is_admin() then 'admin' else 'user' end;
    insert into public.audit_log (actor_id, actor_kind, entity, entity_id, action, details)
    values (auth.uid(), kind, TG_TABLE_NAME, coalesce(eid, ''), act, jsonb_build_object('changes', changed, 'context', ctx));
  exception when others then
    raise warning 'audit log write failed: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.log_audit() from public, anon, authenticated;

do $$
declare spec record;
begin
  for spec in select * from (values
    ('rental_bookings', 'status,cancelled_by,cancelled_at,date_from,date_to,pickup_completed_at,return_completed_at,deposit_refunded_at,deposit_refund_amount,deposit_deduction_reason', ''),
    ('invoices',        'status,paid_at,waived_at,waive_reason,payment_reference', ''),
    ('suppliers',       'verified,status,business_name,contact_name,phone,email,profile_change_note', ''),
    ('profiles',        'id_verified,license_number,license_country,license_expiry,license_photo_url', 'license_number,license_country,license_expiry,license_photo_url'),
    ('disputes',        'status,resolution', ''),
    ('licence_reviews', 'status,note', '')
  ) as v(tbl, watch, hide)
  loop
    if to_regclass('public.' || spec.tbl) is not null then
      execute format('drop trigger if exists audit_%1$s on public.%1$I', spec.tbl);
      execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.log_audit(%2$L, %3$L)',
                     spec.tbl, spec.watch, spec.hide);
    end if;
  end loop;
end $$;

create or replace function public.list_audit_log(p_search text default null, p_entity text default null, p_limit int default 100, p_before timestamptz default null)
returns table (id bigint, at timestamptz, actor_id uuid, actor_name text, actor_kind text, entity text, entity_id text, action text, details jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return query
    select a.id, a.at, a.actor_id,
           coalesce(nullif(btrim(p.full_name), ''), u.email::text) as actor_name,
           a.actor_kind, a.entity, a.entity_id, a.action, a.details
      from public.audit_log a
      left join public.profiles p on p.id = a.actor_id
      left join auth.users u on u.id = a.actor_id
     where (p_entity is null or a.entity = p_entity)
       and (p_before is null or a.at < p_before)
       and (p_search is null or p_search = '' or a.entity_id = p_search or a.details::text ilike '%' || p_search || '%')
     order by a.at desc, a.id desc
     limit least(greatest(coalesce(p_limit, 100), 1), 300);
end $$;
revoke execute on function public.list_audit_log(text, text, int, timestamptz) from public, anon;
grant execute on function public.list_audit_log(text, text, int, timestamptz) to authenticated;
