-- Rule K2: no check ships without BOTH halves of its fixture. Positive -- it
-- strips a real product form. Negative -- it leaves a legitimate strain alone.
-- All six defects of 9 Aug would have been caught by the negative half alone.
create or replace function public.tg_selftest_strain_stripper()
returns table(half text, case_in text, expected text, got text, passed boolean)
language plpgsql
stable
set search_path to 'public','pg_temp'
as $$
declare r record;
begin
  ------------------------------------------------------------------- positive
  for r in
    select * from (values
      ('TG Banana Mango seeds',                    'TG Banana Mango'),
      ('Spritzer Crude',                           'Spritzer'),
      ('Apple Fritter Live Bubble Hash',           'Apple Fritter'),
      ('Purple Taxi Live Badder Pre-Fill',         'Purple Taxi'),
      ('TG Chimera Fresh Frozen',                  'TG Chimera'),
      ('Blue Dream Live',                          'Blue Dream'),
      ('Kerosene Berry Terpenes',                  'Kerosene Berry'),
      ('Fatso High Terpene Extract',               'Fatso'),
      ('Gelly Muffin Crude Bulk Oil',              'Gelly Muffin'),
      ('Bananaconda-trim',                         'Bananaconda'),
      ('Lemon Drop Live Badder PreFill',           'Lemon Drop'),
      ('Marshmallow OG Live Crude',                'Marshmallow OG'),
      ('Alien Cherry Mint Live Hash Rosin Pre-Fill','Alien Cherry Mint')
    ) v(a,b)
  loop
    half := 'positive - must strip'; case_in := r.a; expected := r.b;
    got := f_strip_product_form(r.a); passed := (got is not distinct from r.b);
    return next;
  end loop;

  ------------------------------------------------- negative, hand-picked cases
  -- "Bubble Gum" is the one that matters: it contains a form word and must
  -- survive a stripper that removes "Bubble Hash".
  for r in
    select * from (values
      ('Bubble Gum'), ('Mango'), ('Italian Ice'), ('Red Velvet'), ('Crostata'),
      ('King Louis XIII'), ('Super Boof'), ('TG Gush Mintz'), ('Sour Strawberry'),
      ('Cookies and Cream'), ('Strawberry Muffin'), ('Espresso'), ('Grape Ape')
    ) v(a)
  loop
    half := 'negative - must NOT change'; case_in := r.a; expected := r.a;
    got := f_strip_product_form(r.a); passed := (got is not distinct from r.a);
    return next;
  end loop;

  --------------------------------------- negative, derived from the live register
  -- The strongest half, because it is not a list somebody imagined: NO name in
  -- the Metrc strain register may be altered. If a form word ever collides with
  -- a real strain, this fires without anyone having thought of that strain.
  for r in
    select s.name from metrc_strains s
    where f_strip_product_form(s.name) is distinct from btrim(s.name)
    limit 25
  loop
    half := 'negative - registered strain must survive'; case_in := r.name;
    expected := btrim(r.name); got := f_strip_product_form(r.name);
    passed := false; return next;
  end loop;

  if not found then null; end if;
  -- an all-clear row, so "no output" can never be mistaken for "all passed"
  -- (rule K1 question 5: silence must be distinguishable from success)
  half := 'negative - registered strain must survive';
  case_in := format('all %s registered strain names', (select count(*) from metrc_strains));
  expected := 'unchanged by the stripper';
  got := format('%s altered',
          (select count(*) from metrc_strains s
            where f_strip_product_form(s.name) is distinct from btrim(s.name)));
  passed := not exists (select 1 from metrc_strains s
            where f_strip_product_form(s.name) is distinct from btrim(s.name));
  return next;
end;
$$;

comment on function public.tg_selftest_strain_stripper() is
  'Fixture for f_strip_product_form -- both halves (rule K2). The third block is '
  'derived from metrc_strains rather than typed, so a form word that collides '
  'with a real registered strain fires without anyone having anticipated it.';
;
