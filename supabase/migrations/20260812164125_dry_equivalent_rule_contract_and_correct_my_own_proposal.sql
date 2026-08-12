-- Agent I, 12 Aug 2026. DBI-060.
--
-- (a) THE LIMITATION OF MY OWN WATCHER, STATED PLAINLY. tile_drill_contract compares a tile to
--     its own drill. It cannot catch a figure that is CONSISTENTLY WRONG EVERYWHERE, because
--     both sides sum the same wrong pounds and agree perfectly. My contract "Total weight on
--     hand" read AGREE at 2,459.9 = 2,459.9 while the figure was overstated by 325.3 lb. Agent V
--     caught it by deriving from the BUSINESS RULE instead of from the other side of the screen,
--     and noted the same blind spot in one-figure-one-value and label-synonyms-agree, which both
--     read agree at 8=8 because Command and Inventory publish the same wrong number.
--
--     The instrument still works - it just needs the OTHER side to be truth, not a second read of
--     the same source. This contract does that: the drill side applies conversion_factors, whose
--     own what_it_means says dividing fresh frozen by 4.5 "gives the dry-equivalent - the only
--     figure that can honestly be compared against, or added to, dried flower pounds."
--
--     It will read DISAGREE by 325.3 lb until the owner rules. That is correct and intended: a
--     known, owner-visible defect must sit red, not be silenced. NOT FIXING THE FIGURE HERE -
--     the owner decides, and the ratio itself is unconfirmed (4.5 configured vs 4.17 measured).
--
-- (b) CORRECT MY OWN FILED PROPOSAL (K5). Agent V and I disagree on the same nine tags: I filed
--     6.59 lb, V filed 8.41 lb. V is right that my method is unsound. I HALVED the duplicated
--     weight, which on eight tags is harmless but on the ninth invents a quantity that exists
--     nowhere in Metrc. Recording the disagreement rather than picking a side - disagreement is
--     the finding.

insert into tile_drill_contract
 (contract_key, page, tile_label, tile_sql, drill_sql, tolerance, why_tolerance)
values
('cc.stock.dry_equivalent_honours_conversion','Command Center',
 'Total on hand, dry-equivalent — obeys the wet-to-dry rule',
 'select round(sum(pounds),1) from v_stock_on_hand',
 'select round(sum(case when coalesce(nullif(raw#>>''{Item,ProductCategoryName}'','''')  ,'''') '
 '  = ''Fresh Frozen Flower'' '
 '  then (raw->>''Quantity'')::numeric / 453.59237 / 4.5 '
 '  else (raw->>''Quantity'')::numeric / 453.59237 end),1) '
 'from metrc_packages '
 'where not coalesce((raw->>''IsFinished'')::boolean,false) '
 '  and coalesce((raw->>''Quantity'')::numeric,0) > 0 '
 '  and lower(coalesce(raw->>''UnitOfMeasureName'','''')) in (''grams'',''g'')',
 1.0,
 'One pound absorbs float and rounding across 1,047 packages. It does NOT absorb the 325.3 lb '
 'wet-weight defect, which is the point. Expect DISAGREE until the owner rules on the ratio '
 '(4.5 configured, 4.17 measured) and on which surfaces restate.')
on conflict (contract_key) do update set
  tile_sql = excluded.tile_sql, drill_sql = excluded.drill_sql,
  tolerance = excluded.tolerance, why_tolerance = excluded.why_tolerance, registered_at = now();

update correction_proposal
   set pounds_affected = null,
       the_evidence = the_evidence ||
E'\n\n--- CORRECTED BY AGENT I, 12 Aug 2026, after independent review by Agent V (K5) ---\n'
'My filed figure of 6.59 lb came from HALVING the duplicated weight, and that method is unsound. '
'Agent V derived 8.41 lb by keeping the freshest row per tag. We agree on eight of the nine tags. '
'We diverge on one: 1A40A0300010D89000002450, "Blue Gas Can Trim", which Metrc itself reports as '
'1,489 g under MC281714 (last modified 2026-08-11) and 3,142 g under MP281909 (last modified '
'2026-07-28). Halving takes the midpoint 2,315.5 g — a quantity that appears NOWHERE in Metrc and '
'that nobody ever recorded. One physical package cannot hold two quantities, and neither of us can '
'settle which is right from inside this platform. THE WEIGHT FIGURE IS THEREFORE WITHDRAWN AND '
'LEFT NULL rather than restated to either number. The TAG COUNT of exactly 9 is unaffected and '
'still holds. Agent V also measured that 15 cross-licence tags exist and 9 are currently held — '
'not seven; the field_help entry on the Command page still says seven and is now wrong.',
       the_proposal = the_proposal ||
E'\n\nAMENDED: before any collapse, ASK METRC which quantity is correct for '
'1A40A0300010D89000002450. Do not average, do not pick the newer timestamp, and do not let this '
'platform invent a third number. Metrc is the legal record; where it contradicts itself, only '
'Metrc can resolve it.'
 where id = 1;;
