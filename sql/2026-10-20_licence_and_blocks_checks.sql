-- 2026-10-20 Server-side checks that were only in the browser: licence validity and supplier blocked dates.
-- Run in the Supabase SQL editor for project dokgjfraatfzdnzqftvy. No app change needed.
--
--  1. A request is refused if the renter's licence expires before the return date (same rule the Licence
--     step shows in the app). Accepting a request is refused if the renter's licence has since expired
--     before the return date.
--  2. A request is refused if any of its dates are blocked on the supplier's calendar for that vehicle.
--     Accepting a pending request is refused if the supplier has blocked its dates since it was made.
--  3. A supplier cannot block dates that already have a pending or accepted booking.
-- Admins (and the SQL editor) are not affected. Bookings already accepted are not re-checked.
--
-- Design note: the trigger functions run as the caller (so they can tell a client from the system); they read
-- other people's rows only through small yes/no helpers in the "private" schema, which the API does not expose.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, anon;

create or replace function private.licence_valid_until(p_customer uuid, p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.license_expiry >= p_date from public.profiles p where p.id = p_customer), false)
$$;
create or replace function private.dates_blocked(p_vehicle uuid, p_from date, p_to date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.supplier_blocks b
                  where b.vehicle_id = p_vehicle and b.date_from <= p_to and b.date_to >= p_from)
$$;
create or replace function private.dates_booked(p_vehicle uuid, p_from date, p_to date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rental_bookings r
                  where r.vehicle_id = p_vehicle and r.status in ('pending', 'accepted')
                    and r.date_from <= p_to and r.date_to >= p_from)
$$;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, anon;

create or replace function public.check_booking_rules() returns trigger
language plpgsql set search_path = public as $$
begin
  if not (current_user in ('authenticated', 'anon')) or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted') then
    if not private.licence_valid_until(new.customer_id, new.date_to) then
      raise exception 'The renter''s driving licence must be valid until the return date (%).', new.date_to using errcode = '42501';
    end if;
    if private.dates_blocked(new.vehicle_id, new.date_from, new.date_to) then
      raise exception 'Some of these dates are blocked on the supplier''s calendar for this vehicle.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists rental_bookings_rules on public.rental_bookings;
create trigger rental_bookings_rules before insert or update on public.rental_bookings
  for each row execute function public.check_booking_rules();

create or replace function public.check_block_rules() returns trigger
language plpgsql set search_path = public as $$
begin
  if not (current_user in ('authenticated', 'anon')) or public.is_admin() then
    return new;
  end if;
  if private.dates_booked(new.vehicle_id, new.date_from, new.date_to) then
    raise exception 'These dates already have a booking request or booking. Decline or cancel it first.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists supplier_blocks_rules on public.supplier_blocks;
create trigger supplier_blocks_rules before insert on public.supplier_blocks
  for each row execute function public.check_block_rules();
