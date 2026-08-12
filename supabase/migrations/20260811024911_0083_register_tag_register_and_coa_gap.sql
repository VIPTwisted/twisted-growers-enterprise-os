-- 0083 — The tag register, the COA lineage, and the COA pull-list, on screen.
create or replace view v_tag_coa_gap as
select m.tag,
       m.item, m.category, m.strain, m.ownership, m.grown_or_processed_by,
       m.licence, m.room, m.tag_status,
       m.packaged_on, m.first_received, m.last_shipped,
       coalesce(m.last_shipped, m.first_received, m.packaged_on) as moved_on,
       m.manifests_in, m.received_from,
       m.manifests_out, m.shipped_to,
       m.on_hand_lb, m.shipped_lb,
       c.coa_basis, c.coa_found_on_tag, c.coa_hops, c.coa_document,
       m.source_harvests, m.source_packages, m.known_from
from v_tag_master m
join mv_tag_coa_lineage c on c.tag = m.tag
where c.coa_document is null;

comment on view v_tag_coa_gap is
  'Every tag with NO certificate anywhere in its lineage. Owner rule: nothing goes out '
  'without a tag, a manifest AND a COA, both ways — so a tag on this list means OUR COA '
  'LIBRARY IS INCOMPLETE, not that the material was untested. Use moved_on to pull the '
  'right COA reports for the right periods.';

grant select on v_tag_coa_gap to authenticated;

insert into nav_registry (category, label, view_key, table_ref, surface, page_kind,
                          archetype, report_group, module, icon, description,
                          date_policy, default_range, range_kind, enabled, item_order)
values
 ('Reports','Tag Register — every tag, manifest and COA','tag_master','v_tag_master',
  'reports','report','custody_chain','Inventory & Audit','reports','box',
  'Every tag we have ever touched, from all seven sources, with its inbound and '
  'outbound manifests, counterparties, room, ownership and certificate of analysis.',
  'auto','this_year','activity',true,20),
 ('Reports','COA by Tag (direct or inherited)','tag_coa_lineage','mv_tag_coa_lineage',
  'reports','report','document_register','Inventory & Audit','reports','box',
  'The certificate for every tag, its own or inherited up the package tree, with how '
  'many hops away it was found. A COA belongs to the lot that was tested, not to each '
  'retail unit cut from it.',
  'not_applicable','this_year','activity',true,21),
 ('Reports','COA Gap — tags with no certificate','tag_coa_gap','v_tag_coa_gap',
  'reports','report','issue_queue','Inventory & Audit','reports','box',
  'Tags with no certificate anywhere in their lineage. Nothing ships without a COA, so '
  'every row here is a hole in our COA library — pull the certificate for that period.',
  'auto','this_year','activity',true,22)
on conflict (view_key) do update set
  label=excluded.label, table_ref=excluded.table_ref, description=excluded.description, enabled=true;

insert into report_registry (report_key, title, category, fact_view, date_column,
                             dimensions, measures, description, enabled)
values
 ('inventory.tag_register','Tag Register','Inventory','v_tag_master','packaged_on',
  array['tag_status','ownership','category','strain','room','licence','grown_or_processed_by',
        'coa_status','received_from','shipped_to','known_from'],
  array['on_hand_lb','shipped_lb'],
  'Every tag, with manifests and COA.', true),
 ('inventory.coa_gap','COA Gap by Tag','Quality','v_tag_coa_gap','moved_on',
  array['ownership','category','strain','tag_status','room','received_from','shipped_to'],
  array['on_hand_lb','shipped_lb'],
  'Tags with no certificate anywhere in lineage — holes in the COA library.', true)
on conflict (report_key) do update set
  fact_view=excluded.fact_view, date_column=excluded.date_column,
  dimensions=excluded.dimensions, measures=excluded.measures, enabled=true;

create or replace function tg_snapshot_dashboards()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare n int;
begin
  refresh materialized view concurrently mv_department_dashboard_base;
  refresh materialized view mv_forensic_sales;
  refresh materialized view concurrently mv_tag_coa_lineage;
  refresh materialized view concurrently mv_dept_dash_audit_tiles;
  insert into dashboard_snapshots (taken_on, department, kpi, value, unit)
  select current_date, department, kpi, value, unit from mv_department_dashboard
  on conflict (taken_on, department, kpi) do update set value = excluded.value;
  get diagnostics n = row_count;
  return n;
end $function$;
;
