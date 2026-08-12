-- ---------------------------------------------------------------------------
-- 0084 — Certificate lineage rebuilt on ALL FOUR sources, not just parsed PDFs.
--
-- 0082 tested only coa_extract (969 tags). That was the wrong source to lean on:
--   coa_extract            969 tags  — parsed PDFs, one fetch on 6 Aug 2026
--   metrc_documents        969 tags  — the COA files themselves, same single fetch
--   metrc_rpt_lab_results 1,016 tags — the report export, starts 2025-01-10
--   metrc_lab_results     2,642 tags — THE API TABLE, reaching back to 2023-09-15
--
-- The API table covers nearly three times as many tags and sixteen months more
-- history than the one I was using. Direct coverage across all four is 3,658 tags.
--
-- Owner rule (11 Aug 2026): nothing goes out without a tag, a manifest AND a COA,
-- both ways -- so a tag with no certificate found is a hole in OUR IMPORT, never a
-- compliance failure. Manifests prove the point: 2,643 needed, 2,643 held, zero
-- missing. The COA fetch simply ran once and stopped.
-- ---------------------------------------------------------------------------
create materialized view mv_tag_certificate as
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
cert as (
  -- every source that proves a tag was tested, best evidence first
  select tag, min(rank) rank,
         min(document_id) filter (where document_id is not null) document_id,
         min(kind)        as kind,
         max(report_date) as report_date,
         max(total_thc)   as total_thc
  from (
    select upper(btrim(package_tag)) tag, 1 rank, document_id, 'PARSED COA DOCUMENT' kind,
           report_date::text, total_thc::text
    from coa_extract where package_tag is not null
    union all
    select upper(btrim(package_tag)), 2, id::text, 'COA FILE HELD, NOT YET PARSED',
           tested_on_txt, null
    from (select package_tag, id, fetched_at::text tested_on_txt
          from metrc_documents where doc_type='coa' and package_tag is not null) d
    union all
    select upper(btrim(package_tag)), 3, null, 'METRC LAB RESULT (API)',
           max(result_date)::text, null
    from metrc_lab_results where package_tag is not null group by 1
    union all
    select upper(btrim(package_tag)), 4, null, 'METRC LAB RESULT (report export)',
           max(test_date)::text, null
    from metrc_rpt_lab_results where package_tag is not null group by 1
  ) s group by tag
),
universe as (
  select distinct upper(btrim(raw->>'Label')) tag from metrc_packages
  union select distinct upper(btrim(package_tag)) from metrc_rpt_package_transfers
  union select distinct upper(btrim(tag)) from metrc_rpt_point_in_time where record_type='Package'
  union select distinct upper(btrim(package_tag)) from metrc_rpt_packages_inventory
  union select distinct upper(btrim(package_tag)) from metrc_rpt_lab_results where package_tag is not null
  union select distinct upper(btrim(package_tag)) from metrc_lab_results where package_tag is not null
  union select distinct upper(btrim(package_tag)) from coa_extract where package_tag is not null
  union select distinct upper(btrim(package_tag)) from metrc_rpt_adjustments where package_tag is not null
),
walk as (
  select u.tag as tag, u.tag as node, 0 as hops from universe u
  union all
  select w.tag, e.parent, w.hops + 1
  from walk w join edges e on e.child = w.node
  where w.hops < 8 and not exists (select 1 from cert c where c.tag = w.node)
),
best as (
  select distinct on (w.tag) w.tag, w.node as found_on_tag, w.hops,
         c.document_id, c.kind, c.report_date, c.total_thc
  from walk w join cert c on c.tag = w.node
  order by w.tag, w.hops, c.rank
)
select u.tag,
       b.found_on_tag   as certificate_on_tag,
       b.hops           as certificate_hops,
       b.document_id    as certificate_document,
       b.kind           as certificate_source,
       b.report_date    as certificate_date,
       b.total_thc      as certificate_total_thc,
       case when b.tag is null then 'NOT IMPORTED — certificate exists but we have not pulled it'
            when b.hops = 0    then 'ON THE TAG ITSELF'
            else 'INHERITED — ' || b.hops || ' hop(s) up the lineage' end as certificate_basis
from universe u
left join best b on b.tag = u.tag;

create unique index mv_tag_certificate_pk on mv_tag_certificate (tag);

comment on materialized view mv_tag_certificate is
  'The testing certificate for EVERY tag, direct or inherited up the package tree, '
  'drawn from all four sources: parsed COA PDFs, COA files held but unparsed, the '
  'Metrc lab API (2,642 tags back to Sep 2023) and the report export. Nothing ships '
  'without a COA, so "NOT IMPORTED" means the certificate exists and we have not '
  'pulled it -- it is never evidence of a compliance failure.';

grant select on mv_tag_certificate to authenticated;
;
