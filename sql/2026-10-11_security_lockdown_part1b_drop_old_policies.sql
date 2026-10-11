-- 2026-10-11 Security lockdown, PART 1b: remove the old, over-permissive policies.
-- The new, tighter replacements were created in part 1.
-- (The SQL tool in the Claude session cancelled these DROP statements three
-- times, so run this once in the Supabase SQL editor.)
drop policy "Suppliers manage their own record" on public.suppliers;
drop policy "Customers manage their own bookings" on public.rental_bookings;
drop policy "Booking participants can leave a review" on public.reviews;
drop policy "Customers raise disputes on their bookings" on public.disputes;
