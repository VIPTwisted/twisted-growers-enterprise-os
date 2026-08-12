/* 0100 — CFO / TAX: WHAT WE SPEND ON THIRD-PARTY MATERIAL.
 *
 * The forensic views answered "where did every pound go". They carry NO COST COLUMN
 * AT ALL - v_third_party_forensic has exit_sold_usd (what we sold it for) and nothing
 * for what we PAID. A CFO and a tax preparer need the other side of that.
 *
 * WHERE SPEND COMES FROM, AND WHERE IT DOES NOT.
 *
 * metrc_rpt_package_transfers.receiver_wholesale_price is what WE were billed. It is
 * populated on 13,706 of 19,256 rows.
 *
 * Do NOT resolve inbound with f_is_ours(destination_licence): it matches only 119 of
 * our 438 third-party tags, because destination_licence is blank or is the transporter
 * on a large share of rows. Matching the TAG itself reaches 320, of which 293 carry a
 * price. That is the difference between reporting $838,953 of purchases and reporting
 * a small fraction of it.
 *
 * 145 TAGS HAVE NO PURCHASE PRICE ANYWHERE. The transfer report begins 2024-01-18 and
 * nothing before it exists to read. Their cost is NULL, never zero and never a rate
 * carried across from another tag - a made-up cost basis in a tax pack is worse than a
 * blank one, because a blank gets asked about. v_cfo_spend_coverage states the split on
 * the face of the page so no total is ever read as complete when it is not.
 *
 * DEDUPE BEFORE SUMMING. A tag appears on several transfer rows (one per leg, and
 * repeated across export pulls). distinct on (manifest_number, tag) takes each billed
 * line once. Summing raw rows double-counts the money - the same fan-out that inflated
 * 2024 production to 3,662.7 lb against a true 2,494.4.
 */

/* ── per tag: what it cost, what is left, and what that is worth ────────── */
create or replace view public.v_cfo_spend_by_tag as
with billed as (
  select distinct on (t.manifest_number, upper(btrim(t.package_tag)))
         upper(btrim(t.package_tag))               as tag,
         t.manifest_number,
         nullif(t.receiver_wholesale_price, 0)     as paid_usd,
         t.shipped_lb
  from metrc_rpt_package_transfers t
  where t.package_tag is not null
  order by t.manifest_number, upper(btrim(t.package_tag)), t.received_on
),
per_tag as (
  select tag, sum(paid_usd) as paid_usd, count(paid_usd) as billed_lines
  from billed group by tag
)
select
  f.tag, f.year_received, f.date_received, f.supplier, f.supplier_licence,
  f.category, f.strain, f.item, f.inbound_manifest, f.status,
  f.current_room, f.current_sublocation,
  f.lb_received, f.lb_on_hand, f.lb_sold, f.made_lb,
  f.days_held_total, f.days_unsold_still_here, f.ageing_band,
  f.lab_result, f.date_destroyed, f.destroy_reason,
  f.exit_sold_usd, f.metrc_link, f.manifest_document,
  p.paid_usd,
  /* Unit cost only where BOTH sides are real. A cost per pound built on a null price
     or a zero weight is a division that produces a number and means nothing. */
  case when p.paid_usd is not null and f.lb_received > 0
       then round((p.paid_usd / f.lb_received)::numeric, 2) end          as usd_per_lb,
  /* Money still sitting on the shelf, at what WE paid for it. */
  case when p.paid_usd is not null and f.lb_received > 0
       then round((p.paid_usd / f.lb_received * coalesce(f.lb_on_hand,0))::numeric, 2) end as value_on_hand_usd,
  /* Money written off. Destruction is a deductible event and needs its own line. */
  case when p.paid_usd is not null and f.lb_received > 0 and f.date_destroyed is not null
       then round((p.paid_usd / f.lb_received * coalesce(f.lb_received,0))::numeric, 2) end as value_destroyed_usd,
  /* Margin ONLY where both sides are known, and only on what actually left. */
  case when p.paid_usd is not null and f.exit_sold_usd is not null
       then round((f.exit_sold_usd - p.paid_usd)::numeric, 2) end        as gross_margin_usd,
  (p.paid_usd is null)                                                   as cost_unknown
from v_third_party_forensic f
left join per_tag p on p.tag = f.tag;

comment on view public.v_cfo_spend_by_tag is
  'One row per third-party tag: what we paid, what it cost per pound, what is still on
   hand and what that stock is worth at our own cost. cost_unknown = true means NO price
   exists in any source - the transfer report starts 2024-01-18. Never fill it.';

/* ── the honesty view: how much of the spend is actually known ──────────── */
create or replace view public.v_cfo_spend_coverage as
select
  count(*)                                                as tags,
  count(*) filter (where not cost_unknown)                as tags_with_cost,
  count(*) filter (where cost_unknown)                    as tags_no_cost,
  round((100.0 * count(*) filter (where not cost_unknown) / nullif(count(*),0))::numeric, 1) as pct_costed,
  round(sum(lb_received) filter (where cost_unknown)::numeric, 1)   as lb_with_no_cost,
  round(sum(paid_usd)::numeric, 0)                        as known_spend_usd
from v_cfo_spend_by_tag;

comment on view public.v_cfo_spend_coverage is
  'States on the face of the page how much of third-party spend is actually evidenced.
   A total is not complete until this says so.';

/* ── by tax year ────────────────────────────────────────────────────────── */
create or replace view public.v_cfo_spend_by_year as
select
  year_received                                            as tax_year,
  count(*)                                                 as tags,
  count(*) filter (where cost_unknown)                     as tags_no_cost,
  round(sum(lb_received)::numeric, 1)                      as lb_bought,
  round(sum(paid_usd)::numeric, 0)                         as spend_usd,
  round((sum(paid_usd) / nullif(sum(lb_received) filter (where not cost_unknown), 0))::numeric, 0) as usd_per_lb,
  round(sum(lb_on_hand)::numeric, 1)                       as lb_still_on_hand,
  round(sum(value_on_hand_usd)::numeric, 0)                as value_on_hand_usd,
  round(sum(value_destroyed_usd)::numeric, 0)              as value_destroyed_usd,
  round(sum(exit_sold_usd)::numeric, 0)                    as resold_usd
from v_cfo_spend_by_tag
group by year_received;

/* ── by supplier — who we actually buy from ─────────────────────────────── */
create or replace view public.v_cfo_spend_by_supplier as
select
  coalesce(nullif(supplier,''), 'unnamed supplier')        as supplier,
  supplier_licence,
  count(*)                                                 as tags,
  min(date_received)                                       as first_bought,
  max(date_received)                                       as last_bought,
  round(sum(lb_received)::numeric, 1)                      as lb_bought,
  round(sum(paid_usd)::numeric, 0)                         as spend_usd,
  round((sum(paid_usd) / nullif(sum(lb_received) filter (where not cost_unknown), 0))::numeric, 0) as usd_per_lb,
  round(sum(lb_on_hand)::numeric, 1)                       as lb_still_on_hand,
  round(sum(value_on_hand_usd)::numeric, 0)                as value_on_hand_usd,
  count(*) filter (where cost_unknown)                     as tags_no_cost
from v_cfo_spend_by_tag
group by 1, 2;

/* ── PLANNING AND BUDGETING: cash tied up, and how long it has been tied ──
 *
 * The owner's standing concern is sitting on cash. This bands MONEY, not pounds -
 * pounds do not tell a CFO anything about exposure. */
create or replace view public.v_cfo_spend_ageing as
select
  coalesce(ageing_band, 'unbanded')                        as ageing_band,
  count(*)                                                 as tags,
  round(sum(lb_on_hand)::numeric, 1)                       as lb_on_hand,
  round(sum(value_on_hand_usd)::numeric, 0)                as cash_tied_usd,
  round(avg(days_unsold_still_here)::numeric, 0)           as avg_days_unsold,
  max(days_unsold_still_here)                              as worst_days_unsold
from v_cfo_spend_by_tag
where coalesce(lb_on_hand,0) > 0
group by 1;

grant select on public.v_cfo_spend_by_tag,      public.v_cfo_spend_coverage,
                 public.v_cfo_spend_by_year,     public.v_cfo_spend_by_supplier,
                 public.v_cfo_spend_ageing
  to anon, authenticated;;
