-- f_package_360 reads the four materialised sources (dossier, lifecycle, gaps, events) and says when each was
-- computed; the nine light sources stay live. Measured before: 23 s; target after: under 1.5 s (BP-4-1).
create or replace function public.f_package_360(p_tag text)
returns jsonb
language sql stable security invoker set search_path = public as $$
with t as (select upper(btrim(p_tag)) as tag),
asof as (
  select jsonb_object_agg(matview, last_ok) as j from (
    select matview, max(started_at) filter (where ok) as last_ok from public.matview_refresh_run
     where matview in ('mv_package_dossier','mv_tag_lifecycle','mv_tag_gap','mv_package_events') group by matview) x)
select jsonb_build_object(
  'tag', (select tag from t),
  'found', exists (select 1 from public.metrc_packages p, t where p.tag = t.tag),
  'as_of', now(),
  'materialised_as_of', (select j from asof),
  'dossier',   (select to_jsonb(d) from public.mv_package_dossier d, t where d.package_tag = t.tag limit 1),
  'master',    (select to_jsonb(m) from public.v_tag_master m, t where m.tag = t.tag limit 1),
  'lifecycle', (select to_jsonb(l) - 'metrc_screen' || jsonb_build_object('metrc_screen', 'https://ma.metrc.com/industry/' || coalesce(l.held_under_licence, '') || '/packages')
                from public.mv_tag_lifecycle l, t where l.tag = t.tag limit 1),
  'ledger',    (select to_jsonb(g) from public.v_tag_ledger g, t where g.package_tag = t.tag limit 1),
  'provenance',(select to_jsonb(v) from public.v_tag_provenance v, t where v.package_tag = t.tag limit 1),
  'evidence',  (select to_jsonb(e) from public.v_tag_evidence e, t where e.tag = t.tag limit 1),
  'certificate',(select to_jsonb(c) from public.v_tag_certificate_final c, t where c.tag = t.tag limit 1),
  'timeline', (
    select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) from (
      select jsonb_build_object('at', e.event_at, 'kind', e.event_type, 'stage', e.stage, 'where', e.location,
                                'manifest', e.manifest_number, 'counterparty', e.counterparty_licence,
                                'qty', e.qty, 'uom', e.uom, 'source', e.source) as x
        from public.tag_event e, t where e.tag = t.tag
      union all
      select jsonb_build_object('at', pe.event_date, 'kind', pe.event, 'stage', null, 'where', pe.room,
                                'manifest', null, 'counterparty', pe.counterparty,
                                'qty', pe.lb_delta, 'uom', 'lb', 'source', 'package_events (materialised)')
        from public.mv_package_events pe, t where pe.package_tag = t.tag
    ) s),
  'dwell', (select coalesce(jsonb_agg(to_jsonb(w) order by w.event_at), '[]'::jsonb) from public.v_tag_dwell w, t where w.tag = t.tag),
  'documents', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from public.v_package_documents d, t where d.package_tag = t.tag),
  'gaps', (select coalesce(jsonb_agg(to_jsonb(g) - 'rn'), '[]'::jsonb) from public.mv_tag_gap g, t where g.tag = t.tag),
  'custody_alerts', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from public.v_custody_alerts a, t where a.identifier = t.tag),
  'apex', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.v_metrc_apex_tag_reconciliation r, t where r.package_tag = t.tag),
  'findings', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'at', f.detected_at, 'agent', f.agent, 'severity', f.severity,
                    'headline', f.headline, 'detail', left(f.detail, 400), 'dollars', f.dollars, 'pounds', f.pounds,
                    'resolved_at', f.resolved_at, 'resolution', f.resolution, 'drill_to', f.drill_to) order by f.detected_at desc), '[]'::jsonb)
               from public.agent_findings f, t where f.detail ilike '%' || t.tag || '%' or f.headline ilike '%' || t.tag || '%' or f.scope ilike '%' || t.tag || '%'),
  'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'title', k.title, 'status', k.status, 'priority', k.priority,
                    'due_on', k.due_on, 'assignee', (select full_name from public.employees em where em.id = k.assignee_employee_id),
                    'created_at', k.created_at) order by k.created_at desc), '[]'::jsonb)
            from public.tasks k, t where k.source_kpi = t.tag or k.title ilike '%' || t.tag || '%' or t.tag = any(coalesce(k.tags, '{}'))),
  'sources', jsonb_build_array('metrc_packages (Metrc, legal record, read-only)', 'tag_event (seed-to-sale ledger)',
    'coa_extract (parsed certificates)', 'metrc_transfers / manifest_extract', 'apex (sales source of record)', 'agent_findings', 'tasks',
    'dossier · lifecycle · gaps · events: materialised every 15 min')
);
$$;;
