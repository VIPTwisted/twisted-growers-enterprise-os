/* A transport leg is not a sale, and it was being counted twice.
 *
 * Owner, 18 Aug 2026: "this is transporting our own goods so should not be here you are
 * double counting... unless they actually were sold goods. All transports can not be
 * miscounted by double counting."
 *
 * He is right, and it is worse than the sales-gap list he was looking at.
 *
 * MEASURED across every outbound line:
 *   285 lines to MT (transporter) licences — Eagle Eyes Transport Solutions and
 *   MMM Transport — 990.9 lb, $1,199,521 declared. EVERY ONE originates from
 *   Twisted Growers. These are our own goods in transit.
 *
 *   75 of those tags ALSO appear on a manifest to a real counterparty:
 *   614.0 lb and $630,154 counted ONCE to the transporter and AGAIN to the buyer.
 *
 *   210 appear ONLY to a transporter and nowhere else — handed over with no arrival
 *   recorded anywhere. 376.9 lb, $569,367. The largest block, 48 tags and $425,406 via
 *   Eagle Eyes between Aug and Dec 2024, has neither a transfer type nor an origin
 *   facility recorded.
 *
 * AND v_forensic_sold_by_tag COUNTS THEM AS SALES. It is described as "every pound that
 * LEFT one of our licences" and it is read by 26 downstream objects for sales analysis.
 * It carries 202 transporter lines, 990.9 lb — 4.3% of the 22,795.7 lb it reports as
 * sold — and has matched $174,512 of Apex invoices onto them. Those same invoices match
 * the real buyer's manifest too, so the revenue is double counted as well as the weight.
 *
 * WHY A FLAG AND NOT A FILTER. 26 dependents read this view and some legitimately want
 * every movement, transport legs included — a custody trail must show the leg. Silently
 * removing rows would change 26 figures at once with no one deciding to. So the rows stay
 * and two columns are appended that say plainly what each row is. The surfaces that
 * report REVENUE must then filter on counts_as_sale, and that is a sales-lane change with
 * its own review, not something to slip in at the end of a long night.
 *
 * The finding raised alongside this names the 26 dependents as the work.
 */

create or replace view public.v_forensic_sold_by_tag as
 SELECT t.received_on AS shipped_on,
    t.manifest_number,
    t.package_tag,
    t.item,
    t.category,
    t.strain,
    f_product_line(t.item, t.category, NULL::text) AS product_line,
    t.shipped_lb AS pounds,
    COALESCE(NULLIF(t.source_row ->> 'Origin Lic.'::text, ''::text), t.licence) AS sold_by_licence,
    t.source_row ->> 'Origin Facility'::text AS sold_by_facility,
    t.destination_licence AS buyer_licence,
    t.destination_facility AS buyer,
    f_is_ours(t.destination_licence) AS internal_transfer,
    t.status,
    t.source_row ->> 'Type'::text AS transfer_type,
    a.invoice_number,
    a.total_usd,
    a.payment_status,
        CASE
            WHEN a.invoice_number IS NOT NULL THEN 'matched'::text
            ELSE 'NO APEX INVOICE'::text
        END AS invoice_match,
    /* APPENDED 18 Aug 2026. */
    (upper(btrim(COALESCE(t.destination_licence, ''::text))) LIKE 'MT%') AS is_transport_leg,
    (NOT f_is_ours(t.destination_licence)
     AND public.f_can_be_a_customer(t.destination_licence)) AS counts_as_sale
   FROM metrc_rpt_package_transfers t
     LEFT JOIN LATERAL ( SELECT s.invoice_number,
            s.total_usd,
            s.payment_status
           FROM mv_forensic_sales s
          WHERE NOT s.cancelled AND (s.manifest_number = t.manifest_number OR s.buyer_licence = t.destination_licence AND s.order_date >= (t.received_on - 7) AND s.order_date <= (t.received_on + 7))
          ORDER BY (s.manifest_number = t.manifest_number) DESC, s.order_date
         LIMIT 1) a ON true
  WHERE t.shipped_lb IS NOT NULL AND t.shipped_lb <> 0::numeric AND (upper(btrim(COALESCE(NULLIF(t.source_row ->> 'Origin Lic.'::text, ''::text), t.licence))) IN ( SELECT upper(btrim(company_licenses.license)) AS upper
           FROM company_licenses
          WHERE company_licenses.active));

comment on column public.v_forensic_sold_by_tag.is_transport_leg is
  'True where the destination is a transporter licence (MT). The material is in transit, '
  'not sold. 285 such lines exist, 990.9 lb, all originating from Twisted Growers, and 75 '
  'of those tags also appear on a manifest to the real buyer — counted twice until this '
  'column existed. Agent I, 18 Aug 2026.';

comment on column public.v_forensic_sold_by_tag.counts_as_sale is
  'True only where the destination is neither one of our own licences nor a facility type '
  'that cannot buy — a laboratory or a transporter, per sales_gap_exclusion. ANY SURFACE '
  'REPORTING REVENUE OR POUNDS SOLD MUST FILTER ON THIS. Without it, transport legs and '
  'lab samples are counted as sales: 990.9 lb of transport alone is 4.3% of the 22,795.7 '
  'lb this view reports as leaving. Agent I, 18 Aug 2026.';

comment on view public.v_forensic_sold_by_tag is
  'Every pound that LEFT one of our licences: tag, manifest, buyer, weight, and the Apex '
  'invoice where one matches. Metrc owns tag/manifest/weight; Apex owns the invoice and '
  'the money. LEAVING IS NOT SELLING — a row here may be a transport leg or a laboratory '
  'sample. Filter on counts_as_sale for anything describing revenue or pounds sold. The '
  'rows are deliberately NOT removed: 26 objects read this view and a custody trail '
  'legitimately needs the transport leg. internal_transfer flags movement to our own other '
  'licence. invoice_match = NO APEX INVOICE is an exception to investigate.';;
