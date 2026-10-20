-- 2026-10-20 Completion order: a supplier can only mark a booking completed once the rental period has ended
-- or the renter has recorded the return. Run in the Supabase SQL editor for project dokgjfraatfzdnzqftvy.
-- No app change needed. (Replaces guard_booking_lifecycle from 2026-10-20_commission_gap_guard.sql; the
-- cancel lock and the "not before the start date" rule are kept. The daily auto-complete job is unaffected.)

create or replace function public.guard_booking_lifecycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin()
     and new.status is distinct from old.status then
    if old.status = 'accepted' and new.status = 'cancelled' and old.date_from < public.vanuatu_today() then
      raise exception 'This booking has already started and can no longer be cancelled here. Contact Terima Rides to cancel it.' using errcode = '42501';
    end if;
    if new.status = 'completed' then
      if old.date_from > public.vanuatu_today() then
        raise exception 'A booking cannot be completed before its start date.' using errcode = '42501';
      end if;
      if old.return_completed_at is null and old.date_to > public.vanuatu_today() then
        raise exception 'This rental has not ended and no return has been recorded yet.' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
