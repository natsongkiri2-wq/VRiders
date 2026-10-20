-- 2026-10-20 Manual review fallback for licence photos the on-device check can't accept.
-- Run in the Supabase SQL editor for project dokgjfraatfzdnzqftvy BEFORE merging the app change.
--
-- Flow: a renter whose photo fails the automatic check can send it for manual review. An admin sees the
-- typed details and the photo in Admin > Suppliers, then approves (saves the licence to the renter's
-- profile and marks them verified) or rejects with a reason the renter sees.
-- Everything goes through the functions below; nobody can read or write the table directly.

create table if not exists public.licence_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  full_name text not null,
  phone text not null,
  license_number text not null,
  license_country text not null,
  license_expiry date not null,
  photo_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists licence_reviews_user_time on public.licence_reviews (user_id, created_at desc);
create index if not exists licence_reviews_pending on public.licence_reviews (status, created_at) where status = 'pending';
alter table public.licence_reviews enable row level security;  -- no policies: functions only

create or replace function public.submit_licence_review(
  p_full_name text, p_phone text, p_license_number text, p_country text, p_expiry date, p_photo_path text)
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
     or p_photo_path !~ ('^' || auth.uid()::text || '/license-review\.(jpg|png|webp)$') then
    raise exception 'invalid licence details';
  end if;
  if (select count(*) from public.licence_reviews where user_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too many review requests today';
  end if;
  delete from public.licence_reviews where user_id = auth.uid() and status = 'pending';
  insert into public.licence_reviews (user_id, full_name, phone, license_number, license_country, license_expiry, photo_path)
  values (auth.uid(), p_full_name, p_phone, p_license_number, p_country, p_expiry, p_photo_path);
end $$;

create or replace function public.my_licence_review()
returns table (status text, note text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.status, r.note, r.created_at from public.licence_reviews r
   where r.user_id = auth.uid() order by r.created_at desc limit 1;
$$;

create or replace function public.list_pending_licence_reviews()
returns table (id uuid, full_name text, phone text, license_number text, license_country text,
               license_expiry date, photo_path text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return query
    select r.id, r.full_name, r.phone, r.license_number, r.license_country, r.license_expiry, r.photo_path, r.created_at
      from public.licence_reviews r where r.status = 'pending' order by r.created_at;
end $$;

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
    license_photo_url = r.photo_path, id_verified = true
  where id = r.user_id;
  if not found then raise exception 'renter profile not found'; end if;
  update public.licence_reviews set status = 'approved', note = null, decided_at = now() where id = r.id;
end $$;

create or replace function public.reject_licence_review(target_id uuid, reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if btrim(coalesce(reason, '')) = '' then raise exception 'a reason is required'; end if;
  update public.licence_reviews
     set status = 'rejected', note = left(btrim(reason), 200), decided_at = now()
   where id = target_id and status = 'pending';
  if not found then raise exception 'no pending review'; end if;
end $$;

-- Let admins open the photos in the private kyc-documents bucket (safe if an equivalent policy exists).
drop policy if exists "admin reads licence review photos" on storage.objects;
create policy "admin reads licence review photos" on storage.objects
  for select to authenticated using (bucket_id = 'kyc-documents' and public.is_admin());

revoke execute on function public.submit_licence_review(text, text, text, text, date, text) from public, anon;
grant execute on function public.submit_licence_review(text, text, text, text, date, text) to authenticated;
revoke execute on function public.my_licence_review() from public, anon;
grant execute on function public.my_licence_review() to authenticated;
revoke execute on function public.list_pending_licence_reviews() from public, anon;
grant execute on function public.list_pending_licence_reviews() to authenticated;
revoke execute on function public.approve_licence_review(uuid) from public, anon;
grant execute on function public.approve_licence_review(uuid) to authenticated;
revoke execute on function public.reject_licence_review(uuid, text) from public, anon;
grant execute on function public.reject_licence_review(uuid, text) to authenticated;
