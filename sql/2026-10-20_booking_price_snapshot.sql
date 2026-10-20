-- 2026-10-20 Price snapshot: save the agreed price and deposit on each booking when it is requested, and
-- invoice commission from the saved numbers (not the vehicle's price at invoice time).
-- Run in the Supabase SQL editor for project dokgjfraatfzdnzqftvy BEFORE merging the app change
-- (the app change reads the new column agreed_deposit_amount).
--
--  * New columns on rental_bookings: agreed_price_per_day, agreed_price_tiers, agreed_deposit_amount.
--  * A BEFORE INSERT trigger copies them from the vehicle, always overriding anything the client sent.
--  * Nobody but the database can change them afterwards (client edits are refused; admin can).
--  * Existing bookings are filled in once from the vehicle's CURRENT price (the best we have), so from now on
--    price edits no longer move commission for them either.
--  * _generate_invoices_internal() now uses the saved price and tiers (falls back to the vehicle's if empty).
-- Invoices already issued are not touched.

do $$
declare t_price text; t_tiers text; t_dep text;
begin
  select format_type(a.atttypid, a.atttypmod) into t_price from pg_attribute a
   where a.attrelid = 'public.rental_vehicles'::regclass and a.attname = 'price_per_day' and not a.attisdropped;
  select format_type(a.atttypid, a.atttypmod) into t_tiers from pg_attribute a
   where a.attrelid = 'public.rental_vehicles'::regclass and a.attname = 'price_tiers' and not a.attisdropped;
  select format_type(a.atttypid, a.atttypmod) into t_dep from pg_attribute a
   where a.attrelid = 'public.rental_vehicles'::regclass and a.attname = 'deposit_amount' and not a.attisdropped;
  execute format('alter table public.rental_bookings add column if not exists agreed_price_per_day %s', t_price);
  execute format('alter table public.rental_bookings add column if not exists agreed_price_tiers %s', t_tiers);
  execute format('alter table public.rental_bookings add column if not exists agreed_deposit_amount %s', t_dep);
end $$;

create or replace function public.snapshot_booking_price() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select v.price_per_day, v.price_tiers, v.deposit_amount
    into new.agreed_price_per_day, new.agreed_price_tiers, new.agreed_deposit_amount
    from public.rental_vehicles v where v.id = new.vehicle_id;
  return new;
end $$;
drop trigger if exists rental_bookings_snapshot on public.rental_bookings;
create trigger rental_bookings_snapshot before insert on public.rental_bookings
  for each row execute function public.snapshot_booking_price();

-- Only the database sets the snapshot and the other system columns (full replacement of the earlier guard).
create or replace function public.guard_booking_system_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() and tg_op = 'UPDATE' then
    if new.reminder_sent_at is distinct from old.reminder_sent_at
       or new.expired_at is distinct from old.expired_at
       or new.completion_reminder_sent_at is distinct from old.completion_reminder_sent_at
       or new.auto_completed_at is distinct from old.auto_completed_at
       or new.agreed_price_per_day is distinct from old.agreed_price_per_day
       or new.agreed_price_tiers::text is distinct from old.agreed_price_tiers::text
       or new.agreed_deposit_amount is distinct from old.agreed_deposit_amount then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  elsif current_user in ('authenticated', 'anon') and not public.is_admin() and tg_op = 'INSERT' then
    new.reminder_sent_at := null; new.expired_at := null;
    new.completion_reminder_sent_at := null; new.auto_completed_at := null;
  end if;
  return new;
end $$;

-- One-off backfill for bookings made before today. The guard above blocks client edits; the SQL editor is not a client.
update public.rental_bookings b
   set agreed_price_per_day = v.price_per_day, agreed_price_tiers = v.price_tiers, agreed_deposit_amount = v.deposit_amount
  from public.rental_vehicles v
 where v.id = b.vehicle_id and b.agreed_price_per_day is null and b.agreed_deposit_amount is null;

create or replace function public._generate_invoices_internal()
 returns table(invoice_count integer, booking_count integer)
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_supplier_id uuid;
  v_invoice_id uuid;
  v_booking record;
  v_period_start date;
  v_invoice_count integer := 0;
  v_booking_count integer := 0;
begin
  for v_supplier_id in
    select distinct b.supplier_id
    from rental_bookings b
    where b.status = 'completed'
      and not exists (select 1 from invoice_items ii where ii.booking_id = b.id)
  loop
    select min(b.date_from) into v_period_start
    from rental_bookings b
    where b.status = 'completed'
      and b.supplier_id = v_supplier_id
      and not exists (select 1 from invoice_items ii where ii.booking_id = b.id);

    insert into invoices (supplier_id, period_start, period_end, commission_rate, status, due_date)
    values (v_supplier_id, v_period_start, current_date, 0.08, 'due', current_date + interval '14 days')
    returning id into v_invoice_id;

    v_invoice_count := v_invoice_count + 1;

    for v_booking in
      select b.id as booking_id,
             greatest(1, (b.date_to - b.date_from)) as nights,
             coalesce(b.agreed_price_per_day, v.price_per_day, 0) as price_per_day,
             case when b.agreed_price_per_day is not null then b.agreed_price_tiers else v.price_tiers end as price_tiers
      from rental_bookings b
      join rental_vehicles v on v.id = b.vehicle_id
      where b.status = 'completed'
        and b.supplier_id = v_supplier_id
        and not exists (select 1 from invoice_items ii where ii.booking_id = b.id)
    loop
      insert into invoice_items (invoice_id, booking_id, gross_amount)
      values (
        v_invoice_id,
        v_booking.booking_id,
        v_booking.nights * public.rental_effective_price_per_day(v_booking.price_per_day, v_booking.price_tiers, v_booking.nights)
      );

      v_booking_count := v_booking_count + 1;
    end loop;
  end loop;

  return query select v_invoice_count, v_booking_count;
end;
$function$;
