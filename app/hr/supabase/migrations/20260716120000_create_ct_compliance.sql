-- CT Labor Compliance — real persistence layer.
-- The checklist CATALOG (categories + item labels) is static CT statutory reference
-- and lives in the front end (like enum labels). Only mutable DATA is stored here:
--   (a) per-location checklist STATE (checked / note / who + when reviewed)
--   (b) upcoming compliance DEADLINES (full CRUD, starts empty — honest empty state)
-- Sensitive/audit data: RLS on, NO permissive policy. Access only via the
-- SECURITY DEFINER RPCs below (granted to anon, authenticated), matching the
-- rest of the HR brain (see wage_history / onboarding_hires migrations).

-- ── 1. Checklist state (one row per tenant + node + item) ────────────────────
CREATE TABLE IF NOT EXISTS public.compliance_checklist (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  node_id          uuid NOT NULL,
  item_key         text NOT NULL,
  checked          boolean NOT NULL DEFAULT false,
  note             text,
  reviewed_by      uuid,
  last_reviewed_at timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, node_id, item_key)
);
CREATE INDEX IF NOT EXISTS compliance_checklist_node_idx
  ON public.compliance_checklist(node_id);
ALTER TABLE public.compliance_checklist ENABLE ROW LEVEL SECURITY;

-- ── 2. Upcoming deadlines (full CRUD) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.compliance_deadlines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  node_id      uuid,
  requirement  text NOT NULL,
  due_date     date,
  status       text NOT NULL DEFAULT 'Pending',
  responsible  text,
  notes        text,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compliance_deadlines_node_idx
  ON public.compliance_deadlines(node_id);
ALTER TABLE public.compliance_deadlines ENABLE ROW LEVEL SECURITY;

-- ── RPCs: checklist ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compliance_checklist_get(p_node_ids uuid[])
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'item_key',         item_key,
    'checked',          checked,
    'note',             note,
    'last_reviewed_at', last_reviewed_at,
    'node_id',          node_id
  )), '[]'::jsonb)
  FROM public.compliance_checklist
  WHERE node_id = ANY(p_node_ids);
$$;
GRANT EXECUTE ON FUNCTION public.compliance_checklist_get(uuid[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.compliance_checklist_set(
  p_node_id     uuid,
  p_item_key    text,
  p_checked     boolean,
  p_note        text  DEFAULT NULL,
  p_reviewed_by uuid  DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.org_nodes WHERE id = p_node_id;
  IF v_tenant IS NULL THEN
    SELECT tenant_id INTO v_tenant FROM public.org_nodes ORDER BY tenant_id LIMIT 1;
  END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No tenant found for node %', p_node_id; END IF;

  INSERT INTO public.compliance_checklist
    (tenant_id, node_id, item_key, checked, note, reviewed_by, last_reviewed_at, updated_at)
  VALUES
    (v_tenant, p_node_id, p_item_key, COALESCE(p_checked,false), p_note, p_reviewed_by, now(), now())
  ON CONFLICT (tenant_id, node_id, item_key) DO UPDATE
    SET checked          = EXCLUDED.checked,
        note             = EXCLUDED.note,
        reviewed_by      = EXCLUDED.reviewed_by,
        last_reviewed_at = now(),
        updated_at       = now();

  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.compliance_checklist_set(uuid,text,boolean,text,uuid) TO anon, authenticated;

-- ── RPCs: deadlines ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compliance_deadlines_list(p_node_ids uuid[])
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',          id,
    'requirement', requirement,
    'due_date',    due_date,
    'status',      status,
    'responsible', responsible,
    'notes',       notes
  ) ORDER BY due_date NULLS LAST), '[]'::jsonb)
  FROM public.compliance_deadlines
  WHERE node_id = ANY(p_node_ids) OR node_id IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.compliance_deadlines_list(uuid[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.compliance_deadline_save(
  p_id          uuid,
  p_node_id     uuid,
  p_requirement text,
  p_due_date    date,
  p_status      text,
  p_responsible text,
  p_notes       text,
  p_created_by  uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant uuid; v_id uuid;
BEGIN
  IF COALESCE(btrim(p_requirement),'') = '' THEN
    RAISE EXCEPTION 'Requirement is required';
  END IF;
  SELECT tenant_id INTO v_tenant FROM public.org_nodes WHERE id = p_node_id;
  IF v_tenant IS NULL THEN
    SELECT tenant_id INTO v_tenant FROM public.org_nodes ORDER BY tenant_id LIMIT 1;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.compliance_deadlines
      (tenant_id, node_id, requirement, due_date, status, responsible, notes, created_by)
    VALUES
      (v_tenant, p_node_id, p_requirement, p_due_date, COALESCE(NULLIF(p_status,''),'Pending'),
       p_responsible, p_notes, p_created_by)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.compliance_deadlines
      SET requirement = p_requirement,
          due_date    = p_due_date,
          status      = COALESCE(NULLIF(p_status,''),'Pending'),
          responsible = p_responsible,
          notes       = p_notes,
          node_id     = COALESCE(p_node_id, node_id),
          updated_at  = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.compliance_deadline_save(uuid,uuid,text,date,text,text,text,uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.compliance_deadline_delete(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  DELETE FROM public.compliance_deadlines WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.compliance_deadline_delete(uuid) TO anon, authenticated;
