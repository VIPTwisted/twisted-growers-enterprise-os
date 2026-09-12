-- Wage changes are legally/audit-sensitive: keep full history (who/when/prior), not a bare column.
CREATE TABLE IF NOT EXISTS public.wage_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  node_id        uuid,
  person_id      uuid NOT NULL,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  new_wage       numeric NOT NULL,
  prior_wage     numeric,
  note           text,
  changed_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wage_history_person_idx ON public.wage_history(person_id, effective_date DESC);
-- Sensitive PII: RLS on, no permissive policy — only SECURITY DEFINER RPCs (owner) may read/write.
ALTER TABLE public.wage_history ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_employee_wage(
  p_person_id uuid, p_wage numeric, p_note text DEFAULT NULL, p_changed_by uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_node uuid; v_tenant uuid; v_prior numeric; v_id uuid;
BEGIN
  SELECT a.node_id, n.tenant_id INTO v_node, v_tenant
  FROM assignments a JOIN org_nodes n ON n.id = a.node_id
  WHERE a.person_id = p_person_id
  LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No assignment/tenant found for person %', p_person_id; END IF;
  SELECT new_wage INTO v_prior FROM wage_history
   WHERE person_id = p_person_id ORDER BY effective_date DESC, created_at DESC LIMIT 1;
  INSERT INTO wage_history(tenant_id, node_id, person_id, new_wage, prior_wage, note, changed_by)
  VALUES (v_tenant, v_node, p_person_id, p_wage, v_prior, p_note, p_changed_by)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.update_employee_wage(uuid,numeric,text,uuid) TO anon, authenticated;
