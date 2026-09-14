-- ============================================================================
-- Forms Hub — real backend
-- ----------------------------------------------------------------------------
-- The Forms Hub screen previously rendered a seeded MOCK_RECENT feed and
-- seed()-generated KPI tiles. This migration wires it to a genuine, unified
-- "recent form submissions" feed aggregated across the real HR artifact tables
-- (disciplinary_records, time_off_requests, incidents, onboarding_hires and the
-- generic hr_forms store) plus a KPI summary. Both functions are read-only,
-- SECURITY DEFINER (the HR app calls RPCs as the anon role via pin_login), and
-- resolve employee/location names from people + org_nodes. No new tables are
-- introduced — every source already exists in the HR brain.
-- ============================================================================

-- ── Unified recent-submissions feed ─────────────────────────────────────────
-- Returns each real HR artifact mapped to the shape the Forms Hub table renders:
--   id, form_type (human label), employee, location, date, status (normalized).
CREATE OR REPLACE FUNCTION public.rpc_formshub_feed(
  p_date_from date   DEFAULT NULL,
  p_date_to   date   DEFAULT NULL,
  p_search    text   DEFAULT NULL,
  p_emp_id    text   DEFAULT NULL,
  p_node_ids  uuid[] DEFAULT NULL
) RETURNS TABLE (
  id        text,
  form_type text,
  employee  text,
  location  text,
  "date"    date,
  status    text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH src AS (
    -- Disciplinary actions
    SELECT d.id::text                                                          AS id,
           'Disciplinary — ' || initcap(replace(COALESCE(d.type,'action'),'_',' ')) AS form_type,
           d.person_id                                                         AS person_id,
           NULL::text                                                          AS emp_name,
           d.node_id                                                           AS node_id,
           d.date::date                                                        AS dt,
           d.status                                                            AS raw_status
      FROM disciplinary_records d
    UNION ALL
    -- PTO / leave requests
    SELECT t.id::text,
           'PTO / Leave (' || initcap(COALESCE(t.type,'pto')) || ')',
           t.person_id, NULL::text, t.node_id, t.start_date::date, t.status
      FROM time_off_requests t
    UNION ALL
    -- Incident / workers-comp reports
    SELECT i.id::text,
           'Incident Report',
           i.reported_by, NULL::text, i.node_id, i.date::date, i.status
      FROM incidents i
    UNION ALL
    -- New-hire onboarding packets (person not yet created; carries full_name)
    SELECT o.id::text,
           'New Hire Onboarding',
           NULL::uuid, o.full_name, o.node_id,
           COALESCE(o.start_date, o.created_at::date), o.status
      FROM onboarding_hires o
    UNION ALL
    -- Generic HR forms store (timesheets, callout trackers, ad-hoc forms, …)
    SELECT f.id::text,
           initcap(replace(COALESCE(f.form_type,'form'),'_',' ')),
           f.person_id, NULL::text, f.node_id, f.created_at::date, f.status
      FROM hr_forms f
  )
  SELECT s.id,
         s.form_type,
         COALESCE(pe.full_name, s.emp_name, 'Unassigned')                      AS employee,
         COALESCE(n.name, '—')                                                 AS location,
         s.dt                                                                  AS "date",
         CASE lower(COALESCE(s.raw_status,''))
           WHEN 'approved'  THEN 'APPROVED'
           WHEN 'denied'    THEN 'DENIED'
           WHEN 'rejected'  THEN 'DENIED'
           WHEN 'resolved'  THEN 'COMPLETE'
           WHEN 'complete'  THEN 'COMPLETE'
           WHEN 'completed' THEN 'COMPLETE'
           WHEN 'converted' THEN 'COMPLETE'
           WHEN 'closed'    THEN 'COMPLETE'
           ELSE 'PENDING'
         END                                                                   AS status
    FROM src s
    LEFT JOIN people    pe ON pe.id = s.person_id
    LEFT JOIN org_nodes n  ON n.id  = s.node_id
   WHERE (p_node_ids  IS NULL OR s.node_id = ANY(p_node_ids))
     AND (p_date_from IS NULL OR s.dt >= p_date_from)
     AND (p_date_to   IS NULL OR s.dt <= p_date_to)
     AND (p_search    IS NULL OR COALESCE(pe.full_name, s.emp_name, '') ILIKE '%'||p_search||'%')
     AND (p_emp_id    IS NULL OR s.person_id::text = p_emp_id OR s.id = p_emp_id)
   ORDER BY s.dt DESC NULLS LAST
   LIMIT 200;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_formshub_feed(date,date,text,text,uuid[]) TO anon, authenticated;

-- ── KPI summary ─────────────────────────────────────────────────────────────
-- Real counts for the six Forms Hub tiles. All-time pending queues plus
-- today / month-to-date windows. Scoped to the caller's locations when given.
CREATE OR REPLACE FUNCTION public.rpc_formshub_kpis(
  p_node_ids uuid[] DEFAULT NULL
) RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH feed AS (
    SELECT * FROM public.rpc_formshub_feed(NULL, NULL, NULL, NULL, p_node_ids)
  )
  SELECT json_build_object(
    'submitted_today',    (SELECT count(*) FROM feed WHERE "date" = current_date),
    'pending_approvals',  (SELECT count(*) FROM feed WHERE status = 'PENDING'),
    'pto_pending',        (SELECT count(*) FROM time_off_requests t
                            WHERE lower(COALESCE(t.status,'')) = 'pending'
                              AND (p_node_ids IS NULL OR t.node_id = ANY(p_node_ids))),
    'timesheets_pending', (SELECT count(*) FROM hr_forms f
                            WHERE f.form_type ILIKE '%time%'
                              AND lower(COALESCE(f.status,'')) IN ('pending','draft','submitted')
                              AND (p_node_ids IS NULL OR f.node_id = ANY(p_node_ids))),
    'workers_comp_active',(SELECT count(*) FROM incidents i
                            WHERE lower(COALESCE(i.status,'')) = 'open'
                              AND (p_node_ids IS NULL OR i.node_id = ANY(p_node_ids))),
    'total_mtd',          (SELECT count(*) FROM feed WHERE "date" >= date_trunc('month', current_date)::date)
  );
$$;

GRANT EXECUTE ON FUNCTION public.rpc_formshub_kpis(uuid[]) TO anon, authenticated;
