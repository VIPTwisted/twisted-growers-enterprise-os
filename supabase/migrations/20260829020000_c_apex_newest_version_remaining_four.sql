/* ═══════════════════════════════════════════════════════════════════════════
   C · THE NEWEST-VERSION RULE ON THE REMAINING FOUR APEX MONEY VIEWS
   Branch `claude-c/apex-newest-version-only`, 29 August 2026.

   Owner ruling: apex_raw stays APPEND-ONLY, and every view that reads a row as
   an order must take the newest version only. v_apex_order_metrc_link and
   v_manifest_reconciliation were fixed and applied first; these four read
   apex_raw directly and had the identical defect.

     v_forensic_sales          every order line, for the forensic sales ledger
     v_invoice_manifest_match  invoice against manifest, on buyer licence + date
     v_master_balance          revenue and collected, by year
     v_rpt_2024_sold           the 2024 sold report, line by line

   Each one counted a revised order twice: 203 of 1,860 orders carry two rows in
   apex_raw, all 203 with genuinely different payloads. On the line-level views
   that doubles the LINES of those orders as well.

   Same rule, same words, five clauses: DISTINCT ON (apex_id) ORDER BY apex_id,
   fetched_at DESC, id DESC. Never ORDER BY payload — a tie resolved by content
   would silently change which version is current whenever the content changed.

   NOTHING ELSE CHANGES. No filter, no threshold, no money basis, no buyer key,
   and no row is deleted. The only difference is WHICH version of an order each
   view reads.

   create or replace view, never drop.
   ═══════════════════════════════════════════════════════════════════════════ */

begin;

create or replace view v_forensic_sales as
 WITH apex_order_current AS (
         /* ONE ROW PER ORDER — THE NEWEST VERSION, NOTHING DELETED.
            apex_raw is append-only by owner ruling: the Apex pull inserts rather
            than upserts, so a revised order keeps its earlier snapshot. Reading
            apex_raw directly counts every revised order twice. fetched_at DESC
            takes the newest pull; id DESC breaks ties deterministically because
            apex_raw.id is append-only. The superseded rows stay where they are. */
         SELECT DISTINCT ON (r.apex_id) r.apex_id, r.payload
           FROM apex_raw r
          WHERE r.entity = 'shipping-orders'::text
          ORDER BY r.apex_id, r.fetched_at DESC, r.id DESC
        )
 SELECT (o.payload ->> 'order_date'::text)::date AS order_date,
    o.payload ->> 'invoice_number'::text AS invoice_number,
    NULLIF(o.payload ->> 'manifest_number'::text, ''::text) AS manifest_number,
    (o.payload -> 'buyer'::text) ->> 'name'::text AS buyer,
    o.payload ->> 'buyer_state_license'::text AS buyer_licence,
    ((o.payload -> 'order_status'::text) -> 'parent_status'::text) ->> 'name'::text AS order_status,
    COALESCE((o.payload ->> 'cancelled'::text)::boolean, false) AS cancelled,
    o.payload ->> 'payment_status'::text AS payment_status,
    COALESCE((o.payload ->> 'total_raw'::text)::numeric, 0::numeric) / 100.0 AS total_usd,
    COALESCE((o.payload ->> 'subtotal_raw'::text)::numeric, 0::numeric) / 100.0 AS subtotal_usd,
    COALESCE((o.payload ->> 'total_payments_raw'::text)::numeric, 0::numeric) / 100.0 AS paid_usd,
    it.value ->> 'product_name'::text AS product_name,
    (it.value -> 'product_category'::text) ->> 'name'::text AS apex_category,
    f_product_line(it.value ->> 'product_name'::text, (it.value -> 'product_category'::text) ->> 'name'::text, NULL::text) AS product_line,
    (it.value -> 'cultivar'::text) ->> 'name'::text AS strain,
    (it.value -> 'operation'::text) ->> 'state_license'::text AS selling_licence,
    NULLIF(it.value ->> 'metrc_package_label'::text, ''::text) AS metrc_tag,
    COALESCE((it.value ->> 'order_quantity'::text)::numeric, 0::numeric) AS qty,
    (it.value -> 'order_unit_measurement'::text) ->> 'name'::text AS qty_uom,
    COALESCE((it.value ->> 'units_per_case'::text)::numeric, 1::numeric) AS units_per_case,
    COALESCE((it.value ->> 'order_price_raw'::text)::numeric, 0::numeric) / 100.0 AS line_price_usd,
    (o.payload ->> 'id'::text)::bigint AS order_id,
    (it.value ->> 'id'::text)::bigint AS line_id
   FROM apex_order_current o
     LEFT JOIN LATERAL jsonb_array_elements(COALESCE(o.payload -> 'items'::text, '[]'::jsonb)) it(value) ON true;

create or replace view v_invoice_manifest_match as
 WITH apex_order_current AS (
         /* ONE ROW PER ORDER — THE NEWEST VERSION, NOTHING DELETED.
            apex_raw is append-only by owner ruling: the Apex pull inserts rather
            than upserts, so a revised order keeps its earlier snapshot. Reading
            apex_raw directly counts every revised order twice. fetched_at DESC
            takes the newest pull; id DESC breaks ties deterministically because
            apex_raw.id is append-only. The superseded rows stay where they are. */
         SELECT DISTINCT ON (r.apex_id) r.apex_id, r.payload
           FROM apex_raw r
          WHERE r.entity = 'shipping-orders'::text
          ORDER BY r.apex_id, r.fetched_at DESC, r.id DESC
        ),
         inv AS (
         SELECT a.payload ->> 'invoice_number'::text AS invoice,
            (a.payload -> 'buyer'::text) ->> 'name'::text AS buyer,
            upper(btrim(a.payload ->> 'buyer_state_license'::text)) AS buyer_licence,
            (a.payload ->> 'order_date'::text)::date AS order_date,
            (a.payload ->> 'delivery_date'::text)::date AS delivery_date,
            COALESCE((a.payload ->> 'delivery_date'::text)::date, (a.payload ->> 'order_date'::text)::date) AS ship_date,
            round(COALESCE((a.payload ->> 'total_raw'::text)::numeric, 0::numeric) / 100.0, 2) AS total_usd,
            round(COALESCE((a.payload ->> 'total_payments_raw'::text)::numeric, 0::numeric) / 100.0, 2) AS collected_usd,
            a.payload ->> 'payment_status'::text AS payment_status
           FROM apex_order_current a
          WHERE NOT ((a.payload ->> 'cancelled'::text)::boolean)
        ), mf AS (
         SELECT t.manifest_number,
            upper(btrim(t.destination_licence)) AS dest_licence,
            max(t.destination_facility) AS dest_facility,
            min(t.received_on) AS manifest_date,
            round(sum(t.shipped_lb), 2) AS manifest_lb,
            count(*) AS manifest_lines,
            string_agg(DISTINCT t.category, ' | '::text) AS categories
           FROM metrc_rpt_package_transfers t
          WHERE NOT f_is_ours(COALESCE(t.destination_licence, ''::text)) AND COALESCE(t.destination_licence, ''::text) !~* '^(MT|IL)'::text
          GROUP BY t.manifest_number, (upper(btrim(t.destination_licence)))
        )
 SELECT i.invoice,
    i.buyer,
    i.buyer_licence,
    i.order_date,
    i.delivery_date,
    i.total_usd,
    i.collected_usd,
    i.payment_status,
    m.manifest_number,
    m.dest_facility,
    m.manifest_date,
    m.manifest_lb,
    m.manifest_lines,
    m.categories,
    m.manifest_date - i.ship_date AS days_between,
        CASE
            WHEN m.manifest_number IS NOT NULL THEN 'MATCHED on buyer licence + date window'::text
            WHEN i.buyer_licence IS NULL THEN 'NO MATCH — the Apex order records no buyer licence'::text
            WHEN EXTRACT(year FROM i.ship_date) = 2024::numeric THEN 'NO MATCH — 2024 shipped via the Eagle Eyes warehouse; the final leg is on THEIR licence'::text
            ELSE 'NO MATCH — no manifest to this licence within the window'::text
        END AS match_verdict
   FROM inv i
     LEFT JOIN mf m ON m.dest_licence = i.buyer_licence AND m.manifest_date >= (i.ship_date - 10) AND m.manifest_date <= (i.ship_date + 30);

create or replace view v_rpt_2024_sold as
 WITH apex_order_current AS (
         /* ONE ROW PER ORDER — THE NEWEST VERSION, NOTHING DELETED.
            apex_raw is append-only by owner ruling: the Apex pull inserts rather
            than upserts, so a revised order keeps its earlier snapshot. Reading
            apex_raw directly counts every revised order twice. fetched_at DESC
            takes the newest pull; id DESC breaks ties deterministically because
            apex_raw.id is append-only. The superseded rows stay where they are. */
         SELECT DISTINCT ON (r.apex_id) r.apex_id, r.payload
           FROM apex_raw r
          WHERE r.entity = 'shipping-orders'::text
          ORDER BY r.apex_id, r.fetched_at DESC, r.id DESC
        )
 SELECT a.invoice,
    a.order_date,
    a.buyer,
    a.buyer_licence,
        CASE
            WHEN a.buyer_licence ~~* 'MT%'::text THEN 'TRANSPORTER — not a sale'::text
            WHEN a.buyer_licence ~~* 'ML%'::text THEN 'LAB — not a sale'::text
            WHEN a.buyer_licence IS NULL THEN 'licence not recorded on the order'::text
            ELSE 'Arm''s length sale'::text
        END AS classification,
    it.value ->> 'product_name'::text AS product,
    it.value ->> 'product_category'::text AS category,
    it.value ->> 'cultivar'::text AS strain,
    NULLIF(it.value ->> 'metrc_package_label'::text, ''::text) AS metrc_tag,
    it.value ->> 'batch_name'::text AS batch,
    (it.value ->> 'order_quantity'::text)::numeric AS qty,
    it.value ->> 'order_unit_measurement'::text AS uom,
    round(COALESCE((it.value ->> 'order_price_raw'::text)::numeric, 0::numeric) / 100.0, 2) AS unit_price_usd,
    round(COALESCE((it.value ->> 'order_price_raw'::text)::numeric, 0::numeric) * COALESCE((it.value ->> 'order_quantity'::text)::numeric, 0::numeric) / 100.0, 2) AS line_total_usd,
    a.order_total_usd,
    a.collected_usd,
    a.payment_status,
    a.manifest,
    a.cancelled
   FROM ( SELECT apex_raw.payload ->> 'invoice_number'::text AS invoice,
            COALESCE((apex_raw.payload ->> 'order_date'::text)::date, (apex_raw.payload ->> 'created_at'::text)::date) AS order_date,
            (apex_raw.payload -> 'buyer'::text) ->> 'name'::text AS buyer,
            apex_raw.payload ->> 'buyer_state_license'::text AS buyer_licence,
            apex_raw.payload ->> 'payment_status'::text AS payment_status,
            NULLIF(apex_raw.payload ->> 'manifest_number'::text, ''::text) AS manifest,
            (apex_raw.payload ->> 'cancelled'::text)::boolean AS cancelled,
            round(COALESCE((apex_raw.payload ->> 'total_raw'::text)::numeric, 0::numeric) / 100.0, 2) AS order_total_usd,
            round(COALESCE((apex_raw.payload ->> 'total_payments_raw'::text)::numeric, 0::numeric) / 100.0, 2) AS collected_usd,
            apex_raw.payload -> 'items'::text AS items
           FROM apex_order_current apex_raw) a,
    LATERAL jsonb_array_elements(a.items) it(value)
  WHERE a.order_date >= '2024-01-01'::date AND a.order_date <= '2024-12-31'::date;

create or replace view v_master_balance as
 WITH apex_order_current AS (
         /* ONE ROW PER ORDER — THE NEWEST VERSION, NOTHING DELETED.
            apex_raw is append-only by owner ruling: the Apex pull inserts rather
            than upserts, so a revised order keeps its earlier snapshot. Reading
            apex_raw directly counts every revised order twice. fetched_at DESC
            takes the newest pull; id DESC breaks ties deterministically because
            apex_raw.id is append-only. The superseded rows stay where they are. */
         SELECT DISTINCT ON (r.apex_id) r.apex_id, r.payload
           FROM apex_raw r
          WHERE r.entity = 'shipping-orders'::text
          ORDER BY r.apex_id, r.fetched_at DESC, r.id DESC
        ),
         grown AS (
         SELECT EXTRACT(year FROM metrc_rpt_harvest_moisture.finished_on)::integer AS period,
            round(sum(metrc_rpt_harvest_moisture.wet_lb), 1) AS wet_lb,
            round(sum(metrc_rpt_harvest_moisture.waste_lb), 1) AS waste_lb,
            round(sum(metrc_rpt_harvest_moisture.moisture_loss_lb), 1) AS moisture_lb,
            round(sum(metrc_rpt_harvest_moisture.packaged_lb), 1) AS packaged_lb,
            round(sum(metrc_rpt_harvest_moisture.wet_lb) - sum(metrc_rpt_harvest_moisture.waste_lb) - sum(metrc_rpt_harvest_moisture.moisture_loss_lb) - sum(metrc_rpt_harvest_moisture.packaged_lb), 4) AS unexplained_lb
           FROM metrc_rpt_harvest_moisture
          GROUP BY (EXTRACT(year FROM metrc_rpt_harvest_moisture.finished_on)::integer)
        ), bought AS (
         SELECT v_material_sourcing.yr AS period,
            round(sum(v_material_sourcing.lb_received), 1) AS bought_lb
           FROM v_material_sourcing
          WHERE v_material_sourcing.ownership ~~ 'THIRD PARTY%'::text
          GROUP BY v_material_sourcing.yr
        ), moved AS (
         SELECT EXTRACT(year FROM t_1.received_on)::integer AS period,
            round(sum(t_1.shipped_lb) FILTER (WHERE t_1.destination_licence !~* '^(MT|IL)'::text AND NOT f_is_ours(COALESCE(t_1.destination_licence, ''::text))), 1) AS arms_length_lb,
            round(sum(t_1.shipped_lb) FILTER (WHERE t_1.destination_licence ~* '^MT'::text), 1) AS to_warehouse_lb,
            round(sum(t_1.shipped_lb) FILTER (WHERE t_1.destination_licence ~* '^IL'::text), 1) AS to_lab_lb,
            round(sum(t_1.shipped_lb) FILTER (WHERE f_is_ours(COALESCE(t_1.destination_licence, ''::text))), 1) AS internal_lb,
            count(DISTINCT t_1.manifest_number) FILTER (WHERE t_1.destination_licence !~* '^(MT|IL)'::text AND NOT f_is_ours(COALESCE(t_1.destination_licence, ''::text))) AS arms_length_manifests,
            count(DISTINCT t_1.manifest_number) FILTER (WHERE f_is_ours(COALESCE(t_1.destination_licence, ''::text))) AS internal_manifests,
            count(DISTINCT t_1.manifest_number) FILTER (WHERE t_1.destination_licence ~* '^IL'::text) AS lab_manifests,
            count(DISTINCT t_1.manifest_number) AS all_manifests,
            count(*) AS all_lines,
            count(*) FILTER (WHERE NOT (EXISTS ( SELECT 1
                   FROM metrc_rpt_transfer_manifests m_1
                  WHERE m_1.manifest_number = t_1.manifest_number))) AS lines_without_a_header
           FROM metrc_rpt_package_transfers t_1
          GROUP BY (EXTRACT(year FROM t_1.received_on)::integer)
        ), lost AS (
         SELECT z.period,
            round(sum(z.lb), 1) AS destroyed_lb
           FROM ( SELECT EXTRACT(year FROM metrc_rpt_adjustments.adjusted_on)::integer AS period,
                    abs(f_to_pounds(metrc_rpt_adjustments.quantity, metrc_rpt_adjustments.uom)) AS lb
                   FROM metrc_rpt_adjustments
                  WHERE metrc_rpt_adjustments.quantity < 0::numeric
                UNION ALL
                 SELECT EXTRACT(year FROM metrc_rpt_plant_waste.waste_date)::integer AS "extract",
                    f_to_pounds(metrc_rpt_plant_waste.waste_qty, metrc_rpt_plant_waste.uom) AS f_to_pounds
                   FROM metrc_rpt_plant_waste) z
          GROUP BY z.period
        ), sold AS (
         SELECT EXTRACT(year FROM COALESCE((apex_raw.payload ->> 'order_date'::text)::date, (apex_raw.payload ->> 'created_at'::text)::date))::integer AS period,
            count(*) FILTER (WHERE NOT ((apex_raw.payload ->> 'cancelled'::text)::boolean)) AS live_orders,
            count(*) FILTER (WHERE (apex_raw.payload ->> 'cancelled'::text)::boolean) AS cancelled_orders,
            round(sum(COALESCE((apex_raw.payload ->> 'total_raw'::text)::numeric, 0::numeric) / 100.0) FILTER (WHERE NOT ((apex_raw.payload ->> 'cancelled'::text)::boolean)), 2) AS revenue_usd,
            round(sum(COALESCE((apex_raw.payload ->> 'total_payments_raw'::text)::numeric, 0::numeric) / 100.0) FILTER (WHERE NOT ((apex_raw.payload ->> 'cancelled'::text)::boolean)), 2) AS collected_usd
           FROM apex_order_current apex_raw
          GROUP BY (EXTRACT(year FROM COALESCE((apex_raw.payload ->> 'order_date'::text)::date, (apex_raw.payload ->> 'created_at'::text)::date))::integer)
        ), tagged AS (
         SELECT EXTRACT(year FROM COALESCE((a.payload ->> 'order_date'::text)::date, (a.payload ->> 'created_at'::text)::date))::integer AS period,
            count(*) AS apex_lines,
            count(NULLIF(btrim(it.value ->> 'metrc_package_label'::text), ''::text)) AS lines_with_metrc_tag
           FROM apex_order_current a,
            LATERAL jsonb_array_elements(a.payload -> 'items'::text) it(value)
          WHERE NOT ((a.payload ->> 'cancelled'::text)::boolean)
          GROUP BY (EXTRACT(year FROM COALESCE((a.payload ->> 'order_date'::text)::date, (a.payload ->> 'created_at'::text)::date))::integer)
        )
 SELECT g.period,
    g.wet_lb,
    g.waste_lb,
    g.moisture_lb,
    g.packaged_lb,
    g.unexplained_lb AS metrc_mass_unexplained_lb,
    m.arms_length_manifests,
    m.internal_manifests,
    m.lab_manifests,
    s.live_orders,
    s.revenue_usd,
    s.collected_usd,
    round(COALESCE(s.revenue_usd, 0::numeric) - COALESCE(s.collected_usd, 0::numeric), 2) AS outstanding_usd,
    s.cancelled_orders,
    t.apex_lines,
    t.lines_with_metrc_tag,
        CASE
            WHEN COALESCE(g.unexplained_lb, 0::numeric) = 0::numeric THEN 'MASS BALANCED — 0.0000 lb'::text
            ELSE ('MASS UNBALANCED — '::text || g.unexplained_lb) || ' lb'::text
        END AS mass_verdict,
        CASE
            WHEN (COALESCE(s.revenue_usd, 0::numeric) - COALESCE(s.collected_usd, 0::numeric)) = 0::numeric THEN 'CASH BALANCED — nothing outstanding'::text
            ELSE 'OUTSTANDING $'::text || round(COALESCE(s.revenue_usd, 0::numeric) - COALESCE(s.collected_usd, 0::numeric), 2)
        END AS cash_verdict,
        CASE
            WHEN COALESCE(t.lines_with_metrc_tag, 0::bigint) = 0 THEN (('NO TAG LINK — 0 of '::text || COALESCE(t.apex_lines, 0::bigint)) || ' Apex lines carry a Metrc tag. '::text) || 'Rebuilt on buyer licence + date instead; see v_invoice_manifest_match.'::text
            ELSE round(100.0 * t.lines_with_metrc_tag::numeric / NULLIF(t.apex_lines, 0)::numeric, 1) || '% of Apex lines carry a Metrc tag'::text
        END AS link_verdict,
    b.bought_lb,
    m.arms_length_lb,
    m.to_warehouse_lb,
    m.to_lab_lb,
    m.internal_lb,
    l.destroyed_lb,
    m.all_manifests,
    m.all_lines,
    m.lines_without_a_header
   FROM grown g
     LEFT JOIN bought b ON b.period = g.period
     LEFT JOIN moved m ON m.period = g.period
     LEFT JOIN lost l ON l.period = g.period
     LEFT JOIN sold s ON s.period = g.period
     LEFT JOIN tagged t ON t.period = g.period;

commit;
