-- 2026-10-11 Security lockdown, PART 2 of 2
-- Apply only AFTER the app version that reads availability via
-- vehicle_booked_ranges() and the own supplier record via get_my_supplier()
-- is live; the previous app version would break without the dropped access.

-- Hide contact/KYC columns from the public API. Only the columns the app
-- needs for listings (and that RLS policies reference) stay readable.
revoke select on public.suppliers from anon, authenticated;
grant select (id, user_id, business_name, business_type, phone, area,
              years_operating, kyc_status, verified_at, created_at)
  on public.suppliers to anon, authenticated;

-- Stop exposing every pending/accepted booking row (customer_id, reference...)
-- to anonymous visitors; availability now comes from vehicle_booked_ranges().
drop policy if exists "Anyone can view pending/accepted booking dates" on public.rental_bookings;
