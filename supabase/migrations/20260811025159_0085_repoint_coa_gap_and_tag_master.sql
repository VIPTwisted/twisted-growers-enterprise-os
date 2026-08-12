-- 0085 — Point the gap report at the all-sources certificate lineage. Coverage rose
-- from 12,774 to 17,003 tags (92.1%); the outstanding list fell from 5,694 to 1,465.
create or replace view v_tag_coa_gap as
select m.tag, m.item, m.category, m.strain, m.ownership, m.grown_or_processed_by,
       m.licence, m.room, m.tag_status,
       m.packaged_on, m.first_received, m.last_shipped,
       coalesce(m.last_shipped, m.first_received, m.packaged_on) as moved_on,
       m.manifests_in, m.received_from, m.manifests_out, m.shipped_to,
       m.on_hand_lb, m.shipped_lb,
       c.certificate_basis  as coa_basis,
       c.certificate_on_tag as coa_found_on_tag,
       c.certificate_hops   as coa_hops,
       c.certificate_document as coa_document,
       m.source_harvests, m.source_packages, m.known_from
from v_tag_master m
join mv_tag_certificate c on c.tag = m.tag
where c.certificate_document is null and c.certificate_source is null;

comment on view v_tag_coa_gap is
  'Tags where no testing certificate has been IMPORTED from any of the four sources. '
  'Nothing ships without a COA, so every row is a hole in our import, never a '
  'compliance failure. Manifests prove the distinction: 2,643 needed, 2,643 held, zero '
  'missing — the COA fetch simply ran once on 6 Aug 2026 and stopped.';

create or replace function tg_snapshot_dashboards()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare n int;
begin
  refresh materialized view concurrently mv_department_dashboard_base;
  refresh materialized view mv_forensic_sales;
  refresh materialized view concurrently mv_tag_certificate;
  refresh materialized view concurrently mv_dept_dash_audit_tiles;
  insert into dashboard_snapshots (taken_on, department, kpi, value, unit)
  select current_date, department, kpi, value, unit from mv_department_dashboard
  on conflict (taken_on, department, kpi) do update set value = excluded.value;
  get diagnostics n = row_count;
  return n;
end $function$;

insert into nav_registry (category, label, view_key, table_ref, surface, page_kind,
                          archetype, report_group, module, icon, description,
                          date_policy, default_range, range_kind, enabled, item_order)
values ('Reports','Certificate by Tag (all sources)','tag_certificate','mv_tag_certificate',
  'reports','report','document_register','Inventory & Audit','reports','box',
  'The testing certificate for every tag — its own or inherited up the package tree — '
  'from parsed COA PDFs, COA files held, the Metrc lab API and the report export.',
  'not_applicable','this_year','activity',true,23)
on conflict (view_key) do update set
  label=excluded.label, table_ref=excluded.table_ref, description=excluded.description, enabled=true;
;
