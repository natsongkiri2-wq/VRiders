-- 2026-10-19 Licence check for suppliers.
-- Run in the Supabase SQL editor for project dokgjfraatfzdnzqftvy. Safe to run before or after
-- deploying the app: until it exists the supplier request card simply hides the licence panel.
--
-- What it adds:
--   * booking_licence_check(p_booking_id)  returns the renter's licence details for ONE booking.
--     Callable only by the supplier who owns that booking (or an admin). Returns the facts the
--     app's rule check needs, including whether the same licence number is on another account.
--   * a storage SELECT policy so that same supplier can open the renter's licence photo
--     (private bucket kyc-documents) through a short-lived signed link.
-- Nothing else about who can see licences changes. Cancelled and declined bookings do not grant access.

create or replace function public.booking_licence_check(p_booking_id uuid)
returns table (
  full_name text,
  license_number text,
  license_country text,
  license_expiry date,
  has_photo boolean,
  photo_path text,
  number_used_by_others integer,
  date_to date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select p.full_name::text,
         p.license_number::text,
         p.license_country::text,
         p.license_expiry::date,
         (p.license_photo_url is not null and p.license_photo_url <> ''),
         case when p.license_photo_url is not null and p.license_photo_url <> '' then p.license_photo_url::text end,
         (select count(*)::int from public.profiles o
           where o.id <> p.id
             and p.license_number is not null
             and lower(regexp_replace(o.license_number, '[^a-zA-Z0-9]', '', 'g'))
               = lower(regexp_replace(p.license_number, '[^a-zA-Z0-9]', '', 'g'))),
         b.date_to::date
    from public.rental_bookings b
    join public.profiles p on p.id = b.customer_id
   where b.id = p_booking_id
     and (
       public.is_admin()
       or exists (select 1 from public.suppliers s where s.id = b.supplier_id and s.user_id = auth.uid())
     );
end;
$$;

revoke execute on function public.booking_licence_check(uuid) from public, anon;
grant execute on function public.booking_licence_check(uuid) to authenticated;

drop policy if exists "supplier reads booked renter licence photo" on storage.objects;
create policy "supplier reads booked renter licence photo"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'kyc-documents'
    and exists (
      select 1
        from public.rental_bookings b
        join public.suppliers s on s.id = b.supplier_id
        join public.profiles p on p.id = b.customer_id
       where s.user_id = auth.uid()
         and b.status::text not in ('declined', 'cancelled')
         and p.license_photo_url is not null
         and p.license_photo_url = storage.objects.name
    )
  );
