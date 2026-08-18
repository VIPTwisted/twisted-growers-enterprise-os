/* The unmatched manifest gap, with full forensic detail.
 *
 * AUDIT RESULT, 18 Aug 2026. The physical seed-to-sale chain is intact end to end:
 *   plant -> harvest                 99.8%
 *   package -> parent                19,494 of 19,559; the 42 without one have none in Metrc either
 *   every MOVED tag on a manifest    100%  (owner asserted it, verified: 0 exceptions)
 *   finished packages accounted      2,539 of 2,539 — 2,358 repackaged into children,
 *                                    874 adjusted, 2 opened and closed empty the same day
 *   finished but still holding stock  0
 *
 * The ONE genuine break is the money side: outbound Metrc manifests with no matching Apex
 * invoice. 6,152.2 lb across 3,968 tags on 427 manifests, shipped after 30 Jan 2025 when
 * Metrc began carrying an invoice number and matching first became possible.
 *
 * That figure is already net of everything legitimately uninvoiced:
 *   internal MC<->MP affiliated moves   10,190.5 lb   not sales
 *   laboratory samples                       4.2 lb   not sales
 *   vendor samples                           0.2 lb   not sales
 *   shipped before 30 Jan 2025            2,665.6 lb   Metrc carried no invoice number
 *
 * AND IT IS TWO PROBLEMS, NOT ONE. Testing each manifest against Apex by buyer licence
 * digits and ship date rather than by invoice number:
 *   253 manifests   Apex HAS an order for that buyer within 14 days -> the JOIN is broken
 *   174 manifests   no Apex order near that date at all             -> ABSENT from Apex
 *
 * The join fails because Apex stores the licence as free text — RMD705, 283720, mr284843,
 * RMD-445, MR281-637 all appear — so an exact-string match misses parties that are plainly
 * the same. Normalising to digits is what surfaced the 253. The digits must still agree:
 * suffix-variant matching without that rule produced 163 false pairs from 4 licences on
 * 9 Aug and must not be repeated.
 *
 * These views exist so the gap is WORKABLE rather than merely counted. One row per
 * manifest with its Apex candidate named, and one row per tag beneath it.
 */

create or replace view public.v_unmatched_manifest_forensic as
with shipped as (
  select t.manifest_number,
         max(t.destination_licence)                     as buyer_licence,
         max(t.destination_facility)                    as buyer,
         max(t.received_on)                             as shipped_on,
         count(distinct t.package_tag)                  as tags,
         round(sum(coalesce(t.shipped_lb, 0))::numeric, 1) as lb,
         round(sum(coalesce(t.shipper_wholesale_price, 0))::numeric, 2) as metrc_declared_usd,
         max(m.transfer_type)                           as transfer_type,
         max(m.invoice_number)                          as metrc_invoice_number
    from public.metrc_rpt_package_transfers t
    left join public.metrc_rpt_transfer_manifests m on m.manifest_number = t.manifest_number
   where coalesce(t.destination_licence,'') <> ''
     and not public.f_is_ours(t.destination_licence)
     and coalesce(m.transfer_type,'') not in ('Lab Transfer','Vendor Sample Transfer')
     and t.received_on >= date '2025-01-30'
   group by t.manifest_number
),
apex as (
  select regexp_replace(coalesce(payload->>'buyer_state_license',''), '\D', '', 'g') as digits,
         payload->'buyer'->>'name'        as apex_buyer,
         (payload->>'order_date')::date   as order_date,
         payload->>'invoice_number'       as invoice_number,
         (payload->>'total')::numeric     as total_usd,
         payload->>'id'                   as apex_order_id
    from public.apex_raw
   where entity = 'shipping-orders'
     and coalesce(payload->>'order_date','') <> ''
),
matched_by_invoice as (
  select distinct s.manifest_number
    from shipped s
    join apex a on a.invoice_number = s.metrc_invoice_number
   where coalesce(s.metrc_invoice_number,'') <> ''
),
unmatched as (
  select s.* from shipped s
   where not exists (select 1 from matched_by_invoice mi where mi.manifest_number = s.manifest_number)
),
/* The nearest Apex order for the same party. Digits must agree — a licence whose digits
   differ is a different company however similar the prefix looks. */
candidate as (
  select distinct on (u.manifest_number)
         u.manifest_number, a.apex_buyer, a.order_date, a.invoice_number,
         a.total_usd, a.apex_order_id, abs(a.order_date - u.shipped_on) as days_apart
    from unmatched u
    join apex a
      on a.digits = regexp_replace(coalesce(u.buyer_licence,''), '\D', '', 'g')
     and a.digits <> ''
     and abs(a.order_date - u.shipped_on) <= 14
   order by u.manifest_number, abs(a.order_date - u.shipped_on)
)
select u.manifest_number,
       u.shipped_on,
       u.buyer,
       u.buyer_licence,
       u.transfer_type,
       u.tags,
       u.lb,
       u.metrc_declared_usd,
       u.metrc_invoice_number,
       case when c.manifest_number is not null
            then 'JOIN BROKEN — Apex holds an order for this party'
            else 'ABSENT FROM APEX — no order for this party near this date' end as diagnosis,
       c.apex_buyer          as apex_candidate_buyer,
       c.invoice_number      as apex_candidate_invoice,
       c.order_date          as apex_candidate_date,
       c.total_usd           as apex_candidate_usd,
       c.days_apart          as apex_candidate_days_apart,
       case when c.manifest_number is not null
            then 'Confirm this is the same order, then repair the join. Apex stores the '
                 || 'licence as free text so an exact string match fails; compare on digits.'
            else 'No Apex order for this party within 14 days. Check the deal-docs endpoint, '
                 || 'which is marked required and has never synced — Apex keeps sales '
                 || 'manifests and invoices there. If it is genuinely uninvoiced, that is a '
                 || 'billing recovery, not a data fix.' end as what_to_do
from unmatched u
left join candidate c on c.manifest_number = u.manifest_number;

comment on view public.v_unmatched_manifest_forensic is
  'One row per outbound Metrc manifest after 30 Jan 2025 with no matching Apex invoice, '
  'with the nearest Apex order for the same party named so it can be confirmed by hand. '
  'Excludes internal moves, lab samples and vendor samples, all of which are legitimately '
  'uninvoiced. diagnosis separates a BROKEN JOIN — Apex has the order — from genuinely '
  'ABSENT, because they need different fixes. Licence comparison is on DIGITS: Apex stores '
  'it as free text (RMD705, 283720, mr284843, MR281-637) and an exact match misses parties '
  'that are plainly the same, but the digits must still agree or it invents pairs. '
  'Agent I, 18 Aug 2026.';

create or replace view public.v_unmatched_manifest_tags as
select f.manifest_number,
       f.shipped_on,
       f.buyer,
       f.buyer_licence,
       f.diagnosis,
       t.package_tag,
       t.item,
       t.category,
       t.strain,
       round(coalesce(t.shipped_lb,0)::numeric, 3)              as lb,
       t.shipped_qty,
       t.shipped_uom,
       t.received_qty,
       round(coalesce(t.shipper_wholesale_price,0)::numeric, 2) as metrc_declared_usd,
       t.status,
       f.apex_candidate_invoice,
       f.apex_candidate_usd
from public.v_unmatched_manifest_forensic f
join public.metrc_rpt_package_transfers t on t.manifest_number = f.manifest_number;

comment on view public.v_unmatched_manifest_tags is
  'Tag-level detail beneath v_unmatched_manifest_forensic — every package on every '
  'unmatched manifest, with its weight, its Metrc declared price and the Apex invoice '
  'candidate where one exists. This is the drilldown for the money gap. Agent I.';

grant select on public.v_unmatched_manifest_forensic, public.v_unmatched_manifest_tags
  to tg_desktop_reader;;
