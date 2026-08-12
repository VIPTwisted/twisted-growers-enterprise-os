-- OWNER INSTRUCTION, 8 August 2026: "we track ours, third party and collectively".
--
-- Rule C6c already forbids blending the revenue lines. Nothing reported the
-- position that way, so every stock figure on the platform was a single blended
-- number — and blending is what manufactured the false "selling below cost"
-- conclusion once already ($950/lb own production against $289/lb bought-in).
--
-- OURS and THIRD PARTY here are resolved through f_material_origin, which walks
-- the package lineage. The platform's own one-field read gets 21.4% of on-hand
-- pounds on the wrong side, because a repackaged child does not inherit its
-- parent's provenance.
--
-- ⚠ THE FOURTH COLUMN IS NOT PADDING. 263 packages holding 346.9 lb are BLENDED
-- from 2 to 7 origins, and NOTHING RECORDS THE PROPORTIONS. They cannot be
-- assigned to either side without inventing the split. So they get their own
-- column and are excluded from both — which means:
--
--     ours + third_party  IS NOT  collectively
--
-- That gap is the honest measure of what cannot be attributed, and it must stay
-- visible. Forcing the three to reconcile would require a made-up number, and
-- the audit trail of this platform is a list of exactly that mistake.
create or replace view v_position_by_ownership as
with p as (
  select mp.tag,
         coalesce(nullif(mp.location,''), '(no location recorded)') as location,
         mp.license,
         mp.lab_testing_state,
         f_to_pounds(mp.quantity, mp.uom)                            as lb,
         f_material_origin(mp.tag)                                   as g
  from metrc_packages mp
  where mp.quantity > 0
),
tagged as (
  select p.*,
         jsonb_array_length(coalesce(g->'origin_licences','[]'::jsonb)) as origins,
         case
           when (g->>'all_ours')::boolean                                   then 'ours'
           when (g->>'any_outside')::boolean
                and jsonb_array_length(coalesce(g->'origin_licences','[]'::jsonb)) <= 1
                                                                           then 'third_party'
           when (g->>'any_outside')::boolean                                then 'blended'
           else 'unresolved'
         end as side
  from p
),
s as (
  select coalesce(soh.stream, 'not classified') as stream, soh.license, soh.lab_state
  from v_stock_on_hand soh limit 0   -- shape only; the grain below is the package
)
select
  t.license,
  coalesce(t.lab_testing_state, 'no test state recorded')                as lab_state,
  t.location,

  round(sum(t.lb) filter (where t.side = 'ours')::numeric, 1)            as ours_lb,
  round(sum(t.lb) filter (where t.side = 'third_party')::numeric, 1)     as third_party_lb,
  round(sum(t.lb) filter (where t.side = 'blended')::numeric, 1)         as blended_lb,
  round(sum(t.lb) filter (where t.side = 'unresolved')::numeric, 1)      as unresolved_lb,
  round(sum(t.lb)::numeric, 1)                                           as collectively_lb,

  count(*) filter (where t.side = 'ours')                                as ours_packages,
  count(*) filter (where t.side = 'third_party')                         as third_party_packages,
  count(*) filter (where t.side = 'blended')                             as blended_packages,
  count(*) filter (where t.side = 'unresolved')                          as unresolved_packages,
  count(*)                                                               as collectively_packages,

  round(100.0 * sum(t.lb) filter (where t.side = 'third_party')
        / nullif(sum(t.lb), 0), 1)                                       as pct_third_party,

  -- A3: the reconciliation gap is stated on the row, never left for the reader
  -- to discover by subtracting and finding it does not add up.
  case
    when sum(t.lb) filter (where t.side in ('blended','unresolved')) > 0
      then round(sum(t.lb) filter (where t.side in ('blended','unresolved'))::numeric, 1)
           || ' lb cannot be attributed to either side — blended from several origins with no '
           || 'record of the proportions. ours + third party will NOT equal collectively, and '
           || 'making them balance would require inventing the split.'
  end                                                                    as why_it_does_not_add_up
from tagged t
group by t.license, coalesce(t.lab_testing_state, 'no test state recorded'), t.location;

comment on view v_position_by_ownership is
  'Stock on hand split three ways as the owner requires — ours, third party, and collectively — with ownership resolved through package lineage rather than the single item field. Blended and unresolved material is held in its own columns and excluded from both sides, so ours + third_party deliberately does NOT equal collectively; the shortfall is what cannot honestly be attributed.';

grant select on v_position_by_ownership to authenticated;
revoke all on v_position_by_ownership from anon;

insert into nav_registry (category, category_order, label, item_order, icon, view_key,
                          table_ref, description, enabled, admin_only, surface, subcategory)
values ('Command Center', 0, 'Position — Ours, Third Party, Collectively', 0, 'gauge',
        'position_by_ownership', 'v_position_by_ownership',
        'Stock split three ways with ownership resolved through package lineage. Blended material sits in its own column and is counted to neither side, so the three columns deliberately do not reconcile — the gap is what cannot be attributed.',
        true, false, 'deep', 'Third Party')
on conflict do nothing;;
