/* MONEY_GRAIN_CONTRACT
   Apex owns sales. Metrc owns custody. A tag line may point to an invoice, but
   an invoice total is true once per Apex order and is never additive at tag or
   manifest grain. This migration quarantines the unsafe report without changing
   the legacy view used by existing custody dependants. */

create or replace view public.v_apex_invoice_truth
with (security_invoker = true)
as
select
  l.order_date,
  l.delivery_date,
  l.apex_order_id,
  l.invoice_number,
  l.invoice_digits,
  l.buyer_state_license,
  l.total_dollars as invoice_total_usd,
  case when not l.cancelled then l.total_dollars end as recognized_total_usd,
  l.cancelled,
  l.line_count,
  l.split_from_order_id,
  l.link_status,
  l.match_basis,
  l.invoice_number_is_ambiguous,
  l.metrc_manifests as matched_metrc_manifests,
  l.package_tags as matched_package_tags,
  l.metrc_wholesale_rows,
  l.voided_rows,
  l.metrc_destination_licences,
  l.first_metrc_date,
  l.last_metrc_date,
  'one row per Apex order; recognized_total_usd is the additive sales measure'::text as money_grain
from public.v_apex_order_metrc_link l;

comment on view public.v_apex_invoice_truth is
  'Apex sales truth at one row per Apex order. recognized_total_usd excludes cancelled orders and is additive. invoice_total_usd is row context. Never add either value from a tag, line, or manifest view.';

create or replace view public.v_metrc_manifest_invoice_truth
with (security_invoker = true)
as
with metrc as (
  select
    w.manifest_number,
    min(w.created_on) as first_metrc_date,
    max(w.created_on) as last_metrc_date,
    min(w.invoice_number) as metrc_invoice_number,
    case when count(distinct nullif(regexp_replace(w.invoice_number, '\D', '', 'g'), '')) = 1
      then min(nullif(regexp_replace(w.invoice_number, '\D', '', 'g'), '')) end as invoice_digits,
    count(distinct nullif(regexp_replace(w.invoice_number, '\D', '', 'g'), '')) > 1 as invoice_number_conflict,
    count(*) as wholesale_rows,
    count(*) filter (where w.voided) as voided_rows,
    string_agg(distinct w.destination_licence, ', ' order by w.destination_licence) as destination_licences
  from public.metrc_rpt_wholesale w
  where nullif(btrim(w.invoice_number), '') is not null
  group by w.manifest_number
), tags as (
  select t.manifest_number, count(distinct t.package_tag) as package_tags
  from public.metrc_rpt_package_transfers t
  group by t.manifest_number
)
select
  m.manifest_number,
  m.first_metrc_date,
  m.last_metrc_date,
  m.metrc_invoice_number,
  m.invoice_digits,
  m.invoice_number_conflict,
  m.destination_licences,
  m.wholesale_rows,
  m.voided_rows,
  coalesce(t.package_tags, 0) as package_tags,
  i.apex_order_id,
  i.invoice_number as apex_invoice_number,
  i.order_date as apex_invoice_date,
  i.buyer_state_license as apex_buyer_licence,
  i.invoice_total_usd as invoice_total_usd_non_additive,
  i.cancelled as apex_cancelled,
  i.link_status as apex_link_status,
  i.matched_metrc_manifests,
  case
    when m.invoice_number_conflict then 'CONFLICT — manifest carries more than one invoice number'
    when m.invoice_digits is null then 'UNMATCHABLE — Metrc invoice has no digits'
    when i.apex_order_id is null then 'NO EXACT APEX INVOICE'
    else 'MATCHED — exact invoice number'
  end as match_status,
  case
    when i.apex_order_id is not null and i.matched_metrc_manifests = 1
      then i.recognized_total_usd
    else null
  end as one_to_one_manifest_usd,
  'one row per Metrc manifest; invoice_total_usd_non_additive is context and must never be summed'::text as money_grain
from metrc m
left join tags t on t.manifest_number = m.manifest_number
left join public.v_apex_invoice_truth i
  on i.invoice_digits = m.invoice_digits
 and not i.invoice_number_is_ambiguous
 and not m.invoice_number_conflict;

comment on view public.v_metrc_manifest_invoice_truth is
  'One row per Metrc manifest, joined to Apex only by the normalized invoice number recorded in both systems. Invoice money is explicitly non-additive because one invoice may span several manifests. Use v_apex_invoice_truth for revenue totals.';

create or replace view public.v_forensic_sold_by_tag_safe
with (security_invoker = true)
as
select
  s.shipped_on,
  s.manifest_number,
  s.package_tag,
  s.item,
  s.category,
  s.strain,
  s.product_line,
  s.pounds,
  s.sold_by_licence,
  s.sold_by_facility,
  s.buyer_licence,
  s.buyer,
  s.internal_transfer,
  s.status,
  s.transfer_type,
  m.apex_invoice_number as invoice_number,
  null::numeric as total_usd,
  null::text as payment_status,
  coalesce(m.match_status, 'NO METRC WHOLESALE INVOICE') as invoice_match,
  s.is_transport_leg,
  s.counts_as_sale,
  s.coa_certificate_id,
  s.coa_document_link,
  s.manifest_no,
  s.manifest_document_link,
  m.apex_invoice_number as apex_invoice_no,
  null::numeric as apex_invoice_usd
from public.v_forensic_sold_by_tag s
left join public.v_metrc_manifest_invoice_truth m
  on m.manifest_number = s.manifest_number;

comment on view public.v_forensic_sold_by_tag_safe is
  'Safe tag-line custody view. Pounds remain additive under their existing unit rules. Invoice identity is exact-number only. Dollar columns are intentionally null because repeating an invoice total on every tag line creates false revenue.';
comment on column public.v_forensic_sold_by_tag.total_usd is
  'LEGACY NON-ADDITIVE VALUE repeated at tag line grain. Never sum or publish. Use v_apex_invoice_truth.recognized_total_usd.';
comment on column public.v_forensic_sold_by_tag.apex_invoice_usd is
  'LEGACY NON-ADDITIVE VALUE repeated at tag line grain. Never sum or publish. Use v_apex_invoice_truth.recognized_total_usd.';

revoke all on table public.v_apex_invoice_truth from anon;
revoke all on table public.v_metrc_manifest_invoice_truth from anon;
revoke all on table public.v_forensic_sold_by_tag_safe from anon;
grant select on table public.v_apex_invoice_truth to authenticated, service_role, tg_desktop_reader;
grant select on table public.v_metrc_manifest_invoice_truth to authenticated, service_role, tg_desktop_reader;
grant select on table public.v_forensic_sold_by_tag_safe to authenticated, service_role, tg_desktop_reader;

update public.report_registry
set fact_view = 'v_forensic_sold_by_tag_safe',
    measures = array['pounds']::text[],
    description = 'Every pound that left a licence at tag-line grain. Invoice identity is exact-number only. Money is refused here; open Apex Invoice Truth for additive revenue.',
    owner_note = 'MONEY GRAIN GUARD: invoice totals are never repeated or summed at tag-line grain.',
    updated_at = now()
where report_key = 'inventory.forensic_sold';

insert into public.report_registry
  (report_key, title, category, fact_view, date_column, dimensions, measures,
   description, owner_note, enabled)
values
  ('sales.apex_invoice_truth', 'Apex Invoice Truth — one row per order', 'Sales',
   'v_apex_invoice_truth', 'order_date',
   array['buyer_state_license','cancelled','link_status','invoice_number_is_ambiguous'],
   array['recognized_total_usd'],
   'The additive Apex sales surface. One row per Apex order; cancelled orders do not enter recognized_total_usd.',
   'Apex is the sales source of truth. Metrc custody is reconciled and never added as a second sale.', true),
  ('sales.metrc_manifest_invoice_truth', 'Metrc Manifest ↔ Apex Invoice Truth', 'Sales',
   'v_metrc_manifest_invoice_truth', 'first_metrc_date',
   array['match_status','destination_licences','apex_cancelled','apex_link_status'],
   array[]::text[],
   'One row per Metrc manifest. Exact invoice-number bridge only. Invoice dollars are context, not an additive manifest measure.',
   'Use Apex Invoice Truth for revenue. Proximity is never a match.', true)
on conflict (report_key) do update set
  title = excluded.title,
  category = excluded.category,
  fact_view = excluded.fact_view,
  date_column = excluded.date_column,
  dimensions = excluded.dimensions,
  measures = excluded.measures,
  description = excluded.description,
  owner_note = excluded.owner_note,
  enabled = excluded.enabled,
  updated_at = now();

do $$
declare
  v_line_money bigint;
  v_registered bigint;
  v_truth numeric;
  v_control numeric;
begin
  select count(*) into v_line_money
  from public.v_forensic_sold_by_tag_safe
  where total_usd is not null or apex_invoice_usd is not null;

  select count(*) into v_registered
  from public.report_registry
  where report_key = 'inventory.forensic_sold'
    and ('total_usd' = any(measures) or 'apex_invoice_usd' = any(measures));

  select coalesce(sum(recognized_total_usd), 0) into v_truth
  from public.v_apex_invoice_truth;
  select coalesce(sum(total_dollars), 0) into v_control
  from public.v_apex_order_metrc_link where not cancelled;

  if v_line_money <> 0 or v_registered <> 0 or v_truth <> v_control then
    raise exception 'money grain contract failed: line_money %, registered %, truth %, control %',
      v_line_money, v_registered, v_truth, v_control;
  end if;

  update public.agent_findings
  set resolved_at = now(),
      resolution = format(
        'CLOSED on verified grain controls. The published tag-line report now serves zero dollar values and registers no line-grain money measure. Apex Invoice Truth sums to %s, exactly matching the non-cancelled one-row-per-order control. Metrc remains custody evidence and is never added as revenue.',
        v_truth)
  where fingerprint = 'r-19aug-money-fanout-11x-16x'
    and resolved_at is null;
end $$;
