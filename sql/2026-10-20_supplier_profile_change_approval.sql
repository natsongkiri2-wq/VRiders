-- 2026-10-20 Supplier profile edits need admin approval.
-- Run in the Supabase SQL editor for project dokgjfraatfzdnzqftvy. Run it BEFORE merging the app change
-- (until it exists, the Edit profile form reports an error instead of saving).
--
-- How it works:
--   * A verified supplier asks for a change with request_profile_change(...). The change is stored in
--     suppliers.pending_changes; their live business name / contact / phone / email do NOT change yet,
--     and they stay verified and listed.
--   * An admin sees it in the Admin > Suppliers tab and approves (applies it) or rejects it (with a note
--     the supplier sees).
--   * guard_suppliers() now also stops a signed-in non-admin from editing those four fields (or the
--     pending/note columns) directly through the API after verification, so the form is the only route.
--     (The security-definer functions below run as the owner, so the trigger lets them through.)

alter table public.suppliers
  add column if not exists pending_changes jsonb,
  add column if not exists pending_changes_at timestamptz,
  add column if not exists profile_change_note text;

create or replace function public.guard_suppliers() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if tg_op = 'INSERT' then
      if new.kyc_status not in ('unverified', 'pending') then
        raise exception 'kyc_status can only be changed by an admin' using errcode = '42501';
      end if;
      new.verified_at := null;
      new.pending_changes := null;
      new.pending_changes_at := null;
      new.profile_change_note := null;
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
      if new.pending_changes is distinct from old.pending_changes
         or new.pending_changes_at is distinct from old.pending_changes_at
         or new.profile_change_note is distinct from old.profile_change_note then
        raise exception 'profile changes must be requested through the app' using errcode = '42501';
      end if;
      if old.kyc_status = 'verified'
         and (new.business_name is distinct from old.business_name
              or new.contact_name is distinct from old.contact_name
              or new.phone is distinct from old.phone
              or new.email is distinct from old.email) then
        raise exception 'profile changes need admin approval' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace function public.request_profile_change(
  p_business_name text, p_contact_name text, p_phone text, p_email text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.suppliers;
  chg jsonb := '{}'::jsonb;
begin
  select * into s from public.suppliers where user_id = auth.uid() limit 1;
  if not found then raise exception 'no supplier profile'; end if;
  if s.kyc_status <> 'verified' then raise exception 'only verified suppliers can request profile changes'; end if;

  p_business_name := btrim(p_business_name); p_contact_name := btrim(p_contact_name);
  p_phone := btrim(p_phone); p_email := btrim(p_email);
  if char_length(p_business_name) not between 2 and 80
     or char_length(p_contact_name) not between 2 and 80
     or char_length(regexp_replace(p_phone, '[^0-9]', '', 'g')) < 7 or char_length(p_phone) > 30
     or p_email !~ '^\S+@\S+\.\S+$' or char_length(p_email) > 120 then
    raise exception 'invalid profile details';
  end if;

  if p_business_name is distinct from s.business_name then chg := chg || jsonb_build_object('business_name', p_business_name); end if;
  if p_contact_name  is distinct from s.contact_name  then chg := chg || jsonb_build_object('contact_name', p_contact_name); end if;
  if p_phone         is distinct from s.phone         then chg := chg || jsonb_build_object('phone', p_phone); end if;
  if p_email         is distinct from s.email         then chg := chg || jsonb_build_object('email', p_email); end if;

  if chg = '{}'::jsonb then
    update public.suppliers set pending_changes = null, pending_changes_at = null where id = s.id;
  else
    update public.suppliers
       set pending_changes = chg, pending_changes_at = now(), profile_change_note = null
     where id = s.id;
  end if;
end $$;

create or replace function public.list_pending_profile_changes()
returns table (id uuid, business_name text, contact_name text, phone text, email text,
               pending_changes jsonb, pending_changes_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return query
    select s.id, s.business_name::text, s.contact_name::text, s.phone::text, s.email::text,
           s.pending_changes, s.pending_changes_at
      from public.suppliers s
     where s.pending_changes is not null
     order by s.pending_changes_at;
end $$;

create or replace function public.approve_profile_change(target_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare s public.suppliers;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  select * into s from public.suppliers where id = target_id and pending_changes is not null;
  if not found then raise exception 'no pending change for this supplier'; end if;
  update public.suppliers set
    business_name = coalesce(s.pending_changes ->> 'business_name', business_name),
    contact_name  = coalesce(s.pending_changes ->> 'contact_name', contact_name),
    phone         = coalesce(s.pending_changes ->> 'phone', phone),
    email         = coalesce(s.pending_changes ->> 'email', email),
    pending_changes = null, pending_changes_at = null, profile_change_note = null
  where id = target_id;
end $$;

create or replace function public.reject_profile_change(target_id uuid, reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if btrim(coalesce(reason, '')) = '' then raise exception 'a reason is required'; end if;
  update public.suppliers
     set pending_changes = null, pending_changes_at = null,
         profile_change_note = left(btrim(reason), 200)
   where id = target_id and pending_changes is not null;
  if not found then raise exception 'no pending change for this supplier'; end if;
end $$;

revoke execute on function public.request_profile_change(text, text, text, text) from public, anon;
grant execute on function public.request_profile_change(text, text, text, text) to authenticated;
revoke execute on function public.list_pending_profile_changes() from public, anon;
grant execute on function public.list_pending_profile_changes() to authenticated;
revoke execute on function public.approve_profile_change(uuid) from public, anon;
grant execute on function public.approve_profile_change(uuid) to authenticated;
revoke execute on function public.reject_profile_change(uuid, text) from public, anon;
grant execute on function public.reject_profile_change(uuid, text) to authenticated;
