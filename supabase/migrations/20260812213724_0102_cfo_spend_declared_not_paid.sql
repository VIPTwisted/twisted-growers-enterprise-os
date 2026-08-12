/* 0102 — STOP CALLING A DECLARED TRANSFER PRICE "PAID".
 *
 * SEED_TO_SALE_MANDATE S1: Apex is the source of record for price; Metrc holds what was
 * DECLARED TO THE STATE. 0100 built on receiver_wholesale_price and named the column
 * paid_usd - under S1 that is "a wrong answer with a citation", and it has been live since.
 * The arithmetic is unchanged; the column now says what it actually is.
 *
 * cost_basis_status:
 *   EVIDENCED - an Apex receiving-order invoice backs it. Reachable by NO row today,
 *               because apex_raw holds ZERO rows for receiving-orders. That zero IS the finding.
 *   DECLARED  - a Metrc manifest declared it to the state. Indicative only.
 *   NONE      - no figure in any source. 145 of 438 tags.
 *
 * WHY A DROP AND NOT CREATE OR REPLACE. Replace cannot RENAME a column, and renaming is the
 * entire point - leaving it called paid_usd keeps the wrong answer in production. The drop
 * guard blocked this on the first attempt, correctly; tg.allow_drop is set deliberately here
 * and every dependent is recreated below in the same transaction. Nothing outside these five
 * views depends on them (they were created today in 0100), so no dashboard is in the blast
 * radius - the failure the guard exists to prevent is CASCADE reaching
 * mv_department_dashboard, and there is no CASCADE here.
 */
set local tg.allow_drop = 'yes';

drop view if exists public.v_cfo_spend_ageing;
drop view if exists public.v_cfo_spend_by_supplier;
drop view if exists public.v_cfo_spend_by_year;
drop view if exists public.v_cfo_spend_coverage;
drop view if exists public.v_cfo_spend_by_tag;

create view public.v_cfo_spend_by_tag as
with billed as (
  select distinct on (t.manifest_number, upper(btrim(t.package_tag)))
         upper(btrim(t.package_tag)) as tag,
         nullif(t.receiver_wholesale_price, 0) as declared_usd
  from metrc_rpt_package_transfers t
  where t.package_tag is not null
  order by t.manifest_number, upper(btrim(t.package_tag)), t.received_on
),
per_tag as (select tag, sum(declared_usd) as declared_usd from billed group by tag)
select
  f.tag, f.year_received, f.date_received, f.date_supplier_packaged, f.age_on_arrival_days,
  f.supplier, f.supplier_licence, f.category, f.strain, f.item,
  f.inbound_manifest, f.status, f.current_room, f.current_sublocation,
  f.lb_received, f.lb_on_hand, f.lb_sold, f.made_lb,
  f.days_held_total, f.days_unsold_still_here, f.ageing_band,
  f.lab_result, f.lab_state, f.date_tested,
  f.date_destroyed, f.destroy_reason, f.destroy_note, f.destroyed_by,
  f.destroy_rows_verbatim,          /* Metrc's OWN words, verbatim - never paraphrased */
  f.exit_sold_usd, f.metrc_link, f.location_history,
  p.declared_usd,
  case when p.declared_usd is not null and f.lb_received > 0
       then round((p.declared_usd / f.lb_received)::numeric, 2) end as declared_usd_per_lb,
  case when p.declared_usd is not null and f.lb_received > 0
       then round((p.declared_usd / f.lb_received * coalesce(f.lb_on_hand,0))::numeric, 2) end
                                                                    as declared_value_on_hand_usd,
  case when p.declared_usd is null then 'NONE' else 'DECLARED' end   as cost_basis_status,
  'Metrc manifest declaration, NOT an Apex invoice. Apex receiving-orders holds 0 rows, so no '
  'evidenced cost exists for any tag.'                               as cost_basis_note
from v_third_party_forensic f
left join per_tag p on p.tag = f.tag;

comment on view public.v_cfo_spend_by_tag is
  'Third-party material per tag. The money is a DECLARED TRANSFER PRICE from Metrc manifests,
   never a realised cost (mandate S1). cost_basis_status reads EVIDENCED only when an Apex
   receiving-order backs it, which no row reaches today. Never present declared_usd as cost,
   spend or COGS.';

create view public.v_cfo_spend_coverage as
select count(*) as tags,
  count(*) filter (where cost_basis_status='DECLARED')  as tags_declared,
  count(*) filter (where cost_basis_status='EVIDENCED') as tags_evidenced,
  count(*) filter (where cost_basis_status='NONE')      as tags_no_figure,
  round(sum(declared_usd)::numeric,0)                   as declared_total_usd,
  round(sum(lb_received) filter (where cost_basis_status='NONE')::numeric,1) as lb_with_no_figure
from v_cfo_spend_by_tag;

comment on view public.v_cfo_spend_coverage is
  'tags_evidenced is expected to be ZERO until Apex receiving-orders imports. That zero is the
   finding, not a bug: the business has no evidenced cost basis for purchased material.';

create view public.v_cfo_spend_by_year as
select year_received as tax_year, count(*) as tags,
  count(*) filter (where cost_basis_status='NONE') as tags_no_figure,
  round(sum(lb_received)::numeric,1)  as lb_bought,
  round(sum(declared_usd)::numeric,0) as declared_usd,
  round((sum(declared_usd)/nullif(sum(lb_received) filter (where cost_basis_status<>'NONE'),0))::numeric,0)
                                      as declared_usd_per_lb,
  round(sum(lb_on_hand)::numeric,1)   as lb_still_on_hand,
  round(sum(declared_value_on_hand_usd)::numeric,0) as declared_value_on_hand_usd,
  round(sum(exit_sold_usd)::numeric,0) as resold_usd
from v_cfo_spend_by_tag group by year_received;

create view public.v_cfo_spend_by_supplier as
select coalesce(nullif(supplier,''),'unnamed supplier') as supplier, supplier_licence,
  count(*) as tags, min(date_received) as first_bought, max(date_received) as last_bought,
  round(sum(lb_received)::numeric,1)  as lb_bought,
  round(sum(declared_usd)::numeric,0) as declared_usd,
  round((sum(declared_usd)/nullif(sum(lb_received) filter (where cost_basis_status<>'NONE'),0))::numeric,0)
                                      as declared_usd_per_lb,
  round(sum(lb_on_hand)::numeric,1)   as lb_still_on_hand,
  count(*) filter (where cost_basis_status='NONE') as tags_no_figure
from v_cfo_spend_by_tag group by 1,2;

create view public.v_cfo_spend_ageing as
select coalesce(ageing_band,'unbanded') as ageing_band, count(*) as tags,
  round(sum(lb_on_hand)::numeric,1)                 as lb_on_hand,
  round(sum(declared_value_on_hand_usd)::numeric,0) as declared_cash_tied_usd,
  round(avg(days_unsold_still_here)::numeric,0)     as avg_days_unsold,
  max(days_unsold_still_here)                       as worst_days_unsold
from v_cfo_spend_by_tag where coalesce(lb_on_hand,0) > 0 group by 1;

grant select on public.v_cfo_spend_by_tag, public.v_cfo_spend_coverage, public.v_cfo_spend_by_year,
                 public.v_cfo_spend_by_supplier, public.v_cfo_spend_ageing to anon, authenticated;;
