-- The HR client calls create_disciplinary_action / resolve_disciplinary_action, which never
-- existed. Both the main DA form and the DA-form modal therefore silently discarded records.
-- Wire the expected RPC names to the real disciplinary_records table (same table the read RPC
-- get_disciplinary_actions serves), deriving tenant from the node like sibling hr_issue_discipline.

CREATE OR REPLACE FUNCTION public.create_disciplinary_action(
  p_person_id uuid, p_node_id uuid, p_type text, p_description text,
  p_corrective_action text DEFAULT NULL, p_issued_by_id uuid DEFAULT NULL,
  p_follow_up_date date DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant uuid; v_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM org_nodes WHERE id = p_node_id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Unknown node %', p_node_id; END IF;
  INSERT INTO disciplinary_records(tenant_id, node_id, person_id, issued_by, type, date, description, status)
  VALUES (
    v_tenant, p_node_id, p_person_id, p_issued_by_id,
    COALESCE(NULLIF(p_type,''),'written_warning'), CURRENT_DATE,
    p_description || CASE WHEN COALESCE(p_corrective_action,'') <> ''
      THEN E'\n\nCorrective action: ' || p_corrective_action ELSE '' END,
    'active')
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.resolve_disciplinary_action(
  p_da_id uuid, p_resolution_notes text DEFAULT NULL, p_manager_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE disciplinary_records
     SET status = 'resolved',
         description = description || CASE WHEN COALESCE(p_resolution_notes,'') <> ''
           THEN E'\n\nResolution: ' || p_resolution_notes ELSE '' END,
         updated_at = now()
   WHERE id = p_da_id
   RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Disciplinary record % not found', p_da_id; END IF;
  RETURN v_id;
END; $$;

-- The HR app authenticates via pin_login and calls RPCs under the anon role (like every
-- existing HR RPC), so EXECUTE must be granted to anon for the call to reach the function.
GRANT EXECUTE ON FUNCTION public.create_disciplinary_action(uuid,uuid,text,text,text,uuid,date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_disciplinary_action(uuid,text,uuid) TO anon, authenticated;
