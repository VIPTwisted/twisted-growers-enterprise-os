/* ═══════════════════════════════════════════════════════════════════════════
   C · A ZERO INVOICE TOTAL IS NOT A ZERO ORDER
   Branch `claude-c/zero-total-nonzero-lines`, 28 August 2026.
   NOT FOR MAIN. Owner holds the merge and the apply.

   Found while verifying the status groups, not by looking for it: the group
   `EXPLAINED — zero value` was explaining away $130,111.26.

   `link_status` decided that branch on `total_dollars` alone. Four orders carry
   an invoice total of zero and line values that are emphatically not zero:

     Twiste-166   19 Jan 2025   16 lines   $129,285.00   buyer MP281909
     Twiste-88    30 Oct 2024   10 lines      $642.21
     Twiste-896    5 Mar 2026    8 lines      $184.00
     Twiste-93     6 Nov 2024    2 lines        $0.05

   None is cancelled, all have lines, none matched a Metrc manifest. The word
   EXPLAINED closed them. Nothing about them is explained.

   WHAT CHANGES. The branch now requires BOTH the total and the subtotal to be
   zero before it says "zero value". A total of zero over non-zero lines gets
   its own status that says exactly that, and it is an EXCEPTION, not an
   explanation.

   WHAT DOES NOT CHANGE. No order is forced to MATCHED. The 143 orders with no
   line items keep their own status — that branch fires earlier and is untouched.
   Fifteen orders in total have a zero invoice total over non-zero lines, but
   eleven of them are already caught earlier as cancelled, as having no line
   items, or as matched to a manifest; only the four that reach this branch move.

   THE OWN-LICENCE NOTE IS A FLAG, NOT A CLOSE. Twiste-166's buyer is one of our
   own licences, which reads as an internal movement written up as an order. That
   is recorded in `match_quality`, where it informs the reader, and never in
   `link_status`, where it would close the exception. It is read through
   `f_is_ours()` rather than a typed licence number, so it follows
   `company_licenses` and applies to all 14 own-licence orders alike rather than
   being special-cased to one invoice.

   Columns, names, types and order are unchanged — 30 columns, as replaced.
   `create or replace view`, never `drop … cascade`.
   ═══════════════════════════════════════════════════════════════════════════ */

begin;

create or replace view v_apex_order_metrc_link as
with apex as (
  select
    r.apex_id as apex_order_id,
    btrim(r.payload ->> 'invoice_number') as invoice_number,
    nullif(regexp_replace(r.payload ->> 'invoice_number', '\D', '', 'g'), '') as invoice_digits,
    nullif(r.payload ->> 'order_date', '')::date as order_date,
    nullif(r.payload ->> 'delivery_date', '')::date as delivery_date,
    nullif(btrim(r.payload ->> 'buyer_state_license'), '') as buyer_state_license,
    nullif(regexp_replace(r.payload ->> 'buyer_state_license', '\D', '', 'g'), '') as buyer_licence_digits,
    nullif(r.payload ->> 'buyer_id', '') as apex_buyer_id,
    round(nullif(r.payload ->> 'total_raw', '')::numeric
          / (select value from conversion_factors where key = 'apex_money_raw_minor_units'), 2) as total_dollars,
    round(nullif(r.payload ->> 'subtotal_raw', '')::numeric
          / (select value from conversion_factors where key = 'apex_money_raw_minor_units'), 2) as subtotal_dollars,
    (r.payload ->> 'cancelled') <> all (array['', '0', 'false']) as cancelled,
    jsonb_array_length(coalesce(r.payload -> 'items', '[]'::jsonb)) as line_count,
    nullif(btrim(r.payload ->> 'split_from_order_id'), '') as split_from_order_id
  from apex_raw r
  where r.entity = 'shipping-orders'
),
dupes as (
  select invoice_digits from apex where invoice_digits is not null
  group by invoice_digits having count(distinct apex_order_id) > 1
),
w as (
  select
    nullif(regexp_replace(x.invoice_number, '\D', '', 'g'), '') as invoice_digits,
    nullif(regexp_replace(x.destination_licence, '\D', '', 'g'), '') as dest_licence_digits,
    x.manifest_number, x.destination_licence, x.amount, x.voided, x.created_on
  from metrc_rpt_wholesale x
  where nullif(btrim(x.invoice_number), '') is not null
),
bridge as (
  select
    w.invoice_digits,
    count(distinct w.manifest_number) as metrc_manifests,
    count(*) as metrc_wholesale_rows,
    count(*) filter (where w.voided) as voided_rows,
    min(w.created_on) as first_metrc_date,
    max(w.created_on) as last_metrc_date,
    string_agg(distinct w.destination_licence, ', ') as metrc_destination_licences,
    round(sum(w.amount) filter (
      where not w.voided and w.amount >= f_rule('apex_metrc_placeholder_line_floor_usd')), 2) as declared_any_buyer
  from w group by w.invoice_digits
),
tags as (
  select
    nullif(regexp_replace(x.invoice_number, '\D', '', 'g'), '') as invoice_digits,
    count(distinct pt.package_tag) as package_tags
  from metrc_rpt_wholesale x
  join metrc_rpt_package_transfers pt on pt.manifest_number = x.manifest_number
  where nullif(btrim(x.invoice_number), '') is not null
  group by 1
),
buyer as (
  select
    a.apex_order_id,
    count(distinct w.manifest_number)
      filter (where w.dest_licence_digits is not distinct from a.buyer_licence_digits) as buyer_confirmed_manifests,
    count(distinct w.manifest_number)
      filter (where w.dest_licence_digits is distinct from a.buyer_licence_digits) as foreign_manifests,
    round(sum(w.amount) filter (
      where not w.voided
        and w.amount >= f_rule('apex_metrc_placeholder_line_floor_usd')
        and w.dest_licence_digits is not distinct from a.buyer_licence_digits), 2) as declared_buyer
  from apex a
  join w on w.invoice_digits = a.invoice_digits
  where a.buyer_licence_digits is not null
  group by a.apex_order_id
),
j as (
  select
    a.*,
    b.metrc_manifests, b.metrc_wholesale_rows, b.voided_rows,
    b.metrc_destination_licences, b.first_metrc_date, b.last_metrc_date,
    b.declared_any_buyer,
    coalesce(t.package_tags, 0::bigint) as package_tags,
    d.invoice_digits is not null as invoice_number_is_ambiguous,
    coalesce(y.buyer_confirmed_manifests, 0::bigint) as buyer_confirmed_manifests,
    coalesce(y.foreign_manifests, 0::bigint) as foreign_manifests,
    y.declared_buyer,
    f_rule('apex_metrc_rounding_tolerance_usd') as tol
  from apex a
  left join bridge b on b.invoice_digits = a.invoice_digits
  left join tags   t on t.invoice_digits = a.invoice_digits
  left join dupes  d on d.invoice_digits = a.invoice_digits
  left join buyer  y on y.apex_order_id  = a.apex_order_id
),
k as (
  select
    j.*,
    (j.declared_buyer is not null and abs(j.subtotal_dollars - j.declared_buyer) <= j.tol) as buyer_money_agrees,
    (j.declared_any_buyer is not null and abs(j.subtotal_dollars - j.declared_any_buyer) <= j.tol) as key_money_agrees
  from j
)
select
  k.apex_order_id,
  k.invoice_number,
  k.invoice_digits,
  k.order_date,
  k.delivery_date,
  k.buyer_state_license,
  k.apex_buyer_id,
  k.total_dollars,
  k.cancelled,
  k.line_count,
  k.split_from_order_id,
  k.metrc_manifests,
  k.metrc_wholesale_rows,
  k.voided_rows,
  k.metrc_destination_licences,
  k.first_metrc_date,
  k.last_metrc_date,
  k.package_tags,
  k.invoice_number_is_ambiguous,
  case
    when k.invoice_digits is null then 'NO INVOICE NUMBER'
    when k.invoice_number_is_ambiguous then 'AMBIGUOUS INVOICE NUMBER'
    when k.metrc_manifests is not null then
      case
        when k.buyer_licence_digits is null then 'MATCHED'
        when k.foreign_manifests = 0 and k.buyer_money_agrees then 'MATCHED'
        when k.foreign_manifests > 0 and k.key_money_agrees then 'MATCHED'
        when k.foreign_manifests > 0 and k.buyer_money_agrees
          then 'EXCEPTION — FALSE MATCH ON INVOICE KEY, money reconciles'
        when k.foreign_manifests > 0
          then 'EXCEPTION — FALSE MATCH ON INVOICE KEY, money differs'
        else 'EXCEPTION — VALUE DIFFERS'
      end
    when k.cancelled then 'EXPLAINED — cancelled'
    when k.line_count = 0 then 'EXPLAINED — no line items'
    /* SPLIT 28 Aug 2026, owner ruling. This branch used to fire on the invoice
       total alone and close four orders as "zero value" while their LINES
       carried $130,111.26 between them — Twiste-166 alone had sixteen lines
       worth $129,285.00. A total of zero and a line value of zero are two
       different facts and only the first was being read. */
    when coalesce(k.total_dollars, 0) = 0 and coalesce(k.subtotal_dollars, 0) = 0
      then 'EXPLAINED — zero value'
    when coalesce(k.total_dollars, 0) = 0
      then 'EXCEPTION — INVOICE TOTAL IS ZERO, THE LINE VALUES ARE NOT'
    when k.order_date < '2025-01-30'::date then 'UNMATCHED — PRE-KEY, UNMATCHABLE BY CONSTRUCTION'
    else 'APEX ONLY — UNEXPLAINED'
  end as link_status,
  case
    when k.metrc_manifests is null then null
    else 'invoice number digits (Apex "TWISTE-1737" = Metrc "1737") AND buyer state licence digits '
         '(Apex "RMD705" = Metrc "RMD705-P"). Both sides of both keys are normalised. '
         'Metrc''s invoice field is operator-entered free text, so the invoice half alone is not '
         'sufficient — bare numbers typed into it collide with real invoice numbers.'
  end as match_basis,
  k.buyer_licence_digits,
  k.buyer_confirmed_manifests,
  k.foreign_manifests,
  k.subtotal_dollars as apex_subtotal_usd,
  k.declared_buyer as metrc_declared_buyer_usd,
  k.declared_any_buyer as metrc_declared_any_buyer_usd,
  case when k.declared_buyer is null then null
       else round(k.subtotal_dollars - k.declared_buyer, 2) end as value_gap_usd,
  case
    /* A FLAG, NOT A CLOSE — owner ruling, 28 Aug 2026. An order whose buyer is
       one of OUR OWN licences reads like an internal movement written up as a
       sale. That is worth saying on the row; it is not grounds for closing the
       exception, so it sits in match_quality and never in link_status. Read
       through f_is_ours(), never against a typed licence number. */
    when k.buyer_state_license is not null and f_is_ours(k.buyer_state_license)
      then 'BUYER IS ONE OF OUR OWN LICENCES — reads as an internal movement written as an order. Flagged, not closed.'
    when k.metrc_manifests is null then null
    when k.buyer_licence_digits is null then 'NO BUYER LICENCE ON THE ORDER — buyer could not be tested'
    when k.foreign_manifests = 0 then 'BUYER CONFIRMED'
    when k.key_money_agrees then 'LICENCE ALIAS — money agrees in full, buyer licence written differently; needs a memo'
    else 'BUYER DIFFERS — this invoice key also attracted manifests to other companies'
  end as match_quality,
  case
    when k.order_date is null then 'ORDER DATE NOT RECORDED'
    when k.order_date < '2025-01-30'::date then 'PRE-KEY — Metrc carried no invoice number until 2025-01-30'
    else 'KEYED ERA'
  end as era
from k;

comment on view v_apex_order_metrc_link is
  'One row per Apex shipping order, linked to Metrc on invoice-number digits AND buyer state-licence digits. link_status keeps the exact string MATCHED because two live pages filter on it. A zero invoice total no longer closes an order as "zero value" unless the line values are zero too — that branch was explaining away $130,111.26 across four orders (28 Aug 2026). An own-licence buyer is flagged in match_quality and never closes an exception.';

commit;
