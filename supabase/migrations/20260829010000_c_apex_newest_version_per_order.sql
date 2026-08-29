/* ═══════════════════════════════════════════════════════════════════════════
   C · ONE ROW PER ORDER — THE NEWEST VERSION, NOTHING DELETED
   Branch `claude-c/apex-newest-version-only`, 29 August 2026.

   Owner ruling: apex_raw stays APPEND-ONLY, and v_apex_order_metrc_link and its
   dependents must emit one row per apex_order_id -- newest fetch, latest payload
   only. The 203 older rows are NOT deleted.

   WHAT WAS WRONG. The Sales-orders pull inserts rather than upserts. apex_raw
   holds 2,063 shipping-order rows for 1,860 distinct apex_id. 203 orders each
   carry two rows and all 203 differ in payload -- these are revisions, not
   duplicates of the same snapshot. Both views below read a row as an order, so
   every revised order was counted twice:

     v_apex_order_metrc_link   2,063 rows against 1,860 real orders;
                               24 orders in two link_status groups at once;
                               $919,848 of order value double-counted
     v_manifest_reconciliation Apex side summed $7,950,180.54 where the newest
                               versions total $7,029,270.17 -- $920,910 over

   WHY BOTH. v_manifest_reconciliation is not a dependent of the link view; it
   reads apex_raw directly. But it is the other half of the same Apex-Metrc
   reconciliation, and fixing one alone would leave the two halves contradicting
   each other on the same orders -- which is the defect, not the fix.

   HOW. A single `apex_order_current` CTE at the head of each view:
   DISTINCT ON (apex_id) ORDER BY apex_id, fetched_at DESC, id DESC. Newest pull
   wins; apex_raw.id breaks ties deterministically because it is append-only, so
   the higher id is always the later row. Never ordered by payload -- a tie
   resolved by content would silently change which version is current whenever
   the content changed.

   THE BUYER-LICENCE KEY IS NOT TOUCHED. Neither is any status, threshold or
   money basis. This decides which VERSION of an order is read; it changes
   nothing about how an order is classified once read.

   create or replace view, never drop. No row is deleted; apex_raw is unchanged.
   ═══════════════════════════════════════════════════════════════════════════ */

begin;

create or replace view v_apex_order_metrc_link as
 WITH apex_order_current AS (
         /* ONE ROW PER ORDER — THE NEWEST VERSION, NOTHING DELETED.
            Owner ruling, 29 Aug 2026: apex_raw stays APPEND-ONLY, and every view
            that treats a row as "an order" must emit one row per apex_id.

            The Sales-orders pull inserts rather than upserts, so a revised order
            keeps its earlier snapshot alongside the new one. 203 order ids each
            carry two rows, all 203 with genuinely different payloads -- none is a
            byte-identical copy. Without this CTE the same order is counted twice,
            lands in two different link_status groups at once (24 of them did),
            and double-counts $919,848 of order value.

            fetched_at DESC picks the newest pull; id DESC breaks a tie
            deterministically, because apex_raw.id is append-only so the higher id
            is always the later row. Never ORDER BY payload -- a tie resolved by
            content would silently change which version is "current" when the
            content changes.

            The older rows are untouched and still in apex_raw, which is what
            append-only means. This decides what is CURRENT, it does not decide
            what is kept. */
         SELECT DISTINCT ON (r.apex_id) r.apex_id,
            r.payload
           FROM apex_raw r
          WHERE r.entity = 'shipping-orders'::text
          ORDER BY r.apex_id, r.fetched_at DESC, r.id DESC
        ),
         apex AS (
         SELECT r.apex_id AS apex_order_id,
            btrim(r.payload ->> 'invoice_number'::text) AS invoice_number,
            NULLIF(regexp_replace(r.payload ->> 'invoice_number'::text, '\D'::text, ''::text, 'g'::text), ''::text) AS invoice_digits,
            NULLIF(r.payload ->> 'order_date'::text, ''::text)::date AS order_date,
            NULLIF(r.payload ->> 'delivery_date'::text, ''::text)::date AS delivery_date,
            NULLIF(btrim(r.payload ->> 'buyer_state_license'::text), ''::text) AS buyer_state_license,
            NULLIF(regexp_replace(r.payload ->> 'buyer_state_license'::text, '\D'::text, ''::text, 'g'::text), ''::text) AS buyer_licence_digits,
            NULLIF(r.payload ->> 'buyer_id'::text, ''::text) AS apex_buyer_id,
            round(NULLIF(r.payload ->> 'total_raw'::text, ''::text)::numeric / (( SELECT conversion_factors.value
                   FROM conversion_factors
                  WHERE conversion_factors.key = 'apex_money_raw_minor_units'::text)), 2) AS total_dollars,
            round(NULLIF(r.payload ->> 'subtotal_raw'::text, ''::text)::numeric / (( SELECT conversion_factors.value
                   FROM conversion_factors
                  WHERE conversion_factors.key = 'apex_money_raw_minor_units'::text)), 2) AS subtotal_dollars,
            (r.payload ->> 'cancelled'::text) <> ALL (ARRAY[''::text, '0'::text, 'false'::text]) AS cancelled,
            jsonb_array_length(COALESCE(r.payload -> 'items'::text, '[]'::jsonb)) AS line_count,
            NULLIF(btrim(r.payload ->> 'split_from_order_id'::text), ''::text) AS split_from_order_id
           FROM apex_order_current r
        ), dupes AS (
         SELECT apex.invoice_digits
           FROM apex
          WHERE apex.invoice_digits IS NOT NULL
          GROUP BY apex.invoice_digits
         HAVING count(DISTINCT apex.apex_order_id) > 1
        ), w AS (
         SELECT NULLIF(regexp_replace(x.invoice_number, '\D'::text, ''::text, 'g'::text), ''::text) AS invoice_digits,
            NULLIF(regexp_replace(x.destination_licence, '\D'::text, ''::text, 'g'::text), ''::text) AS dest_licence_digits,
            x.manifest_number,
            x.destination_licence,
            x.amount,
            x.voided,
            x.created_on
           FROM metrc_rpt_wholesale x
          WHERE NULLIF(btrim(x.invoice_number), ''::text) IS NOT NULL
        ), bridge AS (
         SELECT w.invoice_digits,
            count(DISTINCT w.manifest_number) AS metrc_manifests,
            count(*) AS metrc_wholesale_rows,
            count(*) FILTER (WHERE w.voided) AS voided_rows,
            min(w.created_on) AS first_metrc_date,
            max(w.created_on) AS last_metrc_date,
            string_agg(DISTINCT w.destination_licence, ', '::text) AS metrc_destination_licences,
            round(sum(w.amount) FILTER (WHERE NOT w.voided AND w.amount >= f_rule('apex_metrc_placeholder_line_floor_usd'::text)), 2) AS declared_any_buyer
           FROM w
          GROUP BY w.invoice_digits
        ), tags AS (
         SELECT NULLIF(regexp_replace(x.invoice_number, '\D'::text, ''::text, 'g'::text), ''::text) AS invoice_digits,
            count(DISTINCT pt.package_tag) AS package_tags
           FROM metrc_rpt_wholesale x
             JOIN metrc_rpt_package_transfers pt ON pt.manifest_number = x.manifest_number
          WHERE NULLIF(btrim(x.invoice_number), ''::text) IS NOT NULL
          GROUP BY (NULLIF(regexp_replace(x.invoice_number, '\D'::text, ''::text, 'g'::text), ''::text))
        ), buyer AS (
         SELECT a.apex_order_id,
            count(DISTINCT w.manifest_number) FILTER (WHERE NOT w.dest_licence_digits IS DISTINCT FROM a.buyer_licence_digits) AS buyer_confirmed_manifests,
            count(DISTINCT w.manifest_number) FILTER (WHERE w.dest_licence_digits IS DISTINCT FROM a.buyer_licence_digits) AS foreign_manifests,
            round(sum(w.amount) FILTER (WHERE NOT w.voided AND w.amount >= f_rule('apex_metrc_placeholder_line_floor_usd'::text) AND NOT w.dest_licence_digits IS DISTINCT FROM a.buyer_licence_digits), 2) AS declared_buyer
           FROM apex a
             JOIN w ON w.invoice_digits = a.invoice_digits
          WHERE a.buyer_licence_digits IS NOT NULL
          GROUP BY a.apex_order_id
        ), j AS (
         SELECT a.apex_order_id,
            a.invoice_number,
            a.invoice_digits,
            a.order_date,
            a.delivery_date,
            a.buyer_state_license,
            a.buyer_licence_digits,
            a.apex_buyer_id,
            a.total_dollars,
            a.subtotal_dollars,
            a.cancelled,
            a.line_count,
            a.split_from_order_id,
            b.metrc_manifests,
            b.metrc_wholesale_rows,
            b.voided_rows,
            b.metrc_destination_licences,
            b.first_metrc_date,
            b.last_metrc_date,
            b.declared_any_buyer,
            COALESCE(t.package_tags, 0::bigint) AS package_tags,
            d.invoice_digits IS NOT NULL AS invoice_number_is_ambiguous,
            COALESCE(y.buyer_confirmed_manifests, 0::bigint) AS buyer_confirmed_manifests,
            COALESCE(y.foreign_manifests, 0::bigint) AS foreign_manifests,
            y.declared_buyer,
            f_rule('apex_metrc_rounding_tolerance_usd'::text) AS tol
           FROM apex a
             LEFT JOIN bridge b ON b.invoice_digits = a.invoice_digits
             LEFT JOIN tags t ON t.invoice_digits = a.invoice_digits
             LEFT JOIN dupes d ON d.invoice_digits = a.invoice_digits
             LEFT JOIN buyer y ON y.apex_order_id = a.apex_order_id
        ), k AS (
         SELECT j.apex_order_id,
            j.invoice_number,
            j.invoice_digits,
            j.order_date,
            j.delivery_date,
            j.buyer_state_license,
            j.buyer_licence_digits,
            j.apex_buyer_id,
            j.total_dollars,
            j.subtotal_dollars,
            j.cancelled,
            j.line_count,
            j.split_from_order_id,
            j.metrc_manifests,
            j.metrc_wholesale_rows,
            j.voided_rows,
            j.metrc_destination_licences,
            j.first_metrc_date,
            j.last_metrc_date,
            j.declared_any_buyer,
            j.package_tags,
            j.invoice_number_is_ambiguous,
            j.buyer_confirmed_manifests,
            j.foreign_manifests,
            j.declared_buyer,
            j.tol,
            j.declared_buyer IS NOT NULL AND abs(j.subtotal_dollars - j.declared_buyer) <= j.tol AS buyer_money_agrees,
            j.declared_any_buyer IS NOT NULL AND abs(j.subtotal_dollars - j.declared_any_buyer) <= j.tol AS key_money_agrees
           FROM j
        )
 SELECT apex_order_id,
    invoice_number,
    invoice_digits,
    order_date,
    delivery_date,
    buyer_state_license,
    apex_buyer_id,
    total_dollars,
    cancelled,
    line_count,
    split_from_order_id,
    metrc_manifests,
    metrc_wholesale_rows,
    voided_rows,
    metrc_destination_licences,
    first_metrc_date,
    last_metrc_date,
    package_tags,
    invoice_number_is_ambiguous,
        CASE
            WHEN invoice_digits IS NULL THEN 'NO INVOICE NUMBER'::text
            WHEN invoice_number_is_ambiguous THEN 'AMBIGUOUS INVOICE NUMBER'::text
            WHEN metrc_manifests IS NOT NULL THEN
            CASE
                WHEN buyer_licence_digits IS NULL THEN 'MATCHED'::text
                WHEN foreign_manifests = 0 AND buyer_money_agrees THEN 'MATCHED'::text
                WHEN foreign_manifests > 0 AND key_money_agrees THEN 'MATCHED'::text
                WHEN foreign_manifests > 0 AND buyer_money_agrees THEN 'EXCEPTION — FALSE MATCH ON INVOICE KEY, money reconciles'::text
                WHEN foreign_manifests > 0 THEN 'EXCEPTION — FALSE MATCH ON INVOICE KEY, money differs'::text
                ELSE 'EXCEPTION — VALUE DIFFERS'::text
            END
            WHEN cancelled THEN 'EXPLAINED — cancelled'::text
            WHEN line_count = 0 THEN 'EXPLAINED — no line items'::text
            WHEN COALESCE(total_dollars, 0::numeric) = 0::numeric AND COALESCE(subtotal_dollars, 0::numeric) = 0::numeric THEN 'EXPLAINED — zero value'::text
            WHEN COALESCE(total_dollars, 0::numeric) = 0::numeric THEN 'EXCEPTION — INVOICE TOTAL IS ZERO, THE LINE VALUES ARE NOT'::text
            WHEN order_date < '2025-01-30'::date THEN 'UNMATCHED — PRE-KEY, UNMATCHABLE BY CONSTRUCTION'::text
            ELSE 'APEX ONLY — UNEXPLAINED'::text
        END AS link_status,
        CASE
            WHEN metrc_manifests IS NULL THEN NULL::text
            ELSE 'invoice number digits (Apex "TWISTE-1737" = Metrc "1737") AND buyer state licence digits (Apex "RMD705" = Metrc "RMD705-P"). Both sides of both keys are normalised. Metrc''s invoice field is operator-entered free text, so the invoice half alone is not sufficient — bare numbers typed into it collide with real invoice numbers.'::text
        END AS match_basis,
    buyer_licence_digits,
    buyer_confirmed_manifests,
    foreign_manifests,
    subtotal_dollars AS apex_subtotal_usd,
    declared_buyer AS metrc_declared_buyer_usd,
    declared_any_buyer AS metrc_declared_any_buyer_usd,
        CASE
            WHEN declared_buyer IS NULL THEN NULL::numeric
            ELSE round(subtotal_dollars - declared_buyer, 2)
        END AS value_gap_usd,
        CASE
            WHEN buyer_state_license IS NOT NULL AND f_is_ours(buyer_state_license) THEN 'BUYER IS ONE OF OUR OWN LICENCES — reads as an internal movement written as an order. Flagged, not closed.'::text
            WHEN metrc_manifests IS NULL THEN NULL::text
            WHEN buyer_licence_digits IS NULL THEN 'NO BUYER LICENCE ON THE ORDER — buyer could not be tested'::text
            WHEN foreign_manifests = 0 THEN 'BUYER CONFIRMED'::text
            WHEN key_money_agrees THEN 'LICENCE ALIAS — money agrees in full, buyer licence written differently; needs a memo'::text
            ELSE 'BUYER DIFFERS — this invoice key also attracted manifests to other companies'::text
        END AS match_quality,
        CASE
            WHEN order_date IS NULL THEN 'ORDER DATE NOT RECORDED'::text
            WHEN order_date < '2025-01-30'::date THEN 'PRE-KEY — Metrc carried no invoice number until 2025-01-30'::text
            ELSE 'KEYED ERA'::text
        END AS era
   FROM k;

create or replace view v_manifest_reconciliation as
 WITH apex_order_current AS (
         /* ONE ROW PER ORDER — THE NEWEST VERSION, NOTHING DELETED.
            Owner ruling, 29 Aug 2026: apex_raw stays APPEND-ONLY, and every view
            that treats a row as "an order" must emit one row per apex_id.

            The Sales-orders pull inserts rather than upserts, so a revised order
            keeps its earlier snapshot alongside the new one. 203 order ids each
            carry two rows, all 203 with genuinely different payloads -- none is a
            byte-identical copy. Without this CTE the same order is counted twice,
            lands in two different link_status groups at once (24 of them did),
            and double-counts $919,848 of order value.

            fetched_at DESC picks the newest pull; id DESC breaks a tie
            deterministically, because apex_raw.id is append-only so the higher id
            is always the later row. Never ORDER BY payload -- a tie resolved by
            content would silently change which version is "current" when the
            content changes.

            The older rows are untouched and still in apex_raw, which is what
            append-only means. This decides what is CURRENT, it does not decide
            what is kept. */
         SELECT DISTINCT ON (r.apex_id) r.apex_id,
            r.payload
           FROM apex_raw r
          WHERE r.entity = 'shipping-orders'::text
          ORDER BY r.apex_id, r.fetched_at DESC, r.id DESC
        ),
         man AS (
         SELECT DISTINCT ON (t.manifest_number) t.manifest_number,
            t.created_on,
            t.received_on,
            t.destination_licence,
            t.destination_facility
           FROM metrc_rpt_transfer_manifests t
          WHERE t.direction = 'outbound'::text
          ORDER BY t.manifest_number, t.created_on
        ), kind AS (
         SELECT m.manifest_number,
            m.created_on,
            m.received_on,
            m.destination_licence,
            m.destination_facility,
                CASE
                    WHEN m.destination_licence IS NULL THEN 'UNKNOWN DESTINATION'::text
                    WHEN f_is_ours(m.destination_licence) THEN 'INTERNAL TRANSFER'::text
                    WHEN "left"(m.destination_licence, 2) = 'IL'::text THEN 'LABORATORY SAMPLE'::text
                    WHEN "left"(m.destination_licence, 2) = 'MX'::text THEN 'TRANSPORTER'::text
                    ELSE 'SALE'::text
                END AS destination_kind,
            NULLIF(regexp_replace(m.destination_licence, '\D'::text, ''::text, 'g'::text), ''::text) AS dest_licence_digits
           FROM man m
        ), money AS (
         SELECT w.manifest_number,
            round(sum(w.amount) FILTER (WHERE NOT w.voided AND w.amount >= f_rule('apex_metrc_placeholder_line_floor_usd'::text)), 2) AS declared,
            count(*) FILTER (WHERE NOT w.voided AND w.amount >= f_rule('apex_metrc_placeholder_line_floor_usd'::text)) AS money_lines,
            count(*) FILTER (WHERE w.voided) AS voided_lines,
            count(*) FILTER (WHERE w.amount < f_rule('apex_metrc_placeholder_line_floor_usd'::text)) AS placeholder_lines,
            max(NULLIF(btrim(w.invoice_number), ''::text)) AS invoice_number
           FROM metrc_rpt_wholesale w
          GROUP BY w.manifest_number
        ), pkgs AS (
         SELECT metrc_rpt_package_transfers.manifest_number,
            count(DISTINCT metrc_rpt_package_transfers.package_tag) AS package_tags
           FROM metrc_rpt_package_transfers
          GROUP BY metrc_rpt_package_transfers.manifest_number
        ), apex AS (
         SELECT regexp_replace(r.payload ->> 'invoice_number'::text, '\D'::text, ''::text, 'g'::text) AS d,
            NULLIF(regexp_replace(r.payload ->> 'buyer_state_license'::text, '\D'::text, ''::text, 'g'::text), ''::text) AS buyer_digits,
            min(NULLIF(r.payload ->> 'order_date'::text, ''::text)::date) AS apex_order_date,
            min(NULLIF(r.payload ->> 'delivery_date'::text, ''::text)::date) AS apex_delivery_date,
            round(sum((r.payload ->> 'subtotal_raw'::text)::numeric) / (( SELECT conversion_factors.value
                   FROM conversion_factors
                  WHERE conversion_factors.key = 'apex_money_raw_minor_units'::text)), 2) AS apex_value,
            count(*) AS apex_orders,
            string_agg(DISTINCT btrim(r.payload ->> 'invoice_number'::text), ', '::text) AS apex_invoices
           FROM apex_order_current r
          WHERE ((r.payload ->> 'cancelled'::text) = ANY (ARRAY[''::text, '0'::text, 'false'::text])) AND jsonb_array_length(COALESCE(r.payload -> 'items'::text, '[]'::jsonb)) > 0
          GROUP BY (regexp_replace(r.payload ->> 'invoice_number'::text, '\D'::text, ''::text, 'g'::text)), (NULLIF(regexp_replace(r.payload ->> 'buyer_state_license'::text, '\D'::text, ''::text, 'g'::text), ''::text))
        ), apex_any AS (
         SELECT regexp_replace(r.payload ->> 'invoice_number'::text, '\D'::text, ''::text, 'g'::text) AS d,
            min(NULLIF(r.payload ->> 'order_date'::text, ''::text)::date) AS apex_order_date,
            min(NULLIF(r.payload ->> 'delivery_date'::text, ''::text)::date) AS apex_delivery_date,
            round(sum((r.payload ->> 'subtotal_raw'::text)::numeric) / (( SELECT conversion_factors.value
                   FROM conversion_factors
                  WHERE conversion_factors.key = 'apex_money_raw_minor_units'::text)), 2) AS apex_value,
            count(*) AS apex_orders,
            string_agg(DISTINCT btrim(r.payload ->> 'invoice_number'::text), ', '::text) AS apex_invoices,
            string_agg(DISTINCT NULLIF(btrim(r.payload ->> 'buyer_state_license'::text), ''::text), ', '::text) AS buyer_licences
           FROM apex_order_current r
          WHERE ((r.payload ->> 'cancelled'::text) = ANY (ARRAY[''::text, '0'::text, 'false'::text])) AND jsonb_array_length(COALESCE(r.payload -> 'items'::text, '[]'::jsonb)) > 0
          GROUP BY (regexp_replace(r.payload ->> 'invoice_number'::text, '\D'::text, ''::text, 'g'::text))
        ), j AS (
         SELECT k.manifest_number,
            k.created_on,
            k.received_on,
            k.destination_licence,
            k.destination_facility,
            k.destination_kind,
            mo.invoice_number,
            mo.declared,
            mo.money_lines,
            mo.voided_lines,
            mo.placeholder_lines,
            COALESCE(p.package_tags, 0::bigint) AS package_tags,
            a.d AS buyer_matched,
            aa.d AS any_matched,
            aa.buyer_licences,
            a.d IS NULL AND aa.d IS NOT NULL AND mo.declared IS NOT NULL AND abs(aa.apex_value - mo.declared) <= f_rule('apex_metrc_rounding_tolerance_usd'::text) AS licence_alias,
            COALESCE(a.apex_invoices, aa.apex_invoices) AS any_invoices,
            COALESCE(a.apex_order_date, aa.apex_order_date) AS any_order_date,
            COALESCE(a.apex_delivery_date, aa.apex_delivery_date) AS any_delivery_date,
            COALESCE(a.apex_value, aa.apex_value) AS any_value,
            COALESCE(a.apex_orders, aa.apex_orders) AS any_orders,
            a.apex_invoices,
            a.apex_order_date,
            a.apex_delivery_date,
            a.apex_value,
            a.apex_orders
           FROM kind k
             LEFT JOIN money mo ON mo.manifest_number = k.manifest_number
             LEFT JOIN pkgs p ON p.manifest_number = k.manifest_number
             LEFT JOIN apex a ON a.d = regexp_replace(COALESCE(mo.invoice_number, ''::text), '\D'::text, ''::text, 'g'::text) AND mo.invoice_number IS NOT NULL AND NOT a.buyer_digits IS DISTINCT FROM k.dest_licence_digits
             LEFT JOIN apex_any aa ON aa.d = regexp_replace(COALESCE(mo.invoice_number, ''::text), '\D'::text, ''::text, 'g'::text) AND mo.invoice_number IS NOT NULL
        )
 SELECT manifest_number,
    created_on AS metrc_date,
    received_on AS metrc_received,
    destination_licence,
    destination_facility,
    destination_kind,
    invoice_number AS metrc_invoice_number,
    declared AS metrc_declared,
    money_lines,
    voided_lines,
    placeholder_lines,
    package_tags,
        CASE
            WHEN buyer_matched IS NOT NULL OR licence_alias THEN any_invoices
            ELSE NULL::text
        END AS apex_invoices,
        CASE
            WHEN buyer_matched IS NOT NULL OR licence_alias THEN any_order_date
            ELSE NULL::date
        END AS apex_order_date,
        CASE
            WHEN buyer_matched IS NOT NULL OR licence_alias THEN any_delivery_date
            ELSE NULL::date
        END AS apex_delivery_date,
        CASE
            WHEN buyer_matched IS NOT NULL OR licence_alias THEN any_value
            ELSE NULL::numeric
        END AS apex_value,
        CASE
            WHEN buyer_matched IS NOT NULL OR licence_alias THEN any_orders
            ELSE NULL::bigint
        END AS apex_orders,
        CASE
            WHEN buyer_matched IS NOT NULL OR licence_alias THEN COALESCE(any_delivery_date, any_order_date) - created_on
            ELSE NULL::integer
        END AS date_gap_days,
        CASE
            WHEN buyer_matched IS NOT NULL OR licence_alias THEN round(any_value - declared, 2)
            ELSE NULL::numeric
        END AS value_gap,
        CASE
            WHEN destination_kind <> 'SALE'::text THEN 'NOT A SALE — '::text || destination_kind
            WHEN created_on < '2025-01-30'::date THEN 'BEFORE THE KEY EXISTED — Metrc carried no invoice number until 2025-01-30'::text
            WHEN invoice_number IS NULL THEN 'NO INVOICE NUMBER on the Metrc record'::text
            WHEN buyer_matched IS NULL AND any_matched IS NULL THEN 'NO APEX ORDER for this invoice number'::text
            WHEN licence_alias THEN 'RECONCILED'::text
            WHEN buyer_matched IS NULL THEN 'FALSE MATCH — this invoice number belongs to an Apex order for a different buyer'::text
            WHEN declared IS NULL THEN 'NO METRC VALUE — Apex order matched but the manifest has no priced line'::text
            WHEN abs(apex_value - declared) <= f_rule('apex_metrc_rounding_tolerance_usd'::text) THEN 'RECONCILED'::text
            WHEN apex_value > declared THEN 'VALUE DIFFERS — Apex sold more than Metrc declares'::text
            ELSE 'VALUE DIFFERS — Metrc declares more than Apex sold'::text
        END AS status,
        CASE
            WHEN buyer_matched IS NOT NULL THEN 'BUYER CONFIRMED'::text
            WHEN licence_alias THEN 'LICENCE ALIAS — money agrees in full, buyer licence written differently; needs a memo'::text
            WHEN any_matched IS NOT NULL THEN 'BUYER DIFFERS — invoice number belongs to another company''s order'::text
            ELSE NULL::text
        END AS buyer_match,
    buyer_licences AS apex_buyer_licences_on_this_invoice
   FROM j;

commit;
