-- Agent I (Database COO), 12 Aug 2026. DBI-044 v4 (reviewers V, X, W).
-- v4: no DROP - guard rule E1 correctly refuses to drop a materialized view (there is no
-- CREATE OR REPLACE and no way back). Earlier attempts rolled back atomically, so nothing
-- exists to replace. v3's dedupe kept: metrc_packages holds one row per tag PER LICENCE and
-- tag 1A40A03000015E1000069576 - one of Agent V's seven cross-licence tags - broke the unique
-- index. Evidence belongs to the TAG: a certificate does not change because material moved
-- between our own licences.
--
-- OWNER RULING: "no item anywhere on site can be missing full forensic drill down with
-- documents - even in a line item or report, no matter where." Measured cause of the room-tile
-- "409 NO CERTIFICATE": 153 direct · 205 TESTED, Metrc holds the lab result, no certificate
-- linked · 378 have a parent to inherit from and C3a says direct OR INHERITED, never computed ·
-- 118 genuinely never submitted · 0 unparsed documents.
--
-- UNDO: this matview cannot be dropped without owner approval (rule E1). To retire it, ask.

create materialized view if not exists public.mv_tag_evidence as
with pkg as (
  select distinct on (p.tag) p.tag, p.item_name, p.lab_testing_state, p.raw
  from metrc_packages p
  order by p.tag,
           (p.source_state = 'active' and not coalesce(p.finished,false)) desc,
           (p.raw->>'LastModified') desc nulls last
),
lineage as (
  with recursive walk as (
    select k.tag as tag, k.tag as ancestor, 0 as generation from pkg k
    union all
    select w.tag, upper(btrim(x.lbl)), w.generation + 1
    from walk w
    join pkg pp on pp.tag = w.ancestor,
    lateral unnest(string_to_array(coalesce(pp.raw->>'SourcePackageLabels',''), ',')) x(lbl)
    where w.generation < 5 and btrim(x.lbl) <> ''
  )
  select * from walk
),
best as (
  select l.tag,
         min(l.generation) filter (where exists (select 1 from coa_extract c where c.package_tag = l.ancestor)) as coa_generation
  from lineage l group by l.tag
)
select p.tag, p.item_name, p.lab_testing_state,
       case
         when dc.package_tag is not null   then 'direct'
         when b.coa_generation is not null then 'inherited'
         when lr.package_tag is not null   then 'lab result only'
         else 'none'
       end                                              as evidence_source,
       coalesce(dc.lab_report_id, ic.lab_report_id)     as certificate_id,
       coalesce(dc.report_date,   ic.report_date)       as certificate_date,
       coalesce(dc.total_thc,     ic.total_thc)         as total_thc,
       anc.ancestor_tag                                 as certificate_inherited_from,
       coalesce(cd.storage_path, lr.coa_link)           as certificate_document,
       lr.result_date                                   as lab_result_date,
       lr.lab_facility                                  as lab_name,
       mt.manifest_number,
       md.storage_path                                  as manifest_document,
       case
         when dc.package_tag is not null   then null
         when b.coa_generation is not null then null
         when lr.package_tag is not null then
           'Tested — Metrc holds a lab result' ||
           coalesce(' dated ' || to_char(lr.result_date,'DD Mon YYYY'), '') ||
           coalesce(' from ' || lr.lab_facility, '') ||
           ', but no certificate document is linked to this tag. The test happened; the paperwork is not attached.'
         when p.lab_testing_state = 'NotSubmitted' then
           'Never submitted for testing. No certificate because there was no test — this material cannot be sold until it is submitted.'
         when coalesce(p.raw->>'SourcePackageLabels','') = '' then
           'No certificate, no lab result, and no parent package to inherit from. This tag has no testing evidence of any kind anywhere in the platform.'
         else
           'No certificate on this tag and none on up to five generations of parents. Lab state is ' ||
           coalesce(p.lab_testing_state,'unknown') || '.'
       end                                              as why_no_certificate,
       case when mt.manifest_number is null then
         'No inbound manifest line for this tag in the transfer report. Either it was produced here — check the parent packages — or the transfer report has not been imported for that period.'
       end                                              as why_no_manifest
from pkg p
left join best b on b.tag = p.tag
left join lateral (select c.lab_report_id, c.report_date, c.total_thc, c.package_tag
                     from coa_extract c where c.package_tag = p.tag
                    order by c.report_date desc nulls last limit 1) dc on true
left join lateral (select l.ancestor as ancestor_tag from lineage l
                    where l.tag = p.tag and l.generation = b.coa_generation
                      and exists (select 1 from coa_extract c where c.package_tag = l.ancestor)
                    limit 1) anc on true
left join lateral (select c.lab_report_id, c.report_date, c.total_thc
                     from coa_extract c where c.package_tag = anc.ancestor_tag
                    order by c.report_date desc nulls last limit 1) ic on true
left join lateral (select d.storage_path from metrc_documents d
                    where d.package_tag = coalesce(dc.package_tag, anc.ancestor_tag)
                      and d.doc_type ilike '%coa%' limit 1) cd on true
left join lateral (select l2.package_tag, l2.result_date, l2.lab_facility, l2.coa_link
                     from metrc_lab_results l2 where l2.package_tag = p.tag
                    order by l2.result_date desc nulls last limit 1) lr on true
left join lateral (select t.manifest_number from metrc_rpt_package_transfers t
                    where t.package_tag = p.tag
                    order by t.as_of_date desc nulls last limit 1) mt on true
left join lateral (select d2.storage_path from metrc_documents d2
                    where d2.manifest_number = mt.manifest_number
                      and d2.doc_type ilike '%manifest%' limit 1) md on true;

create unique index if not exists mv_tag_evidence_uq  on public.mv_tag_evidence (tag);
create index        if not exists mv_tag_evidence_src on public.mv_tag_evidence (evidence_source);

comment on materialized view public.mv_tag_evidence is
 'THE evidence resolver - one row per TAG. Every line item, report, drill, export and tile '
 'answers the document question from here, so a tag can never read "certified" on one page and '
 '"no certificate" on another: one-figure-one-value applied to EVIDENCE. Order: direct '
 'certificate, then INHERITED from up to five generations of parents (C3a: direct OR inherited), '
 'then a Metrc lab result with no certificate attached, then nothing - and when nothing, '
 'why_no_certificate says WHY in a sentence a person can act on (A3). Built 12 Aug 2026 after '
 'room tiles read "409 NO CERTIFICATE" while 205 of those tags held a lab result and 378 had a '
 'parent nobody had walked.';

create or replace function public.tg_refresh_dashboards()
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  refresh materialized view concurrently mv_department_dashboard_base;
  refresh materialized view concurrently mv_dept_dash_supplement;
  refresh materialized view concurrently mv_global_management;
  refresh materialized view concurrently mv_harvest_dry_stats;
  refresh materialized view concurrently mv_flow_stages;
  refresh materialized view concurrently mv_room_board;
  refresh materialized view concurrently mv_tag_evidence;
end $function$;;
