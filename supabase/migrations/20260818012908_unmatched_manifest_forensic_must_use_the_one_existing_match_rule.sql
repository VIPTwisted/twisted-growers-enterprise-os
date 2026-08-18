/* The unmatched-manifest forensic must use the ONE existing match rule.
 *
 * My first version matched a manifest to Apex on invoice_number alone and reported 1,263
 * unmatched manifests and 16,210 lb. The authoritative figure from v_forensic_sold_by_tag
 * is 427 manifests and 6,152.2 lb. I had inflated the gap threefold.
 *
 * The existing rule is wider and is the right one:
 *     s.manifest_number = t.manifest_number
 *     OR (s.buyer_licence = t.destination_licence
 *         AND s.order_date between t.received_on - 7 and t.received_on + 7)
 *
 * It already does the buyer-and-date fallback, so 1,066 of the manifests my version called
 * "join broken" were in fact matched. Publishing that would have been the same disease
 * caught three times today — a check reporting sound data as broken teaches people to
 * scroll past it — and it would have created a SECOND definition of "matched" beside the
 * first, which is the countable DDC defect.
 *
 * This version is a strict DRILLDOWN of the existing rule: same source view, same
 * exclusions, so it can never disagree with the headline. It adds only detail — the
 * nearest Apex order for the party, found on licence DIGITS, so a human can confirm or
 * reject a candidate by hand.
 */

create or replace view public.v_unmatched_manifest_forensic as
with unmatched_lines as (
  select s.manifest_number, s.package_tag, s.pounds, s.shipped_on,
         s.buyer, s.buyer_licence, s.transfer_type
    from public.v_forensic_sold_by_tag s
   where s.invoice_match = 'NO APEX INVOICE'
     and not s.internal_transfer
     and coalesce(s.transfer_type,'') not in ('Lab Transfer','Vendor Sample Transfer')
     and s.shipped_on >= date '2025-01-30'
),
per_manifest as (
  select u.manifest_number,
         max(u.shipped_on)                            as shipped_on,
         max(u.buyer)                                 as buyer,
         max(u.buyer_licence)                         as buyer_licence,
         max(u.transfer_type)                         as transfer_type,
         count(distinct u.package_tag)                as tags,
         round(sum(coalesce(u.pounds,0))::numeric, 1) as lb
    from unmatched_lines u
   group by u.manifest_number
),
metrc_money as (
  select t.manifest_number,
         round(sum(coalesce(t.shipper_wholesale_price,0))::numeric, 2) as metrc_declared_usd,
         max(m.invoice_number)                                          as metrc_invoice_number
    from public.metrc_rpt_package_transfers t
    left join public.metrc_rpt_transfer_manifests m on m.manifest_number = t.manifest_number
   group by t.manifest_number
),
apex as (
  select regexp_replace(coalesce(payload->>'buyer_state_license',''), '\D', '', 'g') as digits,
         payload->'buyer'->>'name'       as apex_buyer,
         (payload->>'order_date')::date  as order_date,
         payload->>'invoice_number'      as invoice_number,
         (payload->>'total')::numeric    as total_usd
    from public.apex_raw
   where entity = 'shipping-orders' and coalesce(payload->>'order_date','') <> ''
),
candidate as (
  select distinct on (p.manifest_number)
         p.manifest_number, a.apex_buyer, a.order_date, a.invoice_number, a.total_usd,
         abs(a.order_date - p.shipped_on) as days_apart
    from per_manifest p
    join apex a
      on a.digits = regexp_replace(coalesce(p.buyer_licence,''), '\D', '', 'g')
     and a.digits <> ''
     and abs(a.order_date - p.shipped_on) <= 14
   order by p.manifest_number, abs(a.order_date - p.shipped_on)
)
select p.manifest_number,
       p.shipped_on,
       p.buyer,
       p.buyer_licence,
       p.transfer_type,
       p.tags,
       p.lb,
       mm.metrc_declared_usd,
       mm.metrc_invoice_number,
       case when c.manifest_number is not null
            then 'LICENCE FORMAT — Apex holds an order for this party, found by comparing '
                 || 'licence DIGITS. The standing rule compares the licence exactly and Apex '
                 || 'stores it as free text, so the match is missed.'
            else 'ABSENT FROM APEX — no order for this party within 14 days by any comparison.'
       end as diagnosis,
       c.apex_buyer      as apex_candidate_buyer,
       c.invoice_number  as apex_candidate_invoice,
       c.order_date      as apex_candidate_date,
       c.total_usd       as apex_candidate_usd,
       c.days_apart      as apex_candidate_days_apart,
       case when c.manifest_number is not null
            then 'Confirm the candidate is the same order, then normalise the licence '
                 || 'comparison to digits in the standing match rule. One change closes every '
                 || 'manifest in this group.'
            else 'Check the Apex deal-docs endpoint — marked required, never synced, and by '
                 || 'the owner''s ruling Apex keeps sales manifests and invoices there. If it '
                 || 'is genuinely uninvoiced, that is a billing recovery, not a data fix.'
       end as what_to_do
from per_manifest p
left join metrc_money mm on mm.manifest_number = p.manifest_number
left join candidate  c  on c.manifest_number  = p.manifest_number;

comment on view public.v_unmatched_manifest_forensic is
  'Strict drilldown of the manifests v_forensic_sold_by_tag reports as NO APEX INVOICE, '
  'after 30 Jan 2025, excluding internal moves, lab samples and vendor samples. Uses THAT '
  'view''s match rule and no other, so it can never disagree with the headline — an earlier '
  'version matched on invoice_number alone and inflated the gap from 427 manifests to '
  '1,263. Adds the nearest Apex order for the party on licence DIGITS so a candidate can be '
  'confirmed by hand. Agent I, 18 Aug 2026.';

create or replace view public.v_unmatched_manifest_tags as
select f.manifest_number,
       f.shipped_on,
       f.buyer,
       f.buyer_licence,
       f.diagnosis,
       s.package_tag,
       s.item,
       s.category,
       s.strain,
       round(coalesce(s.pounds,0)::numeric, 3) as lb,
       null::numeric                            as shipped_qty,
       null::text                               as shipped_uom,
       null::numeric                            as received_qty,
       null::numeric                            as metrc_declared_usd,
       s.status,
       f.apex_candidate_invoice,
       f.apex_candidate_usd,
       s.product_line,
       f.apex_candidate_date
from public.v_unmatched_manifest_forensic f
join public.v_forensic_sold_by_tag s
  on s.manifest_number = f.manifest_number
 and s.invoice_match = 'NO APEX INVOICE';

comment on view public.v_unmatched_manifest_tags is
  'Tag-level detail beneath v_unmatched_manifest_forensic — every package on every '
  'unmatched manifest with its weight and the Apex candidate where one exists. The '
  'drilldown for the money gap. shipped_qty, shipped_uom, received_qty and '
  'metrc_declared_usd are held as nulls: they came from the first version''s direct read of '
  'metrc_rpt_package_transfers, and this version sources everything through '
  'v_forensic_sold_by_tag so there is ONE match rule. Rule E1 forbids dropping the columns, '
  'so they are nulled and explained rather than silently carrying a second definition. '
  'Agent I.';

grant select on public.v_unmatched_manifest_forensic, public.v_unmatched_manifest_tags
  to tg_desktop_reader;;
