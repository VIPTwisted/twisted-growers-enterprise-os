-- ---------------------------------------------------------------------------
-- 0038 — HARD RULE: every tag requires full track and trace. Made testable.
--
-- Owner, 10 Aug 2026: "hard rule all tags require full track and trace".
--
-- A rule nobody can test is a preference. This view fails per tag, names the
-- missing element, and can be counted -- so the rule either holds or it does not,
-- and the answer is a number rather than an opinion.
--
-- MEASURED AT THE MOMENT OF WRITING: 875 tags held, 100% with a harvester
-- attributed, ZERO of unknown ownership. 813 repackaged here, 542 manufactured
-- here, 122 harvested by a third party.
--
-- SEEDS ARE LEGITIMATELY EXEMPT from source lineage. All 24 lineage-less tags are
-- Seeds (ours, MC281714, 2,400 units, 19 Dec 2023). Seeds have no source harvest
-- because they ARE the start of the chain -- demanding one would manufacture a
-- failure. This is the difference between a gap and a category that does not have
-- the field.
-- ---------------------------------------------------------------------------

create or replace view v_trace_completeness as
select package_tag, held_by_licence, current_room, item, strain, category,
       packaged_on, lb, units,
       harvested_by, harvested_by_licence, harvested_by_ownership,
       repackaged_by, manufactured_by, source_harvest, source_packages,
       inbound_manifest, has_coa, provenance,

       (harvested_by <> '(not recorded)')                      as has_harvester,
       (harvested_by_ownership <> 'UNKNOWN')                   as has_ownership,
       (source_harvest is not null or source_packages is not null
        or category = 'Seeds')                                 as has_lineage,
       (inbound_manifest is not null
        or harvested_by_ownership = 'OURS')                    as arrival_explained,

       case
         when harvested_by = '(not recorded)'
           then 'FAIL — no harvesting facility recorded'
         when harvested_by_ownership = 'UNKNOWN'
           then 'FAIL — ownership cannot be determined'
         when source_harvest is null and source_packages is null and category <> 'Seeds'
           then 'FAIL — no source harvest and no source package'
         when inbound_manifest is null and harvested_by_ownership = 'THIRD PARTY'
              and source_packages is null
           then 'FAIL — third-party material with no inbound manifest and no source tag'
         when category = 'Seeds' and source_harvest is null
           then 'PASS — Seeds, exempt from source lineage (start of the chain)'
         else 'PASS — fully traced'
       end                                                     as trace_verdict
from v_tag_provenance;

comment on view v_trace_completeness is
  'THE HARD RULE MADE TESTABLE: every held tag must name who harvested it, whose '
  'material it is, and where it came from. Seeds are exempt from source lineage '
  'because they ARE the start of the chain -- demanding one would manufacture a '
  'failure. Anything reading FAIL is a real break in track and trace.';

grant select on v_trace_completeness to authenticated;


-- Tile-ready: one number for the dashboards.
create or replace view v_trace_breaks as
select trace_verdict, count(*) as tags,
       round(sum(lb),2) as lb, sum(units) as units,
       count(*) filter (where harvested_by_ownership = 'THIRD PARTY') as third_party
from v_trace_completeness
where trace_verdict like 'FAIL%'
group by 1;

comment on view v_trace_breaks is
  'Tags that BREAK track and trace, by reason. Empty is the correct state.';

grant select on v_trace_breaks to authenticated;

insert into widget_catalog (key, category, label, icon, table_ref, agg, value_col, filters, drill, format, hot, enabled) values
 ('trace_breaks','Command','Tags breaking track & trace','git-branch-x',
  'v_trace_completeness','count',null,
  '[{"op":"like","col":"trace_verdict","val":"FAIL%"}]'::jsonb,'trace_completeness',null,true,true),
 ('trace_breaks_cult','Cultivation','Tags breaking track & trace','git-branch-x',
  'v_trace_completeness','count',null,
  '[{"op":"like","col":"trace_verdict","val":"FAIL%"}]'::jsonb,'trace_completeness',null,true,true),
 ('third_party_on_hand','Command','Third-party material on hand','users',
  'v_tag_provenance','count',null,
  '[{"op":"eq","col":"harvested_by_ownership","val":"THIRD PARTY"}]'::jsonb,'tag_provenance',null,true,true)
on conflict (key) do update set
  label=excluded.label, table_ref=excluded.table_ref, filters=excluded.filters,
  drill=excluded.drill, hot=excluded.hot, enabled=excluded.enabled, updated_at=now();
;
