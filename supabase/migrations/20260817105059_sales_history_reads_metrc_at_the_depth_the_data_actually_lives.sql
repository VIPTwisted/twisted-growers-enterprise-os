/* v_sales_history READ METRC AT THE WRONG JSON DEPTH AND CALLED 2,582 SHIPMENTS LOST.
 *
 * Found by an agent building the Finance pages, 16 Aug 2026. Measured across all 2,616
 * outgoing transfers before this fix:
 *
 *     field                             shallow raw->>   deep raw->'_delivery'->>
 *     RecipientFacilityLicenseNumber          0                  2,544
 *     ReceivedDateTime                        0                  2,503
 *     ShipmentTypeName                        0                  2,544
 *
 * Metrc returns the transfer envelope at the top level and the DELIVERY under its own
 * object. The sync stores both faithfully. This view read only the top level, where
 * those three keys exist and are null on every single row.
 *
 * The consequence was not a blank column. delivery_status reads:
 *
 *     WHEN raw->>'ReceivedDateTime' IS NOT NULL THEN 'Delivered'
 *     WHEN created_on < CURRENT_DATE - 3      THEN 'NOT CONFIRMED RECEIVED'
 *
 * With the key never found, every shipment older than three days was stamped NOT
 * CONFIRMED RECEIVED. The page has been reporting 2,582 unconfirmed deliveries. The
 * true number is 113. On a licensed operator's sales history that is not a cosmetic
 * defect - it is the platform asserting that essentially nothing we ever shipped was
 * confirmed as arriving.
 *
 * A null that a CASE turns into an accusation. Same shape as everything else found this
 * week: a refused read published as 0 records, an unread role published as "member", an
 * absent IsFinished published as open inventory. Absence became a claim.
 *
 * THE FIX IS COALESCE, NOT A SWAP. Shallow first, then the delivery object. If Metrc
 * ever populates the top level the view uses it without another migration, and nothing
 * assumes the deep path is the only truth. v_customer_directory already does exactly
 * this, so this is bringing a straggler into line with the house pattern rather than
 * inventing one.
 *
 * Column names, order and types are unchanged - create or replace forbids otherwise.
 */

create or replace view public.v_sales_history as
 SELECT created_on AS sold_on,
    to_char(created_on::timestamp with time zone, 'YYYY-MM'::text) AS month,
    manifest_number,
    recipient AS customer,
    coalesce(raw ->> 'RecipientFacilityLicenseNumber',
             raw -> '_delivery' ->> 'RecipientFacilityLicenseNumber') AS customer_license,
    COALESCE((raw ->> 'PackageCount')::numeric,
             (raw -> '_delivery' ->> 'PackageCount')::numeric, 0::numeric) AS packages_sent,
    COALESCE((raw ->> 'ReceivedPackageCount')::numeric,
             (raw -> '_delivery' ->> 'ReceivedPackageCount')::numeric, 0::numeric) AS packages_received,
    coalesce(raw ->> 'ShipmentTypeName',
             raw -> '_delivery' ->> 'ShipmentTypeName') AS shipment_type,
    (coalesce(raw ->> 'ReceivedDateTime',
              raw -> '_delivery' ->> 'ReceivedDateTime'))::date AS received_on,
        CASE
            WHEN coalesce(raw ->> 'ReceivedDateTime',
                          raw -> '_delivery' ->> 'ReceivedDateTime') IS NOT NULL THEN 'Delivered'::text
            WHEN created_on < (CURRENT_DATE - 3) THEN 'NOT CONFIRMED RECEIVED'::text
            ELSE 'In transit'::text
        END AS delivery_status,
        CASE
            WHEN coalesce(raw ->> 'Id', raw -> '_delivery' ->> 'Id') IS NOT NULL
              THEN 'https://ma.metrc.com/reports/transfers/'
                   || coalesce(raw ->> 'Id', raw -> '_delivery' ->> 'Id') || '/manifest'
            ELSE NULL::text
        END AS manifest_link,
    license
   FROM metrc_transfers t
  WHERE direction = 'outgoing'::text
  ORDER BY created_on DESC NULLS LAST;

comment on view public.v_sales_history is
  'Outgoing shipments as a sales history. Every Metrc field is read shallow-first then from raw->''_delivery'', because Metrc returns the transfer envelope at the top level and the DELIVERY - recipient licence, received timestamp, shipment type - under its own object. Reading only the top level made every field null and stamped 2,582 shipments NOT CONFIRMED RECEIVED when the true figure was 113. Never read a Metrc delivery field at one depth only.';;
