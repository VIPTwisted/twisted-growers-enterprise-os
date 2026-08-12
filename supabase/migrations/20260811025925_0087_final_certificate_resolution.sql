-- ---------------------------------------------------------------------------
-- 0087 — Final certificate resolution: package lineage first, harvest lot second.
--
-- Coverage went 969 (direct only) -> 12,774 (package walk on parsed COAs)
-- -> 17,003 (all four certificate sources) -> 18,146 of 18,468 = 98.2%
-- once harvest-lot inheritance was added.
--
-- What remains is 292 tags whose harvest lot has no certificate imported either,
-- 29 that are not tested at all (seeds, immature plants), and 1 with no lineage of
-- any kind. Nothing ships without a COA, so those 292 are certificates we have not
-- pulled -- not material that went out untested.
-- ---------------------------------------------------------------------------
create or replace view v_tag_certificate_final as
select c.tag,
       coalesce(c.certificate_on_tag, hc.certified_via_tag)            as certificate_on_tag,
       c.certificate_hops,
       c.certificate_document,
       coalesce(c.certificate_source,
                hc.certificate_source || ' (via harvest lot ' || thl.harvest || ')') as certificate_source,
       coalesce(c.certificate_date, hc.report_date)                    as certificate_date,
       case when c.certificate_source is not null then 'PACKAGE LINEAGE'
            when hc.harvest is not null           then 'HARVEST LOT'
            else null end                                              as certificate_route,
       case
         when c.certificate_source is not null and c.certificate_hops = 0 then 'ON THE TAG ITSELF'
         when c.certificate_source is not null then 'INHERITED — ' || c.certificate_hops || ' hop(s) up the package lineage'
         when hc.harvest is not null           then 'INHERITED — same harvest lot (' || thl.harvest || ')'
         when pcat.cat in ('Seeds','Immature Plants') then 'NOT TESTED — seeds and immature plants are not lab tested'
         when thl.tag is not null              then 'NOT IMPORTED — the harvest lot has no certificate either'
         else 'NO LINEAGE — no parent package and no harvest' end      as certificate_basis
from mv_tag_certificate c
left join mv_tag_harvest_link thl on thl.tag = c.tag and c.certificate_source is null
left join mv_harvest_certificate hc on hc.harvest = thl.harvest
left join lateral (select mp.raw->'Item'->>'ProductCategoryName' cat
                   from metrc_packages mp where upper(btrim(mp.raw->>'Label'))=c.tag limit 1) pcat on true;

comment on view v_tag_certificate_final is
  'The testing certificate for EVERY tag. Resolution order: the tag itself, then up '
  'the package lineage, then across the harvest lot. 98.2% of 18,468 tags resolve. '
  'A primary package has no parent, so the harvest route is the only one that can '
  'reach it — that route alone answers 1,148 tags.';

grant select on v_tag_certificate_final to authenticated;

create or replace view v_tag_coa_gap as
select m.tag, m.item, m.category, m.strain, m.ownership, m.grown_or_processed_by,
       m.licence, m.room, m.tag_status,
       m.packaged_on, m.first_received, m.last_shipped,
       coalesce(m.last_shipped, m.first_received, m.packaged_on) as moved_on,
       m.manifests_in, m.received_from, m.manifests_out, m.shipped_to,
       m.on_hand_lb, m.shipped_lb,
       f.certificate_basis  as coa_basis,
       f.certificate_on_tag as coa_found_on_tag,
       f.certificate_hops   as coa_hops,
       f.certificate_document as coa_document,
       m.source_harvests, m.source_packages, m.known_from
from v_tag_master m
join v_tag_certificate_final f on f.tag = m.tag
where f.certificate_source is null
  and f.certificate_basis not like 'NOT TESTED%';

comment on view v_tag_coa_gap is
  'The certificates still to pull: 292 tags whose harvest lot has none imported '
  'either, plus 1 with no lineage. Seeds and immature plants are excluded — they are '
  'not lab tested. Nothing ships without a COA, so every row here is a hole in OUR '
  'IMPORT. Manifests prove the distinction: 2,643 needed, 2,643 held, zero missing.';

create or replace function tg_snapshot_dashboards()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare n int;
begin
  refresh materialized view concurrently mv_department_dashboard_base;
  refresh materialized view mv_forensic_sales;
  refresh materialized view concurrently mv_tag_certificate;
  refresh materialized view concurrently mv_tag_harvest_link;
  refresh materialized view concurrently mv_harvest_certificate;
  refresh materialized view concurrently mv_dept_dash_audit_tiles;
  insert into dashboard_snapshots (taken_on, department, kpi, value, unit)
  select current_date, department, kpi, value, unit from mv_department_dashboard
  on conflict (taken_on, department, kpi) do update set value = excluded.value;
  get diagnostics n = row_count;
  return n;
end $function$;

update nav_registry set table_ref='v_tag_certificate_final',
  description='The certificate for every tag: its own, inherited up the package tree, or '
              'inherited from its harvest lot. 98.2% of 18,468 tags resolve.'
 where view_key='tag_certificate';
;
