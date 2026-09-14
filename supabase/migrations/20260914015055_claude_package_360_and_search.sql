-- Blueprint 2026 §4, first object: the Package (Tag) 360. Owner, 14 Sep 2026: go-live 23 Sep; "use what we
-- have". Nothing is derived here that was not already derived: this assembles the views the platform already
-- certifies (dossier, master, lifecycle, events, ledger, documents, evidence, gaps, dwell, custody alerts,
-- Apex reconciliation, findings, tasks) into one answer per tag. SECURITY INVOKER: the caller's own row-level
-- security applies to every source, so a role sees exactly what its pages already let it see.
create or replace function public.f_package_360(p_tag text)
returns jsonb
language sql stable security invoker set search_path = public as $$
with t as (select upper(btrim(p_tag)) as tag)
select jsonb_build_object(
  'tag', (select tag from t),
  'found', exists (select 1 from public.metrc_packages p, t where p.tag = t.tag),
  'as_of', now(),
  'dossier',   (select to_jsonb(d) from public.v_package_dossier d, t where d.package_tag = t.tag limit 1),
  'master',    (select to_jsonb(m) from public.v_tag_master m, t where m.tag = t.tag limit 1),
  'lifecycle', (select to_jsonb(l) from public.v_tag_lifecycle l, t where l.tag = t.tag limit 1),
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
                                'qty', pe.lb_delta, 'uom', 'lb', 'source', 'package_events')
        from public.v_package_events pe, t where pe.package_tag = t.tag
    ) s),
  'dwell', (select coalesce(jsonb_agg(to_jsonb(w) order by w.event_at), '[]'::jsonb) from public.v_tag_dwell w, t where w.tag = t.tag),
  'documents', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from public.v_package_documents d, t where d.package_tag = t.tag),
  'gaps', (select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) from public.v_tag_gap g, t where g.tag = t.tag),
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
    'coa_extract (parsed certificates)', 'metrc_transfers / manifest_extract', 'apex (sales source of record)', 'agent_findings', 'tasks')
);
$$;
grant execute on function public.f_package_360(text) to authenticated;

-- Find a tag from a fragment (last digits, or any run of the tag), or an item name. Top 20.
create or replace function public.f_package_search(p_q text)
returns table (tag text, item text, strain text, room text, on_hand_lb numeric, finished boolean, licence text)
language sql stable security invoker set search_path = public as $$
  with q as (select upper(btrim(p_q)) as q)
  select m.tag, m.item, m.strain, m.room, m.on_hand_lb, m.finished, m.licence
    from public.v_tag_master m, q
   where length(q.q) >= 4
     and (m.tag like '%' || q.q || '%' or upper(coalesce(m.item, '')) like '%' || q.q || '%' or upper(coalesce(m.strain, '')) like '%' || q.q || '%')
   order by (m.tag like '%' || q.q) desc, m.finished asc nulls last, m.packaged_on desc nulls last
   limit 20;
$$;
grant execute on function public.f_package_search(text) to authenticated;;
