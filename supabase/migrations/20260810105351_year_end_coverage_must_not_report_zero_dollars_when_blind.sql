-- FOUND BY tg_all_clear_falsifier() ON ITS FIRST RUN, and it is the highest-consequence of the
-- four it flagged: this view feeds a TAX FILING.
--
-- As the owner it reads honestly: 785 rows, 719 without a quantity, $59,660 establishable, and a
-- headline that says NOT FILEABLE AS IT STANDS. Read by a signed-in user who cannot see the
-- packages behind it, every number collapses:
--
--   rows_total 785 -> 0      "0 of 0 rows carry no quantity"      $59,660 -> $0
--
-- The warning survives, because the author hardcoded it rather than deriving it — good instinct,
-- and it is why this is not a full all-clear. But "0 of 0" is a fabricated denominator and "$0" is
-- a fabricated closing inventory on a figure destined for a return. Rule A1 says never invent a
-- number; rule A3 says absence is explained, never blank. A zero presented as a measurement is
-- both at once, and it is the more dangerous half: a warning can be read past, a number gets typed
-- into a form.
--
-- Fix: an explicit zero-case that says the reader is blind, and NULL rather than 0 for the money.
-- Nothing may present an unmeasured figure as $0.
create or replace view public.v_year_end_2025_coverage as
with snapshot as (
  select * from tg_inventory_as_of('2025-12-31'::date)
)
select count(*)                                                                  as rows_total,
       count(*) filter (where coalesce(quantity_estimate, 0) > 0)                 as rows_with_a_quantity,
       count(*) filter (where coalesce(quantity_estimate, 0) = 0)                 as rows_with_no_quantity,
       count(*) filter (where value_at_cost is null)                              as rows_with_no_value,
       count(*) filter (where category = 'Uncategorised')                         as rows_with_no_category,
       /* NULL, never 0, when nothing is visible. An unmeasured figure must not wear the costume
          of a measured one — least of all a closing-inventory figure. */
       case when count(*) = 0 then null
            else round(coalesce(sum(value_at_cost), 0)) end                       as value_that_could_be_established,
       case when count(*) = 0 then
         'NO ROWS ARE VISIBLE TO YOU, so there is no figure here to read. This is NOT a closing '
         || 'inventory of zero and it is NOT an all-clear. Either the point-in-time rebuild '
         || 'returned nothing, or your account is not cleared to read the packages behind it. Do '
         || 'not report $0 anywhere. For a filed return, export the Inventory Point-in-Time report '
         || 'from the Metrc Reports Control Panel for 31 December 2025 and import it on the Report '
         || 'Import page. That is the authoritative figure and nothing here replaces it.'
       else
         'NOT FILEABLE AS IT STANDS. '
         || count(*) filter (where coalesce(quantity_estimate, 0) = 0) || ' of ' || count(*)
         || ' rows carry no quantity and '
         || count(*) filter (where category = 'Uncategorised')
         || ' carry no category, because Metrc''s interface exposes no historical snapshot — this '
         || 'is rebuilt from the quantity each package was created with, which for most packages '
         || 'as at 31 December 2025 is unknown. The $' || round(coalesce(sum(value_at_cost), 0))
         || ' shown is only the fraction that could be established, not the closing inventory. '
         || 'For a filed return, export the Inventory Point-in-Time report from the Metrc Reports '
         || 'Control Panel for 31 December 2025 and import it on the Report Import page. That is '
         || 'the authoritative figure and nothing here replaces it.'
       end                                                                        as what_this_means
  from snapshot;;
