/* C · APEX <-> METRC RECONCILIATION — THE BUYER IS PART OF THE KEY
   Both bridges matched on invoice-number digits alone and never checked that the
   manifest went to the buyer named on the order. Metrc's invoice field is
   operator-typed free text; the literal "303" appears on 124 wholesale rows
   across 14 manifests to 10 different companies, all matched to one $1,800 order.
   197 invoice keys carrying $1,146,044 matched an order whose buyer is a
   different company — 76% of the reported money gap.
   Licence comparison is on DIGITS: RMD705 = RMD705-P, MRN283033 = MR283033.
   Buyer agreement is a match_quality FLAG, not a filter. link_status keeps the
   exact string MATCHED because fin-orders.jsx:311 and fin-sales-history.jsx:503
   filter on it. Columns are APPENDED, never reordered. */

insert into conversion_factors
  (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
values (
  'apex_metrc_placeholder_line_floor_usd', 1.00, 'USD',
  'Metrc wholesale placeholder line floor',
  'A Metrc wholesale line priced below this is treated as a placeholder rather than as money. Metrc requires a price on every transfer line, so lines carrying no real commercial value are entered at zero or a penny.',
  'Replicates, without changing, the 1.00 floor hardcoded in v_manifest_reconciliation before 26 Aug 2026. Not an owner-set figure — a restatement of existing behaviour, flagged unconfirmed so the owner is asked rather than assumed.',
  'Claude C, branch claude-c/apex-recon-buyer-key',
  'unconfirmed',
  'Carried over from code. Needs an owner ruling on whether a $1.00 line is ever real money.'
)
on conflict (key) do nothing;

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
    when coalesce(k.total_dollars, 0) = 0 then 'EXPLAINED — zero value'
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
  'One row per Apex shipping order, linked to Metrc on invoice-number digits AND buyer state-licence digits. The buyer half was added 26 Aug 2026 after 197 invoice keys were found matching manifests to the wrong company, accounting for 76% of the reported money gap. link_status keeps the exact string MATCHED because two live pages filter on it; match_quality carries the new detail. apex_subtotal_usd is the basis for value_gap_usd (owner ruling); total_dollars is what the customer owes and is not the Metrc comparison figure.';

create or replace view v_manifest_reconciliation as
with man as (
  select distinct on (t.manifest_number)
    t.manifest_number, t.created_on, t.received_on, t.destination_licence, t.destination_facility
  from metrc_rpt_transfer_manifests t
  where t.direction = 'outbound'
  order by t.manifest_number, t.created_on
),
kind as (
  select
    m.*,
    case
      when m.destination_licence is null then 'UNKNOWN DESTINATION'
      when f_is_ours(m.destination_licence) then 'INTERNAL TRANSFER'
      when left(m.destination_licence, 2) = 'IL' then 'LABORATORY SAMPLE'
      when left(m.destination_licence, 2) = 'MX' then 'TRANSPORTER'
      else 'SALE'
    end as destination_kind,
    nullif(regexp_replace(m.destination_licence, '\D', '', 'g'), '') as dest_licence_digits
  from man m
),
money as (
  select
    w.manifest_number,
    round(sum(w.amount) filter (
      where not w.voided and w.amount >= f_rule('apex_metrc_placeholder_line_floor_usd')), 2) as declared,
    count(*) filter (where not w.voided
        and w.amount >= f_rule('apex_metrc_placeholder_line_floor_usd')) as money_lines,
    count(*) filter (where w.voided) as voided_lines,
    count(*) filter (where w.amount < f_rule('apex_metrc_placeholder_line_floor_usd')) as placeholder_lines,
    max(nullif(btrim(w.invoice_number), '')) as invoice_number
  from metrc_rpt_wholesale w
  group by w.manifest_number
),
pkgs as (
  select manifest_number, count(distinct package_tag) as package_tags
  from metrc_rpt_package_transfers group by manifest_number
),
apex as (
  select
    regexp_replace(r.payload ->> 'invoice_number', '\D', '', 'g') as d,
    nullif(regexp_replace(r.payload ->> 'buyer_state_license', '\D', '', 'g'), '') as buyer_digits,
    min(nullif(r.payload ->> 'order_date', '')::date) as apex_order_date,
    min(nullif(r.payload ->> 'delivery_date', '')::date) as apex_delivery_date,
    round(sum((r.payload ->> 'subtotal_raw')::numeric)
          / (select value from conversion_factors where key = 'apex_money_raw_minor_units'), 2) as apex_value,
    count(*) as apex_orders,
    string_agg(distinct btrim(r.payload ->> 'invoice_number'), ', ') as apex_invoices
  from apex_raw r
  where r.entity = 'shipping-orders'
    and (r.payload ->> 'cancelled') = any (array['', '0', 'false'])
    and jsonb_array_length(coalesce(r.payload -> 'items', '[]'::jsonb)) > 0
  group by 1, 2
),
apex_any as (
  select
    regexp_replace(r.payload ->> 'invoice_number', '\D', '', 'g') as d,
    min(nullif(r.payload ->> 'order_date', '')::date) as apex_order_date,
    min(nullif(r.payload ->> 'delivery_date', '')::date) as apex_delivery_date,
    round(sum((r.payload ->> 'subtotal_raw')::numeric)
          / (select value from conversion_factors where key = 'apex_money_raw_minor_units'), 2) as apex_value,
    count(*) as apex_orders,
    string_agg(distinct btrim(r.payload ->> 'invoice_number'), ', ') as apex_invoices,
    string_agg(distinct nullif(btrim(r.payload ->> 'buyer_state_license'), ''), ', ') as buyer_licences
  from apex_raw r
  where r.entity = 'shipping-orders'
    and (r.payload ->> 'cancelled') = any (array['', '0', 'false'])
    and jsonb_array_length(coalesce(r.payload -> 'items', '[]'::jsonb)) > 0
  group by 1
),
j as (
  select
    k.manifest_number, k.created_on, k.received_on, k.destination_licence,
    k.destination_facility, k.destination_kind,
    mo.invoice_number, mo.declared, mo.money_lines, mo.voided_lines, mo.placeholder_lines,
    coalesce(p.package_tags, 0::bigint) as package_tags,
    a.d as buyer_matched, aa.d as any_matched, aa.buyer_licences,
    (a.d is null and aa.d is not null and mo.declared is not null
      and abs(aa.apex_value - mo.declared) <= f_rule('apex_metrc_rounding_tolerance_usd')) as licence_alias,
    coalesce(a.apex_invoices, aa.apex_invoices) as any_invoices,
    coalesce(a.apex_order_date, aa.apex_order_date) as any_order_date,
    coalesce(a.apex_delivery_date, aa.apex_delivery_date) as any_delivery_date,
    coalesce(a.apex_value, aa.apex_value) as any_value,
    coalesce(a.apex_orders, aa.apex_orders) as any_orders,
    a.apex_invoices, a.apex_order_date, a.apex_delivery_date, a.apex_value, a.apex_orders
  from kind k
  left join money mo on mo.manifest_number = k.manifest_number
  left join pkgs  p  on p.manifest_number  = k.manifest_number
  left join apex  a  on a.d = regexp_replace(coalesce(mo.invoice_number, ''), '\D', '', 'g')
                    and mo.invoice_number is not null
                    and a.buyer_digits is not distinct from k.dest_licence_digits
  left join apex_any aa on aa.d = regexp_replace(coalesce(mo.invoice_number, ''), '\D', '', 'g')
                    and mo.invoice_number is not null
)
select
  j.manifest_number,
  j.created_on as metrc_date,
  j.received_on as metrc_received,
  j.destination_licence,
  j.destination_facility,
  j.destination_kind,
  j.invoice_number as metrc_invoice_number,
  j.declared as metrc_declared,
  j.money_lines,
  j.voided_lines,
  j.placeholder_lines,
  j.package_tags,
  case when j.buyer_matched is not null or j.licence_alias then j.any_invoices end as apex_invoices,
  case when j.buyer_matched is not null or j.licence_alias then j.any_order_date end as apex_order_date,
  case when j.buyer_matched is not null or j.licence_alias then j.any_delivery_date end as apex_delivery_date,
  case when j.buyer_matched is not null or j.licence_alias then j.any_value end as apex_value,
  case when j.buyer_matched is not null or j.licence_alias then j.any_orders end as apex_orders,
  case when j.buyer_matched is not null or j.licence_alias
       then coalesce(j.any_delivery_date, j.any_order_date) - j.created_on end as date_gap_days,
  case when j.buyer_matched is not null or j.licence_alias
       then round(j.any_value - j.declared, 2) end as value_gap,
  case
    when j.destination_kind <> 'SALE' then 'NOT A SALE — ' || j.destination_kind
    when j.created_on < '2025-01-30'::date
      then 'BEFORE THE KEY EXISTED — Metrc carried no invoice number until 2025-01-30'
    when j.invoice_number is null then 'NO INVOICE NUMBER on the Metrc record'
    when j.buyer_matched is null and j.any_matched is null then 'NO APEX ORDER for this invoice number'
    when j.licence_alias then 'RECONCILED'
    when j.buyer_matched is null
      then 'FALSE MATCH — this invoice number belongs to an Apex order for a different buyer'
    when j.declared is null
      then 'NO METRC VALUE — Apex order matched but the manifest has no priced line'
    when abs(j.apex_value - j.declared) <= f_rule('apex_metrc_rounding_tolerance_usd') then 'RECONCILED'
    when j.apex_value > j.declared then 'VALUE DIFFERS — Apex sold more than Metrc declares'
    else 'VALUE DIFFERS — Metrc declares more than Apex sold'
  end as status,
  case
    when j.buyer_matched is not null then 'BUYER CONFIRMED'
    when j.licence_alias then 'LICENCE ALIAS — money agrees in full, buyer licence written differently; needs a memo'
    when j.any_matched is not null then 'BUYER DIFFERS — invoice number belongs to another company''s order'
    else null
  end as buyer_match,
  j.buyer_licences as apex_buyer_licences_on_this_invoice
from j;

comment on view v_manifest_reconciliation is
  'One row per outbound Metrc manifest. Joined to Apex on invoice-number digits AND buyer state-licence digits, so a manifest is only ever compared against the order actually addressed to where it went. Before 26 Aug 2026 the join used invoice digits alone and compared manifests against strangers'' orders, which produced 360 VALUE DIFFERS rows of which most were false matches. FALSE MATCH is now its own status.';
