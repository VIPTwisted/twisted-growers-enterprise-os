-- ---------------------------------------------------------------------------
-- 0086 — Harvest-lot certificates, as a second pass over the gaps.
--
-- Joining harvests INSIDE the recursive walk timed out. It is also unnecessary: the
-- package walk already resolved 17,003 tags, so the harvest route only has to answer
-- the 1,465 it could not reach. Two cheap passes beat one expensive one.
--
-- WHY the harvest route is needed at all: a PRIMARY package -- one made straight off
-- a harvest -- has no parent package, so package-only lineage can never reach it.
-- 276 of our own Buds tags failed for exactly that reason. A harvest batch is tested
-- as a LOT, so a certificate on any package from harvest X covers harvest X.
-- ---------------------------------------------------------------------------
create materialized view mv_harvest_certificate as
with tag_harvest as (
  select upper(btrim(p.raw->>'Label')) tag, btrim(h.name) harvest
  from metrc_packages p
  join lateral unnest(string_to_array(p.raw->>'SourceHarvestNames', ', ')) h(name) on true
  where nullif(p.raw->>'SourceHarvestNames','') is not null and nullif(btrim(h.name),'') is not null
  union
  select upper(btrim(t.package_tag)), btrim(h.name)
  from metrc_rpt_package_transfers t
  join lateral unnest(string_to_array(t.source_harvest, ', ')) h(name) on true
  where nullif(btrim(t.source_harvest),'') is not null and nullif(btrim(h.name),'') is not null
),
cert as (
  select tag, min(rank) rank, min(kind) kind, max(report_date) report_date
  from (
    select upper(btrim(package_tag)) tag, 1 rank, 'PARSED COA DOCUMENT' kind, report_date::text
    from coa_extract where package_tag is not null
    union all
    select upper(btrim(package_tag)), 2, 'COA FILE HELD, NOT YET PARSED', fetched_at::text
    from metrc_documents where doc_type='coa' and package_tag is not null
    union all
    select upper(btrim(package_tag)), 3, 'METRC LAB RESULT (API)', max(result_date)::text
    from metrc_lab_results where package_tag is not null group by 1
    union all
    select upper(btrim(package_tag)), 4, 'METRC LAB RESULT (report export)', max(test_date)::text
    from metrc_rpt_lab_results where package_tag is not null group by 1
  ) s group by tag
)
select distinct on (th.harvest)
       th.harvest, c.tag as certified_via_tag, c.kind as certificate_source, c.report_date, c.rank
from tag_harvest th join cert c on c.tag = th.tag
order by th.harvest, c.rank;

create unique index mv_harvest_certificate_pk on mv_harvest_certificate (harvest);
grant select on mv_harvest_certificate to authenticated;

comment on materialized view mv_harvest_certificate is
  'Which harvest lots have a testing certificate, and on which package it sits. A '
  'harvest is tested as a LOT, so this covers every package cut from it — including '
  'primary packages, which have no parent package for the tree walk to follow.';

create materialized view mv_tag_harvest_link as
select upper(btrim(p.raw->>'Label')) tag, btrim(h.name) harvest
from metrc_packages p
join lateral unnest(string_to_array(p.raw->>'SourceHarvestNames', ', ')) h(name) on true
where nullif(p.raw->>'SourceHarvestNames','') is not null and nullif(btrim(h.name),'') is not null
union
select upper(btrim(t.package_tag)), btrim(h.name)
from metrc_rpt_package_transfers t
join lateral unnest(string_to_array(t.source_harvest, ', ')) h(name) on true
where nullif(btrim(t.source_harvest),'') is not null and nullif(btrim(h.name),'') is not null;

create unique index mv_tag_harvest_link_pk on mv_tag_harvest_link (tag, harvest);
grant select on mv_tag_harvest_link to authenticated;
;
