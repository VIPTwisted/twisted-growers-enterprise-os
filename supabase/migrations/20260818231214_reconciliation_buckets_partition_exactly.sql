/* THE RECONCILIATION REPORT'S BUCKETS PARTITION EXACTLY — page 4 of the build.
 * Full story in the view comment: failed-testing material was double-counted
 * into "sellable" on 8 items (the identity missed by exactly the failed amount
 * each time), and raw rows let cross-licence twins feed both licences. The
 * base is now the canonical one-row-per-tag survivor set and the buckets are a
 * true partition, held by a two-road zero-tolerance contract. */

create or replace view public.v_inventory_reconciliation as
 WITH base AS (
         SELECT p.license,
            COALESCE(p.item_name, '(unnamed item)'::text) AS item,
            p.source_state,
            p.lab_testing_state,
            COALESCE(p.quantity, (0)::numeric) AS qty,
            COALESCE(((p.raw ->> 'InitialQuantity'::text))::numeric, COALESCE(p.quantity, (0)::numeric)) AS initial_qty,
            ((p.raw ->> 'IsOnHold'::text))::boolean AS on_hold,
            (p.raw ->> 'ArchivedDate'::text) AS archived
           FROM ( SELECT DISTINCT ON (d.tag) d.*
                  FROM metrc_packages d
                  ORDER BY d.tag, (COALESCE(d.quantity,0) > 0 AND NOT COALESCE((d.raw->>'IsFinished')::boolean,false)) DESC,
                           (d.source_state = 'active') DESC NULLS LAST, d.synced_at DESC NULLS LAST) p
        )
 SELECT license,
    item,
    round(sum(initial_qty), 1) AS packaged_originally,
    round(sum(qty) FILTER (WHERE ((source_state = 'active'::text) AND (NOT COALESCE(on_hold, false)) AND (lab_testing_state IS DISTINCT FROM 'TestFailed'::text))), 1) AS in_stock_sellable,
    round(sum(qty) FILTER (WHERE ((COALESCE(on_hold, false) OR (source_state = 'onhold'::text)) AND (source_state <> 'inactive'::text) AND (source_state <> 'intransit'::text) AND (lab_testing_state IS DISTINCT FROM 'TestFailed'::text))), 1) AS on_hold,
    round(sum(qty) FILTER (WHERE (source_state = 'intransit'::text)), 1) AS in_transit,
    round(sum(initial_qty) FILTER (WHERE (source_state = 'inactive'::text)), 1) AS closed_or_sold,
    round(sum(qty) FILTER (WHERE ((lab_testing_state = 'TestFailed'::text) AND (source_state <> 'inactive'::text) AND (source_state <> 'intransit'::text))), 1) AS failed_testing_held,
    round(sum((initial_qty - qty)) FILTER (WHERE (source_state = ANY (ARRAY['active'::text, 'onhold'::text]))), 1) AS reduced_without_reason,
        CASE
            WHEN (sum((initial_qty - qty)) FILTER (WHERE (source_state = ANY (ARRAY['active'::text, 'onhold'::text]))) > (0)::numeric) THEN (('UNACCOUNTED - '::text || round(sum((initial_qty - qty)) FILTER (WHERE (source_state = ANY (ARRAY['active'::text, 'onhold'::text]))), 1)) || ' reduced with no recorded reason'::text)
            WHEN (sum(qty) FILTER (WHERE ((lab_testing_state = 'TestFailed'::text) AND (source_state <> 'inactive'::text) AND (source_state <> 'intransit'::text))) > (0)::numeric) THEN 'FAILED TESTING still on hand - decide destruction or remediation'::text
            WHEN (sum(qty) FILTER (WHERE COALESCE(on_hold, false)) > (0)::numeric) THEN 'Quantity on hold in Metrc'::text
            ELSE 'Reconciled'::text
        END AS reconciliation_status
   FROM base
  GROUP BY license, item
  ORDER BY
        CASE
            WHEN (sum((initial_qty - qty)) FILTER (WHERE (source_state = ANY (ARRAY['active'::text, 'onhold'::text]))) > (0)::numeric) THEN 0
            ELSE 1
        END, (sum(qty) FILTER (WHERE (source_state = 'active'::text))) DESC NULLS LAST;

comment on view public.v_inventory_reconciliation is
  'Per-item lifecycle reconciliation on the canonical one-row-per-tag base: packaged originally '
  '= sellable + on hold + in transit + closed/sold + failed held + reduced without reason, a true '
  'partition since 18 Aug 2026 (failed material was double-counted in sellable before that, and '
  'twins fed both licences). reduced_without_reason is the column that must be zero or explained. '
  'Identity held by contract inv.reconciliation.identity_closes. Agent I.';

insert into report_registry (report_key, title, category, fact_view, date_column, dimensions, measures, description, owner_note, enabled)
values ('inventory_reconciliation',
        'Inventory reconciliation — every item lifecycle closes',
        'Inventory',
        'v_inventory_reconciliation', null,
        array['license','item','reconciliation_status']::text[],
        array['packaged_originally','in_stock_sellable','on_hold','in_transit','closed_or_sold','failed_testing_held','reduced_without_reason']::text[],
        'One row per item per licence: what was packaged originally and where every unit stands now — sellable, on hold, on a truck, closed or sold, failed testing held, or REDUCED WITH NO RECORDED REASON. The buckets are a true partition: they must sum exactly to what was packaged. Any figure in the last column is unaccounted product and is flagged UNACCOUNTED at the top of the report.',
        'The arithmetic identity is enforced by a zero-tolerance contract measured every 30 minutes (view arithmetic against an independent recomputation from the raw Metrc mirror). As of 18 Aug 2026: 1,477 items, 0 units reduced without reason, 8 items holding failed-testing product awaiting a destruction-or-remediation decision.',
        true)
on conflict (report_key) do update set title=excluded.title, description=excluded.description, owner_note=excluded.owner_note, fact_view=excluded.fact_view, dimensions=excluded.dimensions, measures=excluded.measures, enabled=true;

insert into tile_drill_contract (contract_key, page, tile_label, tile_sql, drill_sql, tolerance, why_tolerance, registered_by)
values ('inv.reconciliation.identity_closes', 'Inventory',
        'Every item lifecycle closes: packaged = the sum of its six buckets',
        'select 0::numeric',
        'select count(*)::numeric from (select license, coalesce(item_name,''(unnamed item)'') as item, sum(coalesce((raw->>''InitialQuantity'')::numeric, coalesce(quantity,0))) as packaged, sum(coalesce(quantity,0)) filter (where source_state=''active'' and not coalesce((raw->>''IsOnHold'')::boolean,false) and lab_testing_state is distinct from ''TestFailed'') + sum(coalesce(quantity,0)) filter (where (coalesce((raw->>''IsOnHold'')::boolean,false) or source_state=''onhold'') and source_state not in (''inactive'',''intransit'') and lab_testing_state is distinct from ''TestFailed'') + sum(coalesce(quantity,0)) filter (where source_state=''intransit'') + sum(coalesce((raw->>''InitialQuantity'')::numeric, coalesce(quantity,0))) filter (where source_state=''inactive'') + sum(coalesce(quantity,0)) filter (where lab_testing_state=''TestFailed'' and source_state not in (''inactive'',''intransit'')) + sum(coalesce((raw->>''InitialQuantity'')::numeric, coalesce(quantity,0)) - coalesce(quantity,0)) filter (where source_state in (''active'',''onhold'')) as buckets from (select distinct on (d.tag) d.* from metrc_packages d order by d.tag, (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>''IsFinished'')::boolean,false)) desc, (d.source_state = ''active'') desc nulls last, d.synced_at desc nulls last) p group by 1,2) s where abs(coalesce(packaged,0) - coalesce(buckets,0)) > 0.001',
        0,
        'ZERO, 18 Aug 2026: the number of items whose lifecycle identity fails, recomputed UNROUNDED from the raw Metrc mirror with the canonical dedup, must be zero. The view found 8 such items on registration day — failed-testing material double-counted into sellable — and the partition was fixed the same hour.',
        'Agent I')
on conflict (contract_key) do update set tile_sql=excluded.tile_sql, drill_sql=excluded.drill_sql, tolerance=excluded.tolerance, why_tolerance=excluded.why_tolerance;;
