-- Measured 02:50 UTC: as the postgres role the function answers in 0.73 s; as the owner through PostgREST it
-- still hit the statement timeout — row-level security on the thirteen source tables is evaluated per row
-- inside every view, which defeats the predicate pushdown. Same answer the dashboards use: SECURITY DEFINER,
-- with the door decided by the owner's own menu-visibility rows (nav_role_visibility for the packages
-- report), never by a list in code. A role that may not see packages gets a refusal that says why.
create or replace function public.f_package_360(p_tag text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare tg text := upper(btrim(p_tag)); out jsonb; r text := public.current_app_role()::text;
begin
  if r is null then raise exception 'Sign in to open a package.' using errcode = '42501'; end if;
  if not exists (select 1 from public.nav_role_visibility v where v.role = r and v.view_key = 'rpt-packages-inventory' and v.visible) then
    raise exception 'The % role may not open packages — set under Menu Visibility by Role (rpt-packages-inventory).', r using errcode = '42501';
  end if;
  select jsonb_build_object(
    'tag', tg,
    'found', exists (select 1 from public.metrc_packages p where p.tag = tg),
    'as_of', now(),
    'materialised_as_of', (select jsonb_object_agg(matview, last_ok) from (
        select matview, max(started_at) filter (where ok) as last_ok from public.matview_refresh_run
         where matview in ('mv_package_dossier','mv_tag_lifecycle','mv_tag_gap','mv_package_events') group by matview) x),
    'dossier',   (select to_jsonb(d) from public.mv_package_dossier d where d.package_tag = tg limit 1),
    'master',    (select to_jsonb(m) from public.v_tag_master m where m.tag = tg limit 1),
    'lifecycle', (select to_jsonb(l) - 'metrc_screen' || jsonb_build_object('metrc_screen', 'https://ma.metrc.com/industry/' || coalesce(l.held_under_licence, '') || '/packages')
                  from public.mv_tag_lifecycle l where l.tag = tg limit 1),
    'ledger',    (select to_jsonb(g) from public.v_tag_ledger g where g.package_tag = tg limit 1),
    'provenance',(select to_jsonb(v) from public.v_tag_provenance v where v.package_tag = tg limit 1),
    'evidence',  (select to_jsonb(e) from public.v_tag_evidence e where e.tag = tg limit 1),
    'certificate',(select to_jsonb(c) from public.v_tag_certificate_final c where c.tag = tg limit 1),
    'timeline', (
      select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) from (
        select jsonb_build_object('at', e.event_at, 'kind', e.event_type, 'stage', e.stage, 'where', e.location,
                                  'manifest', e.manifest_number, 'counterparty', e.counterparty_licence,
                                  'qty', e.qty, 'uom', e.uom, 'source', e.source) as x
          from public.tag_event e where e.tag = tg
        union all
        select jsonb_build_object('at', pe.event_date, 'kind', pe.event, 'stage', null, 'where', pe.room,
                                  'manifest', null, 'counterparty', pe.counterparty,
                                  'qty', pe.lb_delta, 'uom', 'lb', 'source', 'package_events (materialised)')
          from public.mv_package_events pe where pe.package_tag = tg
      ) s),
    'dwell', (select coalesce(jsonb_agg(to_jsonb(w) order by w.event_at), '[]'::jsonb) from public.v_tag_dwell w where w.tag = tg),
    'documents', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from public.v_package_documents d where d.package_tag = tg),
    'gaps', (select coalesce(jsonb_agg(to_jsonb(g) - 'rn'), '[]'::jsonb) from public.mv_tag_gap g where g.tag = tg),
    'custody_alerts', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from public.v_custody_alerts a where a.identifier = tg),
    'apex', (select coalesce(jsonb_agg(to_jsonb(r2)), '[]'::jsonb) from public.v_metrc_apex_tag_reconciliation r2 where r2.package_tag = tg),
    'findings', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'at', f.detected_at, 'agent', f.agent, 'severity', f.severity,
                      'headline', f.headline, 'detail', left(f.detail, 400), 'dollars', f.dollars, 'pounds', f.pounds,
                      'resolved_at', f.resolved_at, 'resolution', f.resolution, 'drill_to', f.drill_to) order by f.detected_at desc), '[]'::jsonb)
                 from public.agent_findings f where f.detail ilike '%' || tg || '%' or f.headline ilike '%' || tg || '%' or f.scope ilike '%' || tg || '%'),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'title', k.title, 'status', k.status, 'priority', k.priority,
                      'due_on', k.due_on, 'assignee', (select full_name from public.employees em where em.id = k.assignee_employee_id),
                      'created_at', k.created_at) order by k.created_at desc), '[]'::jsonb)
              from public.tasks k where k.source_kpi = tg or k.title ilike '%' || tg || '%' or tg = any(coalesce(k.tags, '{}'))),
    'sources', jsonb_build_array('metrc_packages (Metrc, legal record, read-only)', 'tag_event (seed-to-sale ledger)',
      'coa_extract (parsed certificates)', 'metrc_transfers / manifest_extract', 'apex (sales source of record)', 'agent_findings', 'tasks',
      'dossier · lifecycle · gaps · events: materialised every 15 min')
  ) into out;
  return out;
end $$;
-- the search shares the door
create or replace function public.f_package_search(p_q text)
returns table (tag text, item text, strain text, room text, on_hand_lb numeric, finished boolean, licence text)
language plpgsql stable security definer set search_path = public as $$
declare q text := upper(btrim(p_q)); r text := public.current_app_role()::text;
begin
  if r is null or not exists (select 1 from public.nav_role_visibility v where v.role = r and v.view_key = 'rpt-packages-inventory' and v.visible) then return; end if;
  if length(q) < 4 then return; end if;
  return query
  select m.tag, m.item, m.strain, m.room, m.on_hand_lb, m.finished, m.licence
    from public.v_tag_master m
   where m.tag like '%' || q || '%' or upper(coalesce(m.item, '')) like '%' || q || '%' or upper(coalesce(m.strain, '')) like '%' || q || '%'
   order by (m.tag like '%' || q) desc, m.finished asc nulls last, m.packaged_on desc nulls last
   limit 20;
end $$;;
