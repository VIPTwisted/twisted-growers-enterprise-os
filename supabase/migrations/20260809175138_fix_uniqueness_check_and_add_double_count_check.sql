-- SELF-CORRECTION, same hour. I set packages-unique-on-tag to tolerance 0 on the reasoning
-- that "uniqueness is not a percentage". That was right about percentages and WRONG about the
-- invariant, and it would have made the check PERMANENTLY RED on legitimate data - the exact
-- "a check that cannot pass" failure I had just demoted room-name-alone-is-not-a-room for.
--
-- WHAT THE SEVEN ROWS ACTUALLY ARE. Each is one tag held under BOTH licences:
--   1A40A030000E5B1000005719  MC281714  84 g  Finish Vault  no inbound manifest   mod 4 Aug
--   1A40A030000E5B1000005719  MP281909  84 g  Finish Vault  manifest 0003363448   mod 5 Aug
-- The package moved from cultivation to manufacturing. Our mirror syncs each licence
-- separately, so it correctly holds a row per licence. The tag is unique IN METRC; it is not
-- unique in a two-licence mirror, and it never will be.
--
-- So the real uniqueness invariant is (licence, tag), and THAT must hold exactly.
update verification_checks
set source_a_label = 'Rows in the package mirror',
    source_a_sql   = 'select count(*)::numeric from metrc_packages',
    source_b_label = 'Distinct (licence, tag) pairs',
    source_b_sql   = 'select count(*)::numeric from (select distinct license, tag from metrc_packages) x',
    tolerance_pct  = 0,
    severity       = 'critical',
    title          = 'One row per package per licence, exactly',
    what_it_proves = 'The mirror stores one row per licence per tag, because each licence is synced '
      'separately and a package transferred between our two licences legitimately appears under '
      'both. THAT is expected. What must never happen is two rows for the same (licence, tag) - '
      'that is a genuine duplicate and any join through it double-counts weight, money or test '
      'state. Tolerance 0: this is an identity invariant, not a measurement.'
where check_key = 'packages-unique-on-tag';

-- AND THE REAL RISK GETS ITS OWN CHECK, because the one above no longer covers it.
-- A package held under BOTH licences at once is counted twice in every held-inventory figure.
-- Measured 9 Aug 2026: 862 held rows are 855 physical packages - 7 counted twice, 1.296 lb.
-- Small today. The MECHANISM is not small: the sending licence is never marked as departed,
-- so the same failure on a 500 lb allocation double-counts 500 lb. This is precisely the
-- cultivation-to-909 hand-off the owner asked to be able to audit forensically.
insert into verification_checks
  (check_key, title, what_it_proves, source_a_label, source_a_sql, source_b_label, source_b_sql,
   tolerance_pct, severity, owner, enabled, added_on)
values
  ('held-package-counted-once',
   'A package we hold is counted once, not once per licence',
   'When a package moves from cultivation to manufacturing, Metrc shows it under the receiving '
   'licence. Our mirror keeps the sending licence''s row too, and if that row still reads '
   'IsFinished=false with a quantity, the package is counted TWICE in every held-inventory '
   'figure. Measured 9 Aug 2026: 862 held rows represent 855 physical packages - 7 double-counted, '
   '1.296 lb. The weight is trivial; the mechanism is not, because the same failure on a large '
   'allocation double-counts a large weight. Disagreement names exactly how many packages are '
   'being counted twice.',
   'Held package rows',
   'select count(*)::numeric from metrc_packages where coalesce((raw->>''Quantity'')::numeric,0) > 0 and coalesce((raw->>''IsFinished'')::boolean,false) = false',
   'Distinct physical packages held',
   'select count(distinct tag)::numeric from metrc_packages where coalesce((raw->>''Quantity'')::numeric,0) > 0 and coalesce((raw->>''IsFinished'')::boolean,false) = false',
   0, 'elevated', 'Vincent', true, current_date)
on conflict (check_key) do update set
  title = excluded.title, what_it_proves = excluded.what_it_proves,
  source_a_label = excluded.source_a_label, source_a_sql = excluded.source_a_sql,
  source_b_label = excluded.source_b_label, source_b_sql = excluded.source_b_sql,
  tolerance_pct = excluded.tolerance_pct, severity = excluded.severity, enabled = true;;
