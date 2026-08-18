/* Use the Metrc invoice number, and drop anyone who cannot be a customer.
 *
 * Owner, 18 Aug 2026: "this makes no sense and should balance easy." He was right on both
 * counts, and two separate things were wrong.
 *
 * 1. THE KEY WAS ALREADY IN THE DATA. Metrc records an invoice number on the manifest —
 *    source_row->>'Inv. Nbr' — and 74 of the 103 genuine unmatched manifests carry one.
 *    Nothing was matching on it. The join tried manifest number, then buyer licence and a
 *    date window, and never the invoice number that both systems hold.
 *
 * 2. LABS AND TRANSPORTERS WERE ON THE LIST. 70 laboratory manifests and every transport
 *    leg. Now excluded through f_can_be_a_customer, which reads sales_gap_exclusion, so
 *    the rule lives in one place with its reason and cannot be quietly re-hardcoded
 *    differently in the next view.
 *
 * Licence comparison is on DIGITS. Apex stores it as free text — RMD705, 283720,
 * mr284843, RMD-445, MR281-637 all appear — and an exact match misses parties that are
 * plainly the same. The digits must still agree: suffix-variant matching without that rule
 * produced 163 false pairs from 4 licences on 9 Aug and must not be repeated.
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
     /* The durable exclusion. transfer_type is null on 70 laboratory manifests, so the
        line above could never have caught them; the destination licence always exists. */
     and public.f_can_be_a_customer(s.buyer_licence)
),
per_manifest as (
  select u.manifest_number,
         max(u.shipped_on) shipped_on, max(u.buyer) buyer, max(u.buyer_licence) buyer_licence,
         max(u.transfer_type) transfer_type,
         count(distinct u.package_tag) tags,
         round(sum(coalesce(u.pounds,0))::numeric,1) lb
    from unmatched_lines u group by u.manifest_number
),
metrc_money as (
  /* Only the UNMATCHED lines. The previous version summed every line on the manifest and
     overstated the money on any manifest that was partly matched. */
  select t.manifest_number,
         round(sum(coalesce(t.shipper_wholesale_price,0))::numeric,2) as metrc_declared_usd,
         max(nullif(btrim(coalesce(t.source_row->>'Inv. Nbr','')),'')) as metrc_invoice_number
    from public.metrc_rpt_package_transfers t
    join unmatched_lines u
      on u.manifest_number = t.manifest_number and u.package_tag = t.package_tag
   group by t.manifest_number
),
apex as (
  select regexp_replace(coalesce(payload->>'buyer_state_license',''),'\D','','g') digits,
         nullif(btrim(coalesce(payload->>'invoice_number','')),'') invoice_number,
         payload->'buyer'->>'name' apex_buyer,
         (payload->>'order_date')::date order_date,
         (payload->>'total')::numeric total_usd
    from public.apex_raw
   where entity='shipping-orders' and coalesce(payload->>'order_date','') <> ''
),
by_invoice as (
  select distinct on (p.manifest_number)
         p.manifest_number, a.apex_buyer, a.order_date, a.invoice_number, a.total_usd,
         abs(a.order_date - p.shipped_on) days_apart, 'invoice number'::text as matched_on
    from per_manifest p
    join metrc_money mm on mm.manifest_number = p.manifest_number
    join apex a on a.invoice_number = mm.metrc_invoice_number
   order by p.manifest_number, abs(a.order_date - p.shipped_on)
),
by_digits as (
  select distinct on (p.manifest_number)
         p.manifest_number, a.apex_buyer, a.order_date, a.invoice_number, a.total_usd,
         abs(a.order_date - p.shipped_on) days_apart, 'licence digits + date'::text as matched_on
    from per_manifest p
    join apex a
      on a.digits = regexp_replace(coalesce(p.buyer_licence,''),'\D','','g')
     and a.digits <> '' and abs(a.order_date - p.shipped_on) <= 14
   where not exists (select 1 from by_invoice bi where bi.manifest_number = p.manifest_number)
   order by p.manifest_number, abs(a.order_date - p.shipped_on)
),
candidate as (select * from by_invoice union all select * from by_digits)
select p.manifest_number, p.shipped_on, p.buyer, p.buyer_licence, p.transfer_type,
       p.tags, p.lb, mm.metrc_declared_usd, mm.metrc_invoice_number,
       case
         when c.matched_on = 'invoice number'
           then 'INVOICE NUMBER MATCHES — Metrc and Apex hold the same invoice. The standing '
                || 'rule never compared it.'
         when c.matched_on is not null
           then 'LICENCE FORMAT — Apex holds an order for this party, found on licence '
                || 'DIGITS. The standing rule compares the licence exactly and Apex stores '
                || 'it as free text.'
         else 'ABSENT FROM APEX — no order for this party by invoice number, licence digits '
              || 'or date. This one is genuinely not in Apex.'
       end as diagnosis,
       c.apex_buyer apex_candidate_buyer, c.invoice_number apex_candidate_invoice,
       c.order_date apex_candidate_date, c.total_usd apex_candidate_usd,
       c.days_apart apex_candidate_days_apart,
       case when c.matched_on is not null
            then 'Confirm and repair the standing match rule: add the Metrc invoice number '
                 || 'as the first key and compare licences on digits. One change closes '
                 || 'every manifest matched this way.'
            else 'Not in Apex by any key. Check the deal-docs endpoint — marked required, '
                 || 'never synced. If genuinely uninvoiced, that is a billing recovery.'
       end as what_to_do,
       c.matched_on
from per_manifest p
left join metrc_money mm on mm.manifest_number = p.manifest_number
left join candidate  c  on c.manifest_number  = p.manifest_number;

comment on view public.v_unmatched_manifest_forensic is
  'Outbound manifests after 30 Jan 2025 with no Apex invoice, EXCLUDING destinations that '
  'cannot be a customer (f_can_be_a_customer: laboratories and transporters). Matches on '
  'the Metrc invoice number FIRST — 74 manifests carry one and nothing was reading it — '
  'then on licence digits and date. metrc_declared_usd counts only the unmatched lines; an '
  'earlier version summed the whole manifest and overstated it. Agent I, 18 Aug 2026.';;
