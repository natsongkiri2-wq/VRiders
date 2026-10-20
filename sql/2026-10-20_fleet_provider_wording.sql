-- Rename "supplier" to "fleet provider" in the wording users and admins see
-- from the database: error messages and alert emails.
--
-- This rewrites the text inside the live functions in place, so it always
-- patches the current version of each function. Only the quoted phrases below
-- are touched. Table, column and role names (suppliers, supplier_id, 'supplier')
-- are NOT changed. Safe to run more than once: once a phrase has been replaced
-- it no longer matches.

do $$
declare
  r record;
  def text;
  new_def text;
  pair text[];
  pairs text[][] := array[
    ['Your supplier account must be verified',         'Your fleet provider account must be verified'],
    ['This supplier is not verified',                  'This fleet provider is not verified'],
    ['Only the supplier can record',                   'Only the fleet provider can record'],
    ['Cancellations by the supplier must',             'Cancellations by the fleet provider must'],
    ['blocked on the supplier''''s calendar',          'blocked on the fleet provider''''s calendar'],
    ['''your supplier''',                              '''your fleet provider'''],
    ['''a supplier''',                                 '''a fleet provider'''],
    ['New supplier application: ',                     'New fleet provider application: '],
    ['Supplier profile change waiting: ',              'Fleet provider profile change waiting: '],
    ['no supplier profile',                            'no fleet provider profile'],
    ['only verified suppliers can request',            'only verified fleet providers can request'],
    ['no pending change for this supplier',            'no pending change for this fleet provider']
  ];
  patched int := 0;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
  loop
    def := pg_get_functiondef(r.oid);
    new_def := def;
    foreach pair slice 1 in array pairs loop
      new_def := replace(new_def, pair[1], pair[2]);
    end loop;
    if new_def <> def then
      execute new_def;
      patched := patched + 1;
      raise notice 'Updated wording in function: %', r.proname;
    end if;
  end loop;
  raise notice 'Done. % function(s) updated.', patched;
end $$;
