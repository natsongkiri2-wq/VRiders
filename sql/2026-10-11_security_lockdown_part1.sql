-- 2026-10-11 Security lockdown, PART 1 of 2 (gap report items 1-6)
-- (The four DROP POLICY statements live in part1b.)
-- Safe to apply before the app update: adds guards, new functions and tighter
-- write policies. Part 2 (2026-10-11_security_lockdown_part2.sql) removes the
-- public reads and must be applied AFTER the app that uses the new functions
-- is deployed.
--
-- Why: a rolled-back test against the live database showed that any signed-in
-- user could self-verify as a supplier, flip their own id_verified flag, create
-- vehicles with verified/rating/review_count set, forge bookings (status,
-- supplier_id, refund fields), post reviews without a completed booking, and
-- that anonymous visitors could read supplier contact/KYC columns and every
-- pending/accepted booking row.
--
-- Approach: "guard" triggers run as the caller (SECURITY INVOKER) and only
-- restrict the REST API roles (authenticated/anon). SECURITY DEFINER functions
-- (approve_supplier, update_vehicle_rating, ...) run as the owner, so they
-- keep working; admins (is_admin()) are also exempt.

-- ---------------------------------------------------------------- suppliers
create or replace function public.guard_suppliers() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if tg_op = 'INSERT' then
      if new.kyc_status not in ('unverified', 'pending') then
        raise exception 'kyc_status can only be changed by an admin' using errcode = '42501';
      end if;
      new.verified_at := null;
    else
      if new.kyc_status is distinct from old.kyc_status
         and (new.kyc_status = 'verified' or old.kyc_status = 'verified') then
        raise exception 'kyc_status can only be changed by an admin' using errcode = '42501';
      end if;
      if new.verified_at is distinct from old.verified_at then
        raise exception 'verified_at can only be changed by an admin' using errcode = '42501';
      end if;
      if new.user_id is distinct from old.user_id then
        raise exception 'user_id cannot be changed' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace trigger suppliers_guard before insert or update on public.suppliers
  for each row execute function public.guard_suppliers();

-- A supplier may create and edit their own record but never delete it
-- (deleting cascades to their vehicles and bookings).
create policy "Suppliers create their own record" on public.suppliers
  for insert to authenticated with check (auth.uid() = user_id);

-- The signed-in supplier reads their own full record through this function.
create or replace function public.get_my_supplier() returns public.suppliers
language sql stable security definer set search_path = public as $$
  select * from public.suppliers where user_id = auth.uid() limit 1;
$$;
revoke all on function public.get_my_supplier() from public, anon;
grant execute on function public.get_my_supplier() to authenticated;

-- ----------------------------------------------------------------- profiles
create or replace function public.guard_profiles() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if tg_op = 'INSERT' then
      if new.id_verified then
        raise exception 'id_verified cannot be set directly' using errcode = '42501';
      end if;
    elsif new.id_verified
          and (not old.id_verified
               or new.license_number is distinct from old.license_number
               or new.license_expiry is distinct from old.license_expiry) then
      -- The app verifies a renter once they submit licence details, so the
      -- flag may only be switched on together with real licence details.
      if coalesce(btrim(new.license_number), '') = ''
         or coalesce(btrim(new.license_country), '') = ''
         or new.license_expiry is null
         or new.license_expiry < current_date - 1 then
        raise exception 'Licence number, country and a valid expiry date are required to verify' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace trigger profiles_guard before insert or update on public.profiles
  for each row execute function public.guard_profiles();

-- ----------------------------------------------------------- rental_vehicles
create or replace function public.guard_rental_vehicles() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if tg_op = 'INSERT' then
      if not exists (select 1 from public.suppliers s
                     where s.id = new.supplier_id and s.kyc_status = 'verified') then
        raise exception 'Your supplier account must be verified before you can list vehicles' using errcode = '42501';
      end if;
      new.verified := false;
      new.rating := null;
      new.review_count := 0;
      new.is_active := true;
    else
      if new.verified is distinct from old.verified
         or new.rating is distinct from old.rating
         or new.review_count is distinct from old.review_count
         or new.is_active is distinct from old.is_active
         or new.supplier_id is distinct from old.supplier_id then
        raise exception 'verified, rating, review_count, is_active and supplier_id can only be changed by an admin' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace trigger rental_vehicles_guard before insert or update on public.rental_vehicles
  for each row execute function public.guard_rental_vehicles();

-- ----------------------------------------------------------- rental_bookings
create or replace function public.guard_rental_bookings() returns trigger
language plpgsql set search_path = public as $$
declare
  v public.rental_vehicles%rowtype;
  is_customer boolean;
  is_supplier boolean;
begin
  if not (current_user in ('authenticated', 'anon')) or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select * into v from public.rental_vehicles where id = new.vehicle_id;
    if not found or not v.is_active then
      raise exception 'This vehicle is not available' using errcode = '42501';
    end if;
    -- The supplier always comes from the vehicle, never from the client.
    new.supplier_id := v.supplier_id;
    if exists (select 1 from public.suppliers s where s.id = v.supplier_id and s.user_id = auth.uid()) then
      raise exception 'You cannot book your own vehicle' using errcode = '42501';
    end if;
    if not exists (select 1 from public.suppliers s where s.id = v.supplier_id and s.kyc_status = 'verified') then
      raise exception 'This supplier is not verified' using errcode = '42501';
    end if;
    if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.id_verified) then
      raise exception 'Verify your licence before booking' using errcode = '42501';
    end if;
    if new.status is distinct from 'pending' then
      raise exception 'New bookings must start as pending' using errcode = '42501';
    end if;
    if new.cancelled_by is not null or new.cancelled_at is not null
       or new.return_completed_at is not null or new.deposit_refunded_at is not null
       or new.deposit_refund_amount is not null or new.deposit_deduction_reason is not null
       or new.pickup_note is not null or new.return_note is not null then
      raise exception 'Booking progress fields cannot be set on creation' using errcode = '42501';
    end if;
    if new.date_from < current_date - 1 then
      raise exception 'Booking dates cannot be in the past' using errcode = '42501';
    end if;
    if not new.agreed_no_insurance then
      raise exception 'The no-insurance acknowledgement is required' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.vehicle_id is distinct from old.vehicle_id
     or new.supplier_id is distinct from old.supplier_id
     or new.customer_id is distinct from old.customer_id
     or new.date_from is distinct from old.date_from
     or new.date_to is distinct from old.date_to
     or new.reference is distinct from old.reference
     or new.agreed_no_insurance is distinct from old.agreed_no_insurance
     or new.created_at is distinct from old.created_at then
    raise exception 'Booking details cannot be changed' using errcode = '42501';
  end if;

  is_customer := auth.uid() = old.customer_id;
  is_supplier := exists (select 1 from public.suppliers s
                         where s.id = old.supplier_id and s.user_id = auth.uid());

  if is_customer then
    if new.deposit_refunded_at is distinct from old.deposit_refunded_at
       or new.deposit_refund_amount is distinct from old.deposit_refund_amount
       or new.deposit_deduction_reason is distinct from old.deposit_deduction_reason then
      raise exception 'Only the supplier can record a deposit refund' using errcode = '42501';
    end if;
    if new.return_completed_at is distinct from old.return_completed_at and old.return_completed_at is not null then
      raise exception 'Return already completed' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      if not (old.status in ('pending', 'accepted') and new.status = 'cancelled'
              and new.cancelled_by = 'customer') then
        raise exception 'Customers can only cancel a pending or accepted booking' using errcode = '42501';
      end if;
    elsif new.cancelled_by is distinct from old.cancelled_by
          or new.cancelled_at is distinct from old.cancelled_at then
      raise exception 'Cancellation fields cannot be changed' using errcode = '42501';
    end if;
  elsif is_supplier then
    if new.pickup_note is distinct from old.pickup_note
       or new.return_note is distinct from old.return_note
       or new.return_completed_at is distinct from old.return_completed_at then
      raise exception 'Pickup and return details belong to the customer' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      if not ((old.status = 'pending'  and new.status in ('accepted', 'declined', 'cancelled'))
           or (old.status = 'accepted' and new.status in ('completed', 'cancelled'))) then
        raise exception 'That status change is not allowed' using errcode = '42501';
      end if;
      if new.status = 'cancelled' and new.cancelled_by is distinct from 'supplier' then
        raise exception 'Cancellations by the supplier must be recorded as such' using errcode = '42501';
      end if;
    elsif new.cancelled_by is distinct from old.cancelled_by
          or new.cancelled_at is distinct from old.cancelled_at then
      raise exception 'Cancellation fields cannot be changed' using errcode = '42501';
    end if;
    if (new.deposit_refunded_at is distinct from old.deposit_refunded_at
        or new.deposit_refund_amount is distinct from old.deposit_refund_amount
        or new.deposit_deduction_reason is distinct from old.deposit_deduction_reason)
       and not (new.status = 'completed' and old.deposit_refunded_at is null) then
      raise exception 'Deposit refunds can only be recorded when completing a booking' using errcode = '42501';
    end if;
  else
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return new;
end $$;

create or replace trigger rental_bookings_guard before insert or update on public.rental_bookings
  for each row execute function public.guard_rental_bookings();

-- Customers: no blanket ALL (it allowed deleting and rewriting bookings).
create policy "Customers view own bookings" on public.rental_bookings
  for select to authenticated using (auth.uid() = customer_id);
create policy "Customers create own bookings" on public.rental_bookings
  for insert to authenticated with check (auth.uid() = customer_id);
create policy "Customers update own bookings" on public.rental_bookings
  for update to authenticated using (auth.uid() = customer_id) with check (auth.uid() = customer_id);

-- Public availability: dates only, via a function (the open-read policy is dropped in part 2).
create or replace function public.vehicle_booked_ranges(p_vehicle_id uuid)
returns table (date_from date, date_to date)
language sql stable security definer set search_path = public as $$
  select b.date_from, b.date_to
  from public.rental_bookings b
  where b.vehicle_id = p_vehicle_id and b.status in ('pending', 'accepted');
$$;
revoke all on function public.vehicle_booked_ranges(uuid) from public;
grant execute on function public.vehicle_booked_ranges(uuid) to anon, authenticated;

-------------------------------------------------------------------- reviews
create policy "Booking participants can review completed bookings" on public.reviews
  for insert to authenticated with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.rental_bookings b
      where b.id = reviews.booking_id
        and b.status = 'completed'
        and (
          (reviews.target_type = 'supplier'
            and b.customer_id = auth.uid()
            and reviews.target_supplier_id = b.supplier_id)
          or
          (reviews.target_type = 'customer'
            and reviews.target_customer_id = b.customer_id
            and b.supplier_id in (select s.id from public.suppliers s where s.user_id = auth.uid()))
        )
    )
  );

------------------------------------------------------------------- disputes
create policy "Booking participants raise disputes" on public.disputes
  for insert to authenticated with check (
    auth.uid() = raised_by
    and status = 'open'
    and exists (
      select 1 from public.rental_bookings b
      where b.id = disputes.booking_id
        and (b.customer_id = auth.uid()
             or b.supplier_id in (select s.id from public.suppliers s where s.user_id = auth.uid()))
    )
  );
