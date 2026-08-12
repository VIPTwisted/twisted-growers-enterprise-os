-- Agent G, 10 Aug 2026. THE JOIN, WITHOUT ASKING ANYONE TO CHANGE HOW THEY WORK.
--
-- Both briefs said the join was exact via metrc_package_label on the order line and
-- manifest_number on the order. Measured against the first real pull: 8 of 13,135 lines and
-- 0 of 1,739 orders. The fields exist and Apex returns them empty. The owner ruled on
-- 10 Aug 2026 that operators will NOT be asked to start filling them.
--
-- THE KEY THEY ARE ALREADY FILLING. metrc_rpt_wholesale carries invoice_number, and Apex
-- carries invoice_number on all 1,739 orders. Apex writes "TWISTE-1737"; the operator types
-- "1737" into Metrc. Same identifier, two renderings - 966 of Metrc's 1,001 distinct values
-- are digits only. Normalising that is NOT fuzzy matching, any more than resolving
-- "Nova Farms LLC" against "Nova Farms, LLC" by licence number is: it is one key written two
-- ways. Raw string equality finds 7 matches. Digit normalisation finds 975.
--
-- MEASURED, 10 Aug 2026:
--   975 of 1,739 Apex orders reach Metrc; 954 of those are live orders
--   26 of 1,001 Metrc invoice numbers have NO Apex order  -> 97.4% coverage of the Metrc side
--   1,202 manifests and 12,565 distinct 24-character package tags reached
--   1 Apex invoice number is duplicated across orders and is flagged, never silently picked
--
-- WHAT THIS IS NOT. It is not the exact key the brief assumed, and it must never be presented
-- as one. It is an operator-entered free-text field on the Metrc side, so it can be mistyped,
-- and the view says so on every row via match_basis. Nothing here rounds, name-matches or
-- drops a row that will not tie.
--
-- UNDO: drop view v_apex_metrc_coverage; drop view v_apex_order_metrc_link;

create or replace view v_apex_order_metrc_link as
with apex as (
  select r.apex_id                                                    as apex_order_id,
         btrim(r.payload->>'invoice_number')                          as invoice_number,
         nullif(regexp_replace(r.payload->>'invoice_number','\D','','g'),'') as invoice_digits,
         nullif(r.payload->>'order_date','')::date                    as order_date,
         nullif(r.payload->>'delivery_date','')::date                 as delivery_date,
         nullif(btrim(r.payload->>'buyer_state_license'),'')          as buyer_state_license,
         nullif(r.payload->>'buyer_id','')                            as apex_buyer_id,
         /* _raw is MINOR UNITS. Never divide by a literal here - the factor is a row, and
            verification_checks.apex_money_unit re-proves it against the display twin. */
         round((nullif(r.payload->>'total_raw','')::numeric)
               / (select value from conversion_factors where key='apex_money_raw_minor_units'), 2) as total_dollars,
         (r.payload->>'cancelled') not in ('','0','false')            as cancelled,
         jsonb_array_length(coalesce(r.payload->'items','[]'::jsonb)) as line_count,
         nullif(btrim(r.payload->>'split_from_order_id'),'')          as split_from_order_id
  from apex_raw r
  where r.entity = 'shipping-orders'
),
dupes as (
  select invoice_digits from apex where invoice_digits is not null
  group by 1 having count(distinct apex_order_id) > 1
),
bridge as (
  select nullif(regexp_replace(w.invoice_number,'\D','','g'),'') as invoice_digits,
         count(distinct w.manifest_number)                       as metrc_manifests,
         count(*)                                                as metrc_wholesale_rows,
         count(*) filter (where w.voided)                        as voided_rows,
         min(w.created_on)                                       as first_metrc_date,
         max(w.created_on)                                       as last_metrc_date,
         string_agg(distinct w.destination_licence, ', ')        as metrc_destination_licences
  from metrc_rpt_wholesale w
  where nullif(btrim(w.invoice_number),'') is not null
  group by 1
),
tags as (
  select nullif(regexp_replace(w.invoice_number,'\D','','g'),'') as invoice_digits,
         count(distinct pt.package_tag) as package_tags
  from metrc_rpt_wholesale w
  join metrc_rpt_package_transfers pt on pt.manifest_number = w.manifest_number
  where nullif(btrim(w.invoice_number),'') is not null
  group by 1
)
select a.*,
       b.metrc_manifests,
       b.metrc_wholesale_rows,
       b.voided_rows,
       b.metrc_destination_licences,
       b.first_metrc_date,
       b.last_metrc_date,
       coalesce(t.package_tags, 0) as package_tags,
       (d.invoice_digits is not null) as invoice_number_is_ambiguous,
       /* THE STATUS IS THE POINT. An orphan with a named reason is reconciled; an orphan
          without one stays open. These four are NOT the same thing and must never be summed. */
       case
         when a.invoice_digits is null                    then 'NO INVOICE NUMBER'
         when d.invoice_digits is not null                then 'AMBIGUOUS INVOICE NUMBER'
         when b.invoice_digits is not null                then 'MATCHED'
         when a.cancelled                                 then 'EXPLAINED — cancelled'
         when a.line_count = 0                            then 'EXPLAINED — no line items'
         when coalesce(a.total_dollars, 0) = 0            then 'EXPLAINED — zero value'
         else 'APEX ONLY — UNEXPLAINED'
       end as link_status,
       case when b.invoice_digits is not null
            then 'invoice number, digits normalised (Apex "TWISTE-1737" = Metrc "1737"). '
                 || 'Operator-entered free text on the Metrc side, so a mistype breaks it.'
       end as match_basis
from apex a
left join bridge b on b.invoice_digits = a.invoice_digits
left join tags   t on t.invoice_digits = a.invoice_digits
left join dupes  d on d.invoice_digits = a.invoice_digits;

alter view v_apex_order_metrc_link set (security_invoker = on);

comment on view v_apex_order_metrc_link is
  'Every Apex shipping order and the Metrc record it ties to, joined on the INVOICE NUMBER with '
  'digits normalised - Apex writes "TWISTE-1737", the operator types "1737" into Metrc. '
  'Raw equality matches 7 orders; normalised matches 975. This is NOT the exact package-tag join '
  'the brief assumed (8 of 13,135 lines carry a tag), and must never be presented as one: the '
  'Metrc side is operator-entered free text and match_basis says so on every matched row. '
  'link_status separates a MATCHED row from an EXPLAINED orphan from an UNEXPLAINED one, because '
  'those are three different facts and summing them hides the only one that needs a person.';

create or replace view v_apex_metrc_coverage as
select link_status,
       count(*)                                    as orders,
       round(sum(coalesce(total_dollars,0)), 2)    as dollars,
       sum(coalesce(metrc_manifests,0))            as manifests,
       sum(coalesce(package_tags,0))               as package_tags,
       round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 1) as pct_of_orders
from v_apex_order_metrc_link
group by 1;

alter view v_apex_metrc_coverage set (security_invoker = on);

comment on view v_apex_metrc_coverage is
  'Apex-to-Metrc coverage as a MEASURED percentage with every category named. Read '
  'APEX ONLY — UNEXPLAINED as the open work: that is the only bucket without a reason. '
  'Do not add the buckets together into a single "coverage %" - a cancelled order and an '
  'unexplained one are not the same miss, and the owner''s 100% standard means 100% ACCOUNTED '
  'FOR, not 100% matched.';;
