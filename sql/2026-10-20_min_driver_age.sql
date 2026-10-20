-- 2026-10-20 Minimum driver age 21: collect a date of birth with the licence and refuse requests from
-- renters under 21 on the start date (or with no date of birth on file).
-- Run in the Supabase SQL editor for project dokgjfraatfzdnzqftvy BEFORE merging the app change.
-- Existing renters have no date of birth yet: they will be asked for it in the booking Licence step
-- (Update details) before their next request. Existing bookings are not affected.
-- Limit: the date of birth is self-declared (it is not read from the licence photo).

alter table public.profiles add column if not exists date_of_birth date;
alter table public.licence_reviews add column if not exists date_of_birth date;

create or replace function private.age_ok(p_customer uuid, p_on date, p_min int) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.date_of_birth is not null and p.date_of_birth <= (p_on - make_interval(years => p_min))::date
                     from public.profiles p where p.id = p_customer), false)
$$;
revoke execute on function private.age_ok(uuid, date, int) from public;
grant execute on function private.age_ok(uuid, date, int) to authenticated, anon;

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
    if tg_op = 'INSERT' and not private.age_ok(new.customer_id, new.date_from, 21) then
      raise exception 'Renters must be 21 or over on the start date, with a date of birth on file. Update your details in the Licence step.' using errcode = '42501';
    end if;
    if private.dates_blocked(new.vehicle_id, new.date_from, new.date_to) then
      raise exception 'Some of these dates are blocked on the supplier''s calendar for this vehicle.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- Manual licence review now carries the date of birth.
drop function if exists public.submit_licence_review(text, text, text, text, date, text);
create or replace function public.submit_licence_review(
  p_full_name text, p_phone text, p_license_number text, p_country text, p_expiry date, p_date_of_birth date, p_photo_path text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  p_full_name := btrim(p_full_name); p_phone := btrim(p_phone); p_license_number := btrim(p_license_number);
  if char_length(p_full_name) not between 2 and 80
     or char_length(regexp_replace(p_phone, '[^0-9]', '', 'g')) < 7 or char_length(p_phone) > 30
     or char_length(p_license_number) not between 4 and 30
     or p_country not in ('Vanuatu','Australia','New Zealand','France','United Kingdom','United States','Other')
     or p_expiry is null or p_expiry < current_date
     or p_date_of_birth is null or p_date_of_birth > current_date or p_date_of_birth < date '1900-01-01'
     or p_photo_path !~ ('^' || auth.uid()::text || '/license-review\.(jpg|png|webp)$') then
    raise exception 'invalid licence details';
  end if;
  if p_date_of_birth > (current_date - interval '21 years')::date then
    raise exception 'You must be 21 or over to rent a vehicle.';
  end if;
  if (select count(*) from public.licence_reviews where user_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too many review requests today';
  end if;
  delete from public.licence_reviews where user_id = auth.uid() and status = 'pending';
  insert into public.licence_reviews (user_id, full_name, phone, license_number, license_country, license_expiry, date_of_birth, photo_path)
  values (auth.uid(), p_full_name, p_phone, p_license_number, p_country, p_expiry, p_date_of_birth, p_photo_path);
end $$;
revoke execute on function public.submit_licence_review(text, text, text, text, date, date, text) from public, anon;
grant execute on function public.submit_licence_review(text, text, text, text, date, date, text) to authenticated;

drop function if exists public.list_pending_licence_reviews();
create or replace function public.list_pending_licence_reviews()
returns table (id uuid, full_name text, phone text, license_number text, license_country text,
               license_expiry date, date_of_birth date, photo_path text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return query
    select r.id, r.full_name, r.phone, r.license_number, r.license_country, r.license_expiry, r.date_of_birth, r.photo_path, r.created_at
      from public.licence_reviews r where r.status = 'pending' order by r.created_at;
end $$;
revoke execute on function public.list_pending_licence_reviews() from public, anon;
grant execute on function public.list_pending_licence_reviews() to authenticated;

create or replace function public.approve_licence_review(target_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.licence_reviews;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  select * into r from public.licence_reviews where id = target_id and status = 'pending';
  if not found then raise exception 'no pending review'; end if;
  if r.license_expiry < current_date then raise exception 'licence has expired'; end if;
  update public.profiles set
    full_name = r.full_name, phone = r.phone, license_number = r.license_number,
    license_country = r.license_country, license_expiry = r.license_expiry,
    date_of_birth = r.date_of_birth,
    license_photo_url = r.photo_path, id_verified = true
  where id = r.user_id;
  if not found then raise exception 'renter profile not found'; end if;
  update public.licence_reviews set status = 'approved', note = null, decided_at = now() where id = r.id;
end $$;
