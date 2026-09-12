-- Wire five phantom RPCs the HR client calls to their real (existing) tables.
-- All SECURITY DEFINER + GRANT anon (app auth = pin_login → anon role).

-- 1) PTO submissions -> time_off_requests (no tenant_id column on this table)
CREATE OR REPLACE FUNCTION public.submit_pto_request(
  p_person_id uuid, p_node_id uuid, p_type text, p_start_date date, p_end_date date, p_reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO time_off_requests(person_id, node_id, type, start_date, end_date, total_days, notes, status)
  VALUES (p_person_id, p_node_id, COALESCE(NULLIF(p_type,''),'pto'),
          p_start_date, COALESCE(p_end_date,p_start_date),
          GREATEST(1, (COALESCE(p_end_date,p_start_date) - p_start_date) + 1),
          p_reason, 'pending')
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- 2) Incident creation -> incidents (tenant derived from node)
CREATE OR REPLACE FUNCTION public.create_incident(
  p_node_id uuid, p_type text, p_severity text, p_description text, p_reported_by uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant uuid; v_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM org_nodes WHERE id = p_node_id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Unknown node %', p_node_id; END IF;
  INSERT INTO incidents(tenant_id, node_id, reported_by, date, type, severity, description, status)
  VALUES (v_tenant, p_node_id, p_reported_by, CURRENT_DATE,
          COALESCE(NULLIF(p_type,''),'other'), COALESCE(NULLIF(p_severity,''),'low'),
          p_description, 'open')
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- 3) Incident update (status + investigation notes -> follow_up)
CREATE OR REPLACE FUNCTION public.update_incident(
  p_incident_id uuid, p_status text DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE incidents
     SET status    = COALESCE(NULLIF(p_status,''), status),
         follow_up = COALESCE(p_notes, follow_up),
         updated_at = now()
   WHERE id = p_incident_id
   RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Incident % not found', p_incident_id; END IF;
  RETURN v_id;
END; $$;

-- 4) Clock in -> time_punches (idempotent: reuse an already-open punch)
CREATE OR REPLACE FUNCTION public.punch_in(
  p_person_id uuid, p_node_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM time_punches
   WHERE person_id = p_person_id AND punched_out_at IS NULL
   ORDER BY punched_in_at DESC LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;  -- already clocked in
  INSERT INTO time_punches(person_id, node_id, work_date, punched_in_at)
  VALUES (p_person_id, p_node_id, CURRENT_DATE, now())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- 5) Clock out -> close the latest open punch, compute hours
CREATE OR REPLACE FUNCTION public.punch_out(
  p_person_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE time_punches
     SET punched_out_at = now(),
         hours_worked = ROUND(EXTRACT(EPOCH FROM (now() - punched_in_at))/3600.0, 2)
   WHERE id = (SELECT id FROM time_punches
                WHERE person_id = p_person_id AND punched_out_at IS NULL
                ORDER BY punched_in_at DESC LIMIT 1)
   RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'No open punch for person %', p_person_id; END IF;
  RETURN v_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.submit_pto_request(uuid,uuid,text,date,date,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_incident(uuid,text,text,text,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_incident(uuid,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.punch_in(uuid,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.punch_out(uuid) TO anon, authenticated;
