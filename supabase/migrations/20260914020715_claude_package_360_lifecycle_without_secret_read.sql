-- Measured on the page 14 Sep 2026 02:20 UTC: f_package_360 failed for the owner with "permission denied for
-- table integration_secrets" — v_tag_lifecycle builds its metrc_screen link by reading METRC_STATE from the
-- secrets table, which no signed-in role may read. The function stays SECURITY INVOKER (the caller's RLS is
-- the point); it now reads the lifecycle's stage columns by name and builds the Metrc link itself from the
-- locked fact that this is a Massachusetts operator (CLAUDE.md, locked facts).
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
  'lifecycle', (select jsonb_build_object(
                  'stage1_harvest', l.stage1_harvest, 'stage1_cut_on', l.stage1_cut_on, 'stage1_grown_in', l.stage1_grown_in, 'stage1_note', l.stage1_note,
                  'stage2_packaged_on', l.stage2_packaged_on, 'stage2_made_from_packages', l.stage2_made_from_packages, 'stage2_production_batch', l.stage2_production_batch,
                  'stage3_submitted_on', l.stage3_submitted_on, 'stage3_result_on', l.stage3_result_on, 'stage3_lab_state', l.stage3_lab_state, 'stage3_laboratory', l.stage3_laboratory,
                  'stage3_certificate', l.stage3_certificate, 'stage3_certificate_date', l.stage3_certificate_date, 'stage3_coa_document', l.stage3_coa_document, 'stage3_evidence_basis', l.stage3_evidence_basis, 'stage3_note', l.stage3_note,
                  'stage4_manifest', l.stage4_manifest, 'stage4_shipped_on', l.stage4_shipped_on, 'stage4_shipped_to', l.stage4_shipped_to, 'stage4_buyer_licence', l.stage4_buyer_licence, 'stage4_transfer_type', l.stage4_transfer_type,
                  'stage4_created_by', l.stage4_created_by, 'stage4_received_by', l.stage4_received_by, 'stage4_manifest_document', l.stage4_manifest_document, 'stage4_note', l.stage4_note,
                  'stage5_apex_invoice', l.stage5_apex_invoice, 'stage5_invoice_date', l.stage5_invoice_date, 'stage5_invoice_usd', l.stage5_invoice_usd, 'stage5_payment_status', l.stage5_payment_status, 'stage5_note', l.stage5_note,
                  'stage6_finished', l.stage6_finished, 'stage6_finished_on', l.stage6_finished_on,
                  'audit_room', l.audit_room, 'audit_lb', l.audit_lb, 'audit_quantity', l.audit_quantity, 'audit_uom', l.audit_uom, 'where_to_audit', l.where_to_audit,
                  'metrc_screen', 'https://ma.metrc.com/industry/' || coalesce(l.held_under_licence, '') || '/packages')
                from public.v_tag_lifecycle l, t where l.tag = t.tag limit 1),
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
$$;;
