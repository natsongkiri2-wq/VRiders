-- 2026-10-19 (2) Waiving now needs a reason; admins can undo a "paid" mark.
-- Run in the Supabase SQL editor for project dokgjfraatfzdnzqftvy, AFTER
-- 2026-10-19_invoice_waive.sql. Safe to run before or after deploying the new App.jsx.
--
--   * waive_invoice(target_id, reason): now raises an error if the reason is empty.
--   * unmark_invoice_paid(target_id): admin only, paid -> due; clears paid_at and the
--     payment reference. (The daily "mark-overdue-invoices" job re-marks it overdue if
--     the due date has passed.)

create or replace function public.waive_invoice(target_id uuid, reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if nullif(btrim(reason), '') is null then
    raise exception 'a reason is required to waive an invoice';
  end if;
  update public.invoices
     set status = 'waived',
         waived_at = now(),
         waive_reason = left(btrim(reason), 200)
   where id = target_id
     and status::text not in ('paid', 'waived');
  if not found then
    raise exception 'invoice not found, or already paid or waived';
  end if;
end;
$$;

create or replace function public.unmark_invoice_paid(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.invoices
     set status = 'due',
         paid_at = null,
         payment_reference = null
   where id = target_id
     and status::text = 'paid';
  if not found then
    raise exception 'invoice not found, or not paid';
  end if;
end;
$$;

-- create or replace keeps the grants on waive_invoice; set them for the new function.
revoke execute on function public.unmark_invoice_paid(uuid) from public, anon;
grant execute on function public.unmark_invoice_paid(uuid) to authenticated;
