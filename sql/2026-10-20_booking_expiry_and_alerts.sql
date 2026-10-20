-- 2026-10-20 Unanswered booking requests: reminder + auto-expiry, cap on open requests, and admin alert emails.
-- Run in the Supabase SQL editor for project dokgjfraatfzdnzqftvy. Safe to run before or after the app deploy
-- (this change needs no app change).
--
--  1. Pending requests: supplier gets one reminder after 12 hours; after 48 hours (or once the start date has
--     passed) the request expires. It is stored as status 'declined' with expired_at set, so the dates free up,
--     and both sides get an "expired" email instead of the "declined" one. Runs hourly (pg_cron).
--  2. A renter can have at most 3 open (pending) requests at once.
--  3. Admin alert emails to the address in admin_alert_email(): new supplier application, supplier profile
--     change waiting, new dispute, new licence review. Uses the existing send_email(), which never blocks the action.
-- Existing emails (request, accepted, declined, cancelled, deposit refunded, invoice issued) are unchanged,
-- except the 'declined' email is replaced by the 'expired' one when a request expires.

alter table public.rental_bookings
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists expired_at timestamptz;

-- Nobody but the database itself may set the two new columns.
create or replace function public.guard_booking_system_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.reminder_sent_at := null; new.expired_at := null;
    elsif new.reminder_sent_at is distinct from old.reminder_sent_at or new.expired_at is distinct from old.expired_at then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists rental_bookings_system_fields on public.rental_bookings;
create trigger rental_bookings_system_fields before insert or update on public.rental_bookings
  for each row execute function public.guard_booking_system_fields();

-- At most 3 open requests per renter.
create or replace function public.limit_open_requests() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() and new.status = 'pending'
     and (select count(*) from public.rental_bookings b where b.customer_id = new.customer_id and b.status = 'pending') >= 3 then
    raise exception 'You already have 3 open requests. Wait for a reply or cancel one first.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists rental_bookings_limit_open on public.rental_bookings;
create trigger rental_bookings_limit_open before insert on public.rental_bookings
  for each row execute function public.limit_open_requests();

-- Existing notify function, with an 'expired' email in place of 'declined' when a request expires.
create or replace function public.notify_booking_change()
returns trigger language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare
  customer_email text;
  customer_name text;
  supplier_email text;
  supplier_name text;
  vehicle_name text;
  ref text := public.html_escape(NEW.reference);
begin
  select u.email, public.html_escape(coalesce(nullif(btrim(p.full_name), ''), 'a customer')) into customer_email, customer_name
  from auth.users u left join profiles p on p.id = u.id
  where u.id = NEW.customer_id;

  select s.email, public.html_escape(coalesce(nullif(btrim(s.business_name), ''), 'your supplier')) into supplier_email, supplier_name
  from suppliers s where s.id = NEW.supplier_id;

  select public.html_escape(coalesce(nullif(btrim(name), ''), 'vehicle')) into vehicle_name from rental_vehicles where id = NEW.vehicle_id;
  vehicle_name := coalesce(vehicle_name, 'vehicle');

  if TG_OP = 'INSERT' then
    perform send_email(
      supplier_email,
      'New booking request: ' || vehicle_name,
      '<p>Hi ' || supplier_name || ',</p><p><strong>' || customer_name || '</strong> requested to book your <strong>' ||
      vehicle_name || '</strong> from ' || NEW.date_from || ' to ' || NEW.date_to ||
      '.</p><p>Reference: ' || ref || '</p><p>Log in to Terima Rides to accept or decline.</p>'
    );
    perform send_email(
      customer_email,
      'Booking request sent — ' || vehicle_name,
      '<p>Hi ' || customer_name || ',</p><p>Your request to book the <strong>' || vehicle_name ||
      '</strong> from ' || NEW.date_from || ' to ' || NEW.date_to || ' has been sent to ' || supplier_name ||
      '.</p><p>Reference: ' || ref || '</p><p>We''ll email you as soon as they respond.</p>'
    );
    return NEW;
  end if;

  if TG_OP = 'UPDATE' and NEW.status is distinct from OLD.status then
    if NEW.status = 'accepted' then
      perform send_email(
        customer_email,
        'Your booking was accepted!',
        '<p>Hi ' || customer_name || ',</p><p><strong>' || supplier_name || '</strong> accepted your booking for the ' ||
        vehicle_name || ' (ref ' || ref || '). They''ll be in touch to arrange pickup — or reach out yourself via the contact buttons in the app.</p>'
      );
    elsif NEW.status = 'declined' and NEW.expired_at is not null and OLD.expired_at is null then
      perform send_email(
        customer_email,
        'Your booking request expired',
        '<p>Hi ' || customer_name || ',</p><p>' || supplier_name || ' did not reply in time to your request for the ' ||
        vehicle_name || ' (ref ' || ref || '), so it has expired and the dates are free again. Feel free to request another vehicle or other dates on Terima Rides.</p>'
      );
      perform send_email(
        supplier_email,
        'Booking request expired — ' || vehicle_name,
        '<p>Hi ' || supplier_name || ',</p><p>The request from ' || customer_name || ' for the ' || vehicle_name ||
        ' (ref ' || ref || ', ' || NEW.date_from || ' to ' || NEW.date_to || ') expired because it was not answered in time. Please reply to requests quickly so you don''t lose bookings.</p>'
      );
    elsif NEW.status = 'declined' then
      perform send_email(
        customer_email,
        'Your booking request was declined',
        '<p>Hi ' || customer_name || ',</p><p>Unfortunately ' || supplier_name || ' was unable to accept your request for the ' ||
        vehicle_name || ' (ref ' || ref || '). Feel free to browse other vehicles on Terima Rides.</p>'
      );
    elsif NEW.status = 'cancelled' then
      if NEW.cancelled_by = 'customer' then
        perform send_email(
          supplier_email,
          'Booking cancelled by customer — ' || vehicle_name,
          '<p>Hi ' || supplier_name || ',</p><p>' || customer_name || ' cancelled their booking for the ' ||
          vehicle_name || ' (ref ' || ref || '), originally ' || NEW.date_from || ' to ' || NEW.date_to || '.</p>'
        );
      elsif NEW.cancelled_by = 'supplier' then
        perform send_email(
          customer_email,
          'Your booking was cancelled',
          '<p>Hi ' || customer_name || ',</p><p>' || supplier_name || ' cancelled your booking for the ' ||
          vehicle_name || ' (ref ' || ref || '), originally ' || NEW.date_from || ' to ' || NEW.date_to || '. Sorry for the inconvenience — feel free to browse other vehicles on Terima Rides.</p>'
        );
      end if;
    end if;
  end if;

  if TG_OP = 'UPDATE' and NEW.deposit_refunded_at is not null and OLD.deposit_refunded_at is null then
    perform send_email(
      customer_email,
      'Your deposit has been refunded',
      '<p>Hi ' || customer_name || ',</p><p>' || supplier_name || ' has marked your deposit for the ' ||
      vehicle_name || ' (ref ' || ref || ') as refunded.</p>'
    );
  end if;

  return NEW;
end;
$function$;

-- Hourly job: remind, then expire.
create or replace function public.process_pending_bookings() returns table (reminded int, expired int)
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record; n_rem int := 0; n_exp int := 0;
  s_email text; s_name text; v_name text;
begin
  -- 1. Reminder to the supplier, 12 hours after the request.
  for r in
    select b.* from public.rental_bookings b
     where b.status = 'pending' and b.reminder_sent_at is null
       and b.created_at < now() - interval '12 hours' and b.created_at >= now() - interval '48 hours'
       and b.date_from >= current_date
     for update skip locked
  loop
    select s.email, public.html_escape(coalesce(nullif(btrim(s.business_name), ''), 'there')) into s_email, s_name
      from public.suppliers s where s.id = r.supplier_id;
    select public.html_escape(coalesce(nullif(btrim(name), ''), 'vehicle')) into v_name from public.rental_vehicles where id = r.vehicle_id;
    perform public.send_email(
      s_email,
      'Reminder: booking request waiting — ' || coalesce(v_name, 'vehicle'),
      '<p>Hi ' || coalesce(s_name, 'there') || ',</p><p>A request for your ' || coalesce(v_name, 'vehicle') || ' from ' ||
      r.date_from || ' to ' || r.date_to || ' (ref ' || public.html_escape(r.reference) ||
      ') is still waiting for your answer. It will expire automatically if not answered within 48 hours of the request.</p><p>Log in to Terima Rides to accept or decline.</p>');
    update public.rental_bookings set reminder_sent_at = now() where id = r.id;
    n_rem := n_rem + 1;
  end loop;

  -- 2. Expire requests unanswered after 48 hours, or whose start date has passed.
  for r in
    select b.id from public.rental_bookings b
     where b.status = 'pending' and (b.created_at < now() - interval '48 hours' or b.date_from < current_date)
     for update skip locked
  loop
    update public.rental_bookings set status = 'declined', expired_at = now() where id = r.id and status = 'pending';
    n_exp := n_exp + 1;
  end loop;

  return query select n_rem, n_exp;
end $$;
revoke execute on function public.process_pending_bookings() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'process-pending-bookings';
    perform cron.schedule('process-pending-bookings', '7 * * * *', 'select public.process_pending_bookings();');
  else
    raise notice 'pg_cron is not enabled: schedule select public.process_pending_bookings(); hourly by hand';
  end if;
end $$;

-- Admin alert emails. Change the address here if needed.
create or replace function public.admin_alert_email() returns text language sql immutable as $$ select 'natsongkiri2@gmail.com'::text $$;

create or replace function public.notify_admin_event() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare subj text; body text; who text;
begin
  begin
    if tg_table_name = 'suppliers' then
      who := public.html_escape(coalesce(nullif(btrim(new.business_name), ''), 'a supplier'));
      if tg_op = 'INSERT' then
        subj := 'New supplier application: ' || who; body := '<p>' || who || ' has applied to join Terima Rides.</p>';
      elsif new.pending_changes is not null and new.pending_changes is distinct from old.pending_changes then
        subj := 'Supplier profile change waiting: ' || who; body := '<p>' || who || ' asked to change their profile details.</p>';
      else return null; end if;
    elsif tg_table_name = 'disputes' then
      subj := 'New dispute opened'; body := '<p>A customer opened a dispute on a booking.</p>';
    elsif tg_table_name = 'licence_reviews' then
      subj := 'Licence photo waiting for manual review'; body := '<p>A renter sent a licence photo for manual review.</p>';
    else return null; end if;
    perform public.send_email(public.admin_alert_email(), 'Terima Rides admin: ' || subj,
      body || '<p>Open Admin on terimarides.com to review it.</p>');
  exception when others then
    raise warning 'admin alert failed: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.notify_admin_event() from public, anon, authenticated;

do $$
declare spec record;
begin
  for spec in select * from (values
    ('suppliers', 'insert or update'), ('disputes', 'insert'), ('licence_reviews', 'insert')) as v(tbl, ev)
  loop
    if to_regclass('public.' || spec.tbl) is not null then
      execute format('drop trigger if exists admin_alert_%1$s on public.%1$I', spec.tbl);
      execute format('create trigger admin_alert_%1$s after %2$s on public.%1$I for each row execute function public.notify_admin_event()', spec.tbl, spec.ev);
    end if;
  end loop;
end $$;
