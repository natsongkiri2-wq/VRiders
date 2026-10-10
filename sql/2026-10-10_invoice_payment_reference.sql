-- Item 9: payment reference / note when an admin marks an invoice paid.
-- Run in the Supabase SQL editor for project dokgjfraatfzdnzqftvy (the one the app uses).
-- Safe to run before OR after deploying the new App.jsx: the app falls back
-- gracefully until this exists.

alter table public.invoices
  add column if not exists payment_reference text
  check (payment_reference is null or char_length(payment_reference) <= 200);

create or replace function public.set_invoice_payment_reference(target_id uuid, reference text)
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
     set payment_reference = nullif(left(btrim(reference), 200), '')
   where id = target_id
     and status = 'paid';
end;
$$;

-- Same grant pattern as the other admin RPCs: signed-in users may call it
-- (is_admin() inside is the real gate); anonymous callers may not.
revoke execute on function public.set_invoice_payment_reference(uuid, text) from public, anon;
grant execute on function public.set_invoice_payment_reference(uuid, text) to authenticated;
