-- 2026-10-20 Close the commission gap: commission is charged only on COMPLETED bookings, but the supplier
-- (or renter) could avoid it by cancelling after the rental happened, or by never completing the booking.
-- Run in the Supabase SQL editor for project dokgjfraatfzdnzqftvy. No app change needed.
--
--  1. Once an accepted booking's start date has passed, it can no longer be cancelled by the renter or the
--     supplier (admin still can, from the SQL editor). Pending requests can always be declined or cancelled.
--     The start day itself still allows cancelling (no-shows are known that day).
--  2. A booking cannot be marked completed before its start date.
--  3. Daily job: 3 days after the end date the supplier gets a reminder to mark the booking completed;
--     7 days after the end date it is completed automatically, so it is invoiced with the next monthly run.
--  "Today" means today in Vanuatu (Pacific/Efate).

alter table public.rental_bookings
  add column if not exists completion_reminder_sent_at timestamptz,
  add column if not exists auto_completed_at timestamptz;

create or replace function public.vanuatu_today() returns date language sql stable as $$
  select (now() at time zone 'Pacific/Efate')::date
$$;

-- Only the database may set the system columns (adds the two new ones to the earlier guard).
create or replace function public.guard_booking_system_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.reminder_sent_at := null; new.expired_at := null;
      new.completion_reminder_sent_at := null; new.auto_completed_at := null;
    elsif new.reminder_sent_at is distinct from old.reminder_sent_at
       or new.expired_at is distinct from old.expired_at
       or new.completion_reminder_sent_at is distinct from old.completion_reminder_sent_at
       or new.auto_completed_at is distinct from old.auto_completed_at then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create or replace function public.guard_booking_lifecycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin()
     and new.status is distinct from old.status then
    if old.status = 'accepted' and new.status = 'cancelled' and old.date_from < public.vanuatu_today() then
      raise exception 'This booking has already started and can no longer be cancelled here. Contact Terima Rides to cancel it.' using errcode = '42501';
    end if;
    if new.status = 'completed' and old.date_from > public.vanuatu_today() then
      raise exception 'A booking cannot be completed before its start date.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists rental_bookings_lifecycle on public.rental_bookings;
create trigger rental_bookings_lifecycle before update on public.rental_bookings
  for each row execute function public.guard_booking_lifecycle();

create or replace function public.process_accepted_bookings() returns table (reminded int, completed int)
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record; n_rem int := 0; n_done int := 0;
  s_email text; s_name text; v_name text; today date := public.vanuatu_today();
begin
  -- 1. Reminder: 3+ days after the end date, still accepted.
  for r in
    select b.* from public.rental_bookings b
     where b.status = 'accepted' and b.completion_reminder_sent_at is null and b.date_to < today - 3 and b.date_to >= today - 7
     for update skip locked
  loop
    select s.email, public.html_escape(coalesce(nullif(btrim(s.business_name), ''), 'there')) into s_email, s_name
      from public.suppliers s where s.id = r.supplier_id;
    select public.html_escape(coalesce(nullif(btrim(name), ''), 'vehicle')) into v_name from public.rental_vehicles where id = r.vehicle_id;
    perform public.send_email(
      s_email,
      'Please complete your booking — ' || coalesce(v_name, 'vehicle'),
      '<p>Hi ' || coalesce(s_name, 'there') || ',</p><p>The rental of your ' || coalesce(v_name, 'vehicle') || ' (ref ' ||
      public.html_escape(r.reference) || ', ' || r.date_from || ' to ' || r.date_to ||
      ') has ended but is not marked completed. Please open Terima Rides and mark it completed (and record the deposit refund). If you do nothing it will be completed automatically 7 days after the end date, and the 8% commission applies to completed bookings.</p>');
    update public.rental_bookings set completion_reminder_sent_at = now() where id = r.id;
    n_rem := n_rem + 1;
  end loop;

  -- 2. Auto-complete: 7+ days after the end date.
  for r in
    select b.* from public.rental_bookings b
     where b.status = 'accepted' and b.date_to < today - 7
     for update skip locked
  loop
    update public.rental_bookings set status = 'completed', auto_completed_at = now() where id = r.id and status = 'accepted';
    select s.email, public.html_escape(coalesce(nullif(btrim(s.business_name), ''), 'there')) into s_email, s_name
      from public.suppliers s where s.id = r.supplier_id;
    select public.html_escape(coalesce(nullif(btrim(name), ''), 'vehicle')) into v_name from public.rental_vehicles where id = r.vehicle_id;
    perform public.send_email(
      s_email,
      'Booking completed automatically — ' || coalesce(v_name, 'vehicle'),
      '<p>Hi ' || coalesce(s_name, 'there') || ',</p><p>The booking for your ' || coalesce(v_name, 'vehicle') || ' (ref ' ||
      public.html_escape(r.reference) || ') ended more than 7 days ago, so it was marked completed automatically. It will be included in your next commission invoice. If something is wrong, contact Terima Rides.</p>');
    n_done := n_done + 1;
  end loop;

  return query select n_rem, n_done;
end $$;
revoke execute on function public.process_accepted_bookings() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'process-accepted-bookings';
    perform cron.schedule('process-accepted-bookings', '30 14 * * *', 'select public.process_accepted_bookings();');   -- 01:30 Vanuatu
  else
    raise notice 'pg_cron is not enabled: schedule select public.process_accepted_bookings(); daily by hand';
  end if;
end $$;
