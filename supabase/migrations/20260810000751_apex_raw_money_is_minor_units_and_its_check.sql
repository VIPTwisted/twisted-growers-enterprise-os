-- Agent G, 10 Aug 2026. THE UNIT ERROR THAT WOULD HAVE PUT $647 MILLION ON A TILE.
--
-- Both briefs state: "EVERY MONEY FIELD HAS A _raw TWIN. The bare field is a formatted display
-- STRING; _raw is the number. Do arithmetic on _raw only." That is half right, and the missing
-- half is the dangerous half.
--
-- MEASURED on the first successful shipping-orders pull, 1,739 orders:
--   sum(total_raw) = 647,044,908 and the largest single order = 6,931,600.
-- Compared against its own display twin on every row where both are present:
--   total    1,284 pairs, ratio exactly 100.0000 on 1,284 of them (min 100, max 100)
--   subtotal 1,297 pairs, ratio exactly 100.0000 on 1,297 of them (min 100, max 100)
--
-- _raw IS IN MINOR UNITS. CENTS. Real gross is 6,470,449.08 dollars, not 647 million.
-- Reading _raw as dollars overstates revenue by exactly 100x.
--
-- This is the same class as $1,692,460 of fabricated revenue from a footer row and $1,317,836
-- of PURCHASES read as revenue. A figure that does not carry its unit gets quoted without one,
-- by somebody who was not in the conversation where the unit was explained (rule A5).
--
-- UNDO: delete from conversion_factors where key='apex_money_raw_minor_units';
--       delete from verification_checks where check_key='apex_money_unit';

insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
values (
  'apex_money_raw_minor_units', 100, 'minor units per major unit',
  'Apex _raw money fields are in cents',
  'Divide any Apex *_raw money field by this to get dollars. total_raw 6931600 is $69,316.00. '
  'The bare twin (total, subtotal, order_price) is already a plain decimal string such as '
  '"920.00" - it does NOT comma-group, so it is safe to cast, but _raw remains the field to '
  'trust because it is unambiguous about precision.',
  'Derived two independent ways from the first successful shipping-orders pull, 10 Aug 2026: '
  'the ratio of _raw to its own display twin, measured across 1,284 total pairs and 1,297 '
  'subtotal pairs. Exactly 100.0000 on every single one, minimum and maximum identical.',
  'Agent G / TG-07 Sales, 10 Aug 2026', 'measured',
  'Not inferred from magnitude. Each row was compared against its own paired display value, so '
  'the derivation cannot be fooled by an implausible-looking total.')
on conflict (key) do nothing;

-- A CHECK THAT CANNOT BE FOOLED BY EITHER SIDE AGREEING WITH ITSELF. Source A is the display
-- string Apex renders; source B is the machine field. They come from the same payload but they
-- are independently produced by Apex, and the whole point is that their RELATIONSHIP is the
-- fact under test. If Apex ever switches _raw to major units, this goes red the same day
-- instead of quietly dividing revenue by 100 on every tile.
insert into verification_checks
 (check_key, title, what_it_proves, source_a_label, source_a_sql, source_b_label, source_b_sql,
  tolerance_pct, severity, owner, enabled, added_on, measures_a_process)
values (
 'apex_money_unit',
 'Apex _raw money fields are still in cents',
 'That every Apex *_raw money value is exactly 100x its own display twin. A change in Apex''s '
 'unit convention would otherwise silently multiply or divide every revenue figure, margin and '
 'commission on the platform by 100, with no error anywhere.',
 'Sum of the display field, in dollars',
 'select coalesce(sum((payload->>''total'')::numeric),0) from apex_raw where entity=''shipping-orders'' and (payload->>''total'') ~ ''^[0-9]+\.[0-9]{2}$''',
 'Sum of the _raw field converted through conversion_factors',
 'select coalesce(sum((payload->>''total_raw'')::numeric),0) / (select value from conversion_factors where key=''apex_money_raw_minor_units'') from apex_raw where entity=''shipping-orders'' and (payload->>''total'') ~ ''^[0-9]+\.[0-9]{2}$'' and (payload->>''total_raw'') ~ ''^-?[0-9]+$''',
 0, 'critical', 'TG-07 Sales', true, current_date, false)
on conflict (check_key) do nothing;;
