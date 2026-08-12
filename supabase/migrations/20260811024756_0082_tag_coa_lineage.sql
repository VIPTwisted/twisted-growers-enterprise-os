-- ---------------------------------------------------------------------------
-- 0082 — COA FOR EVERY TAG, resolved through lineage.
--
-- HARD RULE (owner, 11 Aug 2026): every single item in question must be drilled to
-- its TAG, its MANIFEST and its COA. No drifting from that.
--
-- A COA belongs to the lot that was TESTED, not to each retail jar cut from it, so a
-- direct tag match finds only 969 of 18,468 tags. The certificate is inherited down
-- the package tree. Lineage edges come from TWO sources, because neither alone is
-- complete:
--   metrc_packages.SourcePackageLabels     -- for tags we still hold
--   metrc_rpt_package_transfers.source_package -- 14,968 tags, including the 14,124
--                                              that have no package record at all
--
-- Materialised: this is a recursive walk over ~19k edges and is far too slow to sit
-- behind a report as a plain view.
-- ---------------------------------------------------------------------------
create materialized view mv_tag_coa_lineage as
with recursive
edges as (
  select upper(btrim(c.raw->>'Label')) as child, upper(btrim(pt.tag)) as parent
  from metrc_packages c
  join lateral unnest(string_to_array(c.raw->>'SourcePackageLabels', ', ')) pt(tag) on true
  where nullif(c.raw->>'SourcePackageLabels','') is not null
    and nullif(btrim(pt.tag),'') is not null
  union
  select upper(btrim(t.package_tag)), upper(btrim(t.source_package))
  from metrc_rpt_package_transfers t
  where nullif(btrim(t.source_package),'') is not null
    and upper(btrim(t.source_package)) <> upper(btrim(t.package_tag))
),
coa_tag as (
  select upper(btrim(package_tag)) tag,
         min(document_id) document_id,
         max(report_date)::text report_date,
         max(total_thc) total_thc,
         max(sample_id) sample_id
  from coa_extract where package_tag is not null group by 1
),
universe as (
  select distinct upper(btrim(raw->>'Label')) tag from metrc_packages
  union select distinct upper(btrim(package_tag)) from metrc_rpt_package_transfers
  union select distinct upper(btrim(tag)) from metrc_rpt_point_in_time where record_type='Package'
  union select distinct upper(btrim(package_tag)) from metrc_rpt_packages_inventory
  union select distinct upper(btrim(package_tag)) from metrc_rpt_lab_results where package_tag is not null
  union select distinct upper(btrim(package_tag)) from coa_extract where package_tag is not null
  union select distinct upper(btrim(package_tag)) from metrc_rpt_adjustments where package_tag is not null
),
walk as (
  -- start at the tag itself, hop 0
  select u.tag as tag, u.tag as node, 0 as hops
  from universe u
  union all
  -- climb to parents, but stop the moment a certificate is found, and cap the depth
  select w.tag, e.parent, w.hops + 1
  from walk w
  join edges e on e.child = w.node
  where w.hops < 8
    and not exists (select 1 from coa_tag c where c.tag = w.node)
),
best as (
  select distinct on (w.tag) w.tag, w.node as coa_tag, w.hops, c.document_id,
         c.report_date, c.total_thc, c.sample_id
  from walk w join coa_tag c on c.tag = w.node
  order by w.tag, w.hops, c.document_id
)
select u.tag,
       b.coa_tag        as coa_found_on_tag,
       b.hops           as coa_hops,
       b.document_id    as coa_document,
       b.report_date    as coa_report_date,
       b.total_thc      as coa_total_thc,
       b.sample_id      as coa_sample_id,
       case when b.tag is null then 'NO COA ANYWHERE IN LINEAGE'
            when b.hops = 0    then 'COA ON THE TAG ITSELF'
            else 'COA INHERITED — ' || b.hops || ' hop(s) up the lineage' end as coa_basis
from universe u
left join best b on b.tag = u.tag;

create unique index mv_tag_coa_lineage_pk on mv_tag_coa_lineage (tag);

comment on materialized view mv_tag_coa_lineage is
  'The certificate of analysis for EVERY tag, direct or inherited up the package tree. '
  'A COA belongs to the lot that was tested, not to each retail unit cut from it, so a '
  'direct tag match reaches only 969 of 18,468 tags. Lineage edges are taken from BOTH '
  'metrc_packages.SourcePackageLabels and metrc_rpt_package_transfers.source_package, '
  'because neither alone covers the 14,124 tags with no package record. coa_basis says '
  'whether the certificate is the tag''s own or inherited, and from how far up.';

grant select on mv_tag_coa_lineage to authenticated;
;
