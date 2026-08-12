/* A TRANSPORTER DESTINATION IS NOT A CUSTOMER
   -------------------------------------------
   Eagle Eyes Transport Solutions (MT281320) and MMM Transport (MT281556) are
   transport and storage facilities, confirmed by the owner. Forty manifests to
   them were classified 'Customer sale' and counted as revenue.

   Rule-based, not a list of names (rule G1): f_is_transporter() resolves any
   licence through licence_type_prefix, so a transporter licence appearing in
   Metrc tomorrow classifies correctly without anyone remembering to add it.

   The movement STAYS VISIBLE as 'Storage/transport movement'. Nothing is hidden
   - product genuinely moved, and hiding it would break the chain of custody. It
   simply is not revenue.

   WHY THE DESTINATION LICENCE COMES FROM THE REPORT IMPORT: metrc_transfers.raw
   carries a RecipientFacilityLicenseNumber key, but it is NULL on all forty of
   these - the API sync never populated it. metrc_rpt_package_transfers does hold
   it, and resolves 2,492 of 2,690 manifests. The 198 it cannot resolve keep
   their existing classification rather than being guessed at, and
   destination_licence is exposed so that gap is visible instead of silent.

   create or replace - the view is never dropped (rule E1). Column list and order
   are unchanged; three columns are APPENDED so the three dependent views
   (v_customers, v_customer_directory, v_sales_history_monthly) keep working
   untouched. */

create or replace view v_manifest_ledger as
 WITH per_manifest AS (
         SELECT metrc_transfers.manifest_number,
            min(metrc_transfers.created_on) AS created_on,
            array_agg(DISTINCT metrc_transfers.license ORDER BY metrc_transfers.license) AS licences,
            array_agg(DISTINCT metrc_transfers.direction ORDER BY metrc_transfers.direction) AS directions,
            (array_agg(metrc_transfers.shipper ORDER BY metrc_transfers.direction))[1] AS shipper,
            (array_agg(metrc_transfers.recipient ORDER BY (metrc_transfers.recipient IS NULL), metrc_transfers.direction))[1] AS recipient,
            count(*) AS row_count,
            (array_agg(metrc_transfers.raw ORDER BY (metrc_transfers.recipient IS NULL), metrc_transfers.direction))[1] AS raw
           FROM metrc_transfers
          GROUP BY metrc_transfers.manifest_number
        ), dest AS (
         /* where the goods actually went, from the report import */
         SELECT pt.manifest_number, max(pt.destination_licence) AS destination_licence
           FROM metrc_rpt_package_transfers pt
          WHERE pt.destination_licence IS NOT NULL
          GROUP BY pt.manifest_number
        ), typed AS (
         SELECT m.manifest_number,
            m.created_on,
            m.licences,
            m.directions,
            m.shipper,
            m.recipient,
            m.row_count,
            m.raw,
            d.destination_licence,
            f_facility_type(d.destination_licence) AS destination_type,
            coalesce(f_is_transporter(d.destination_licence), false) AS to_transporter,
            COALESCE(m.raw ->> 'ShipmentTypeName'::text, (m.raw -> '_delivery'::text) ->> 'ShipmentTypeName'::text) AS shipment_type,
            COALESCE(m.shipper, ''::text) ~~* '%twisted%'::text AS we_shipped,
            COALESCE(m.recipient, ''::text) ~~* '%twisted%'::text AS we_received
           FROM per_manifest m
           LEFT JOIN dest d ON d.manifest_number = m.manifest_number
        )
 SELECT manifest_number,
    created_on,
    licences,
    directions,
    shipper,
    recipient,
    row_count,
    shipment_type,
        CASE
            WHEN array_length(licences, 1) > 1 OR we_shipped AND we_received THEN 'Internal move'::text
            WHEN we_received AND NOT we_shipped THEN 'Inbound - bought in'::text
            WHEN shipment_type ~~* '%lab%'::text THEN 'Laboratory sample'::text
            WHEN shipment_type ~~* '%vendor sample%'::text THEN 'Vendor sample'::text
            WHEN shipment_type ~~* '%patient%'::text THEN 'Patient supply'::text
            /* storage and haulage - real movement, not revenue */
            WHEN to_transporter THEN 'Storage/transport movement'::text
            ELSE 'Customer sale'::text
        END AS movement,
        CASE
            WHEN array_length(licences, 1) > 1 THEN 'Both'::text
            ELSE f_operation(licences[1])
        END AS operation,
    licences[1] AS licence,
    array_length(licences, 1) = 1 AND NOT we_received
      AND COALESCE(shipment_type, ''::text) !~~* '%lab%'::text
      AND COALESCE(shipment_type, ''::text) !~~* '%vendor sample%'::text
      AND COALESCE(shipment_type, ''::text) !~~* '%patient%'::text
      AND NOT to_transporter                                   AS is_customer_sale,
    we_received AND NOT we_shipped AS is_inbound_purchase,
    ( SELECT count(*) AS count
           FROM metrc_documents d
          WHERE d.manifest_number = t.manifest_number AND d.storage_path IS NOT NULL) AS documents,
    raw,
    (((((((manifest_number || ' '::text) || COALESCE(recipient, ''::text)) || ' '::text) || COALESCE(shipper, ''::text)) || ' '::text) || array_to_string(licences, ' '::text)) || ' '::text) || COALESCE(shipment_type, ''::text) AS search_text,
    /* appended, so dependents are unaffected */
    destination_licence,
    destination_type,
    to_transporter
   FROM typed t;

comment on view v_manifest_ledger is
  'Manifest movements. A Transporter destination is storage or haulage, never a customer sale - resolved by licence prefix, not by name. destination_licence is null for 198 manifests the report import does not cover; those keep their prior classification rather than being guessed.';;
