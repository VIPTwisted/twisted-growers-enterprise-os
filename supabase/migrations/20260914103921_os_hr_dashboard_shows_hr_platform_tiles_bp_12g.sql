-- BP-12g · hrp.dashboard_tiles_match: "OS HR dashboard, Control Tower and CEO dashboard show
-- the HR platform's own tiles — same labels, numbers, buttons". The OS reads department tiles
-- as rows (mv_department_dashboard = base ∪ supplement, the ten-minute cycle). The three
-- Human Resources supplement rows (roster count, platform logins, timesheets ever) are
-- replaced by the HR platform's Command Center tiles from hr.command_center_tiles() — the same
-- function the HR Command Center's KPI strip reads — so label, number and drill are one
-- derivation. The drill 'hr_platform:/route' opens that page of the HR platform.
set search_path = public, hr, extensions;

create or replace view public.v_hr_platform_tiles as
  select 'Human Resources'::text as department,
         (60 + (t.ord - 1))::int as ord,
         t.tile->>'label' as kpi,
         nullif(t.tile->>'value', '')::numeric as value,
         case t.tile->>'unit' when 'USD' then '$' when 'people' then '' when 'docs' then '' when 'incidents' then '' when 'requests' then '' when 'actions' then '' when 'badges' then '' else coalesce(t.tile->>'unit', '') end as unit,
         case t.tile->>'tone' when 'danger' then 'bad' when 'warn' then 'watch' when 'success' then 'ok' else 'info' end as tone,
         (t.tile->>'group') || ' · ' || coalesce(t.tile->>'sub', '') || ' · HR platform figure, as of ' || to_char((t.doc->>'as_of')::timestamptz at time zone 'America/New_York', 'HH24:MI') as context,
         'hr_platform:' || (t.tile->>'route') as drill,
         (t.doc->>'as_of')::timestamptz as computed_at
  from (select d as doc, x.tile, x.ord from hr.command_center_tiles(null) d, jsonb_array_elements(d->'tiles') with ordinality x(tile, ord)) t;

create or replace view public.v_dept_dash_supplement as
  select department, ord, kpi, value, unit, tone, context, drill, computed_at from public.v_hr_platform_tiles
  union all
  select 'Sales & Cash'::text, 70, 'Revenue — TWO ANSWERS'::text,
         (select round(abs(r.value_a - r.value_b)) from (select value_a, value_b from verification_runs where check_key = 'revenue-two-reports' order by ran_at desc limit 1) r),
         '$', 'bad',
         (select format('$%s vs $%s. DO NOT QUOTE REVENUE until the two reports reconcile - the gap exceeds planning materiality.', to_char(r.value_a, 'FM9,999,999'), to_char(r.value_b, 'FM9,999,999')) from (select value_a, value_b from verification_runs where check_key = 'revenue-two-reports' order by ran_at desc limit 1) r),
         'verification_runs', now()
  union all
  select 'Sales & Cash', 71, 'Going out today',
         (select count(*)::numeric from metrc_transfers where (coalesce(nullif(raw->>'EstimatedDepartureDateTime',''), nullif(raw->>'CreatedDateTime','')))::date = current_date),
         'manifests', 'info',
         (select 'Pickups and deliveries dated today on the Metrc manifest record. ' || count(*) filter (where coalesce(nullif(raw->>'EstimatedArrivalDateTime',''), '') <> '' and (raw->>'EstimatedArrivalDateTime')::date = current_date) || ' due to ARRIVE today.'
            from metrc_transfers where (coalesce(nullif(raw->>'EstimatedDepartureDateTime',''), nullif(raw->>'CreatedDateTime','')))::date = current_date),
         'transfers_today', now()
  union all
  select 'Sales & Cash', 72, 'Sale lines on the record', (select count(*)::numeric from v_forensic_sold_by_tag), 'lines', 'info',
         'Outbound sold-by-tag lines. CAUTION per check_defect CD-2: 152 Eagle Eyes custody lines still counted as sales until the counterparty ruling is wired into this view too.',
         'forensic_sold_by_tag', now()
  union all
  select 'Sales & Cash', 73, 'Shipped with no Apex invoice', (select count(*)::numeric from v_forensic_sold_by_tag where invoice_match = 'NO APEX INVOICE'), 'lines', 'bad',
         'Every line that left with no matching order. 152 are the Eagle Eyes storage legs (no invoice because no sale); the remainder are real exceptions.',
         'forensic_sold_by_tag', now()
  union all
  select 'Inventory', 80, 'On a truck right now',
         (select round(sum(f_to_pounds(m.quantity, m.uom)), 1) from (select distinct on (d.tag) d.* from metrc_packages d order by d.tag, (coalesce(d.quantity, 0) > 0 and not coalesce((d.raw->>'IsFinished')::boolean, false)) desc, (d.source_state = 'active') desc nulls last, d.synced_at desc nulls last) m where m.source_state = 'intransit' and not coalesce(m.finished, false)),
         'lb', 'watch',
         (select count(*)::text || ' packages on active transfers, ours until the destination accepts (owner ruling). Stuck transfers live in this number - the oldest is months past any truck ride.'
            from (select distinct on (d.tag) d.* from metrc_packages d order by d.tag, (coalesce(d.quantity, 0) > 0 and not coalesce((d.raw->>'IsFinished')::boolean, false)) desc, (d.source_state = 'active') desc nulls last, d.synced_at desc nulls last) m where m.source_state = 'intransit' and not coalesce(m.finished, false)),
         'in_transit', now()
  union all
  select 'Inventory', 81, 'Cross-licence tags', (select count(*)::numeric from v_cross_license_tags), 'tags', 'watch',
         'Tags holding active material under BOTH licences at once. Legitimate moves, but each silently shifts pounds between per-tag and per-licence answers - 7 of these carried the entire 72 lb disagreement.',
         'cross_license_tags', now();

refresh materialized view public.mv_dept_dash_supplement;
notify pgrst, 'reload schema';;
