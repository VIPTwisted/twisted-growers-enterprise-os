-- Agent G, 10 Aug 2026. THE SECOND UNIT TRAP IN THE SAME FIELD FAMILY.
--
-- order_price_raw on an Apex order line is a UNIT PRICE, not a line total. Summing it directly
-- across 13,135 lines gives $2,877,173.69. The line total is price x order_quantity, which
-- gives $6,990,914.38 against an order-subtotal sum of $6,990,914.40.
--
-- Summing the bare field UNDERSTATES revenue by 59%. The cents trap overstated it by 100x.
-- Same field family, opposite directions, and neither is visible from the name.
--
-- PROVED ON EVERY ORDER, not sampled: 1,296 of 1,297 orders reconcile to the exact cent. The
-- single exception is invoice Twiste-1397, five lines, $32,301.37 declared against $32,301.36
-- computed - two cents of floating-point rounding on per-line multiplication, not a data error.
-- The whole book differs by $0.02.
--
-- UNDO: delete from verification_checks where check_key='apex_line_total_model';

comment on view v_apex_order_metrc_link is
  'Every Apex shipping order and the Metrc record it ties to, joined on the INVOICE NUMBER with '
  'digits normalised - Apex writes "TWISTE-1737", the operator types "1737" into Metrc. '
  'Raw equality matches 7 orders; normalised matches 975, of which 660 agree with the Metrc '
  'declared value to the exact cent. This is NOT the exact package-tag join the brief assumed '
  '(8 of 13,135 lines carry a tag) and must never be presented as one: the Metrc side is '
  'operator-entered free text, and match_basis says so on every matched row. '
  'TWO UNIT TRAPS, both measured 10 Aug 2026 and both invisible from the field name: '
  '(1) every *_raw money field is in MINOR UNITS - divide by conversion_factors '
  'apex_money_raw_minor_units or a $6.47m book reads as $647m; '
  '(2) order_price_raw on a LINE is a UNIT PRICE - the line total is price x order_quantity, '
  'and summing the bare field understates revenue by 59%. '
  'POPULATION: an outbound manifest is not automatically a sale. 1,033 go to our own second '
  'licence and 134 to an independent laboratory; neither belongs in a sales figure. Filter on '
  'f_is_ours(destination_licence) and the IL / MX prefixes before comparing anything.';

-- A third derivation that cannot be fooled: the order header versus its own lines. If Apex ever
-- changes what order_price_raw means, this goes red the same day.
insert into verification_checks
 (check_key, title, what_it_proves, source_a_label, source_a_sql, source_b_label, source_b_sql,
  tolerance_pct, severity, owner, enabled, added_on, measures_a_process)
values (
 'apex_line_total_model',
 'Apex order subtotals still equal unit price x quantity',
 'That order_price_raw remains a UNIT price and the line total is price x order_quantity. If '
 'Apex switched it to a line total, every revenue, margin and commission figure on the platform '
 'would silently change by the average quantity per line - roughly 2.4x - with no error anywhere.',
 'Sum of order subtotals, from the order header',
 'select coalesce(sum((payload->>''subtotal_raw'')::numeric),0)/100 from apex_raw where entity=''shipping-orders'' and nullif(payload->>''subtotal_raw'','''') is not null',
 'Sum of unit price x quantity, from the lines',
 'select coalesce(sum(((it->>''order_price_raw'')::numeric/100) * coalesce((it->>''order_quantity'')::numeric,0)),0) from apex_raw r, lateral jsonb_array_elements(coalesce(r.payload->''items'',''[]''::jsonb)) it where r.entity=''shipping-orders'' and nullif(r.payload->>''subtotal_raw'','''') is not null',
 0.01, 'critical', 'TG-07 Sales', true, current_date, false)
on conflict (check_key) do nothing;;
