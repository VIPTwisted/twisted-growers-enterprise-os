-- Store Visit / Compliance Log — real backend for the StoreVisits screen.
-- Replaces the old localStorage/Math.random mock screen with node-scoped, persisted data.
-- HR is single-tenant; tenant is derived from org_nodes exactly like create_helpdesk_ticket /
-- create_disciplinary_action. Access is via SECURITY DEFINER RPCs only (RLS on, no anon
-- policies) — the app authenticates through pin_login and calls RPCs under the anon role,
-- so EXECUTE is granted to anon + authenticated like every sibling HR RPC.

-- ── Visits ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_visits (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  node_id          uuid,
  location_name    text,
  visit_type       text NOT NULL DEFAULT 'Routine',
  visit_date       date NOT NULL DEFAULT current_date,
  manager_present  text,
  visited_by       text,
  visited_by_id    uuid,
  score            integer NOT NULL DEFAULT 0,
  summary          text,
  findings         text,
  score_breakdown  jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist        jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags             text[] NOT NULL DEFAULT '{}',
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.store_visits ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS store_visits_node_idx ON public.store_visits (node_id);
CREATE INDEX IF NOT EXISTS store_visits_date_idx ON public.store_visits (visit_date);

-- ── Action items (may belong to a visit, or stand alone) ──────────────────────
CREATE TABLE IF NOT EXISTS public.store_visit_action_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  node_id          uuid,
  visit_id         uuid REFERENCES public.store_visits(id) ON DELETE CASCADE,
  location_name    text,
  item             text NOT NULL,
  assigned_to      text,
  assigned_to_id   uuid,
  visit_date       date,
  due_date         date,
  priority         text NOT NULL DEFAULT 'MEDIUM',
  status           text NOT NULL DEFAULT 'OPEN',
  completed_at     timestamptz,
  completed_by_id  uuid,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.store_visit_action_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS svai_node_idx   ON public.store_visit_action_items (node_id);
CREATE INDEX IF NOT EXISTS svai_visit_idx  ON public.store_visit_action_items (visit_id);
CREATE INDEX IF NOT EXISTS svai_status_idx ON public.store_visit_action_items (status);

-- ── Helper: resolve tenant from node, else single-tenant fallback ─────────────
CREATE OR REPLACE FUNCTION public._store_visit_tenant(p_node_id uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    (SELECT tenant_id FROM org_nodes WHERE id = p_node_id LIMIT 1),
    (SELECT tenant_id FROM org_nodes ORDER BY tenant_id LIMIT 1)
  );
$$;

-- ── Read: visits in node scope (with live action-item count) ──────────────────
CREATE OR REPLACE FUNCTION public.get_store_visits(p_node_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.visit_date DESC, t.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT v.id, v.node_id, v.location_name, v.visit_type, v.visit_date,
           v.manager_present, v.visited_by, v.score, v.summary, v.findings,
           v.score_breakdown, v.checklist, v.tags, v.created_at,
           (SELECT count(*) FROM store_visit_action_items ai WHERE ai.visit_id = v.id) AS action_item_count
    FROM store_visits v
    WHERE (p_node_ids IS NULL OR array_length(p_node_ids, 1) IS NULL OR v.node_id = ANY(p_node_ids))
  ) t;
$$;
GRANT EXECUTE ON FUNCTION public.get_store_visits(uuid[]) TO anon, authenticated;

-- ── Read: action items in node scope ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_store_visit_action_items(p_node_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT ai.id, ai.node_id, ai.visit_id, ai.location_name, ai.item, ai.assigned_to,
           ai.visit_date, ai.due_date, ai.priority, ai.status, ai.created_at
    FROM store_visit_action_items ai
    WHERE (p_node_ids IS NULL OR array_length(p_node_ids, 1) IS NULL OR ai.node_id = ANY(p_node_ids))
  ) t;
$$;
GRANT EXECUTE ON FUNCTION public.get_store_visit_action_items(uuid[]) TO anon, authenticated;

-- ── Write: log a visit (+ optional inline action items) ───────────────────────
CREATE OR REPLACE FUNCTION public.create_store_visit(
  p_node_id uuid DEFAULT NULL,
  p_location_name text DEFAULT NULL,
  p_visit_type text DEFAULT 'Routine',
  p_visit_date date DEFAULT current_date,
  p_manager_present text DEFAULT NULL,
  p_visited_by text DEFAULT NULL,
  p_score integer DEFAULT 0,
  p_summary text DEFAULT NULL,
  p_findings text DEFAULT NULL,
  p_score_breakdown jsonb DEFAULT '{}'::jsonb,
  p_checklist jsonb DEFAULT '{}'::jsonb,
  p_tags text[] DEFAULT '{}',
  p_action_items jsonb DEFAULT '[]'::jsonb,
  p_created_by uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant uuid; v_id uuid; v_item jsonb;
BEGIN
  v_tenant := _store_visit_tenant(p_node_id);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No tenant configured'; END IF;

  INSERT INTO public.store_visits
    (tenant_id, node_id, location_name, visit_type, visit_date, manager_present,
     visited_by, score, summary, findings, score_breakdown, checklist, tags, created_by)
  VALUES
    (v_tenant, p_node_id, NULLIF(btrim(COALESCE(p_location_name, '')), ''),
     COALESCE(NULLIF(p_visit_type, ''), 'Routine'), COALESCE(p_visit_date, current_date),
     NULLIF(btrim(COALESCE(p_manager_present, '')), ''),
     NULLIF(btrim(COALESCE(p_visited_by, '')), ''),
     GREATEST(0, LEAST(100, COALESCE(p_score, 0))),
     NULLIF(btrim(COALESCE(p_summary, '')), ''),
     NULLIF(btrim(COALESCE(p_findings, '')), ''),
     COALESCE(p_score_breakdown, '{}'::jsonb),
     COALESCE(p_checklist, '{}'::jsonb),
     COALESCE(p_tags, '{}'),
     p_created_by)
  RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_action_items, '[]'::jsonb))
  LOOP
    CONTINUE WHEN COALESCE(btrim(v_item->>'desc'), '') = '';
    INSERT INTO public.store_visit_action_items
      (tenant_id, node_id, visit_id, location_name, item, assigned_to,
       visit_date, due_date, priority, status, created_by)
    VALUES
      (v_tenant, p_node_id, v_id, NULLIF(btrim(COALESCE(p_location_name, '')), ''),
       btrim(v_item->>'desc'), NULLIF(btrim(COALESCE(v_item->>'assignedTo', '')), ''),
       COALESCE(p_visit_date, current_date),
       NULLIF(v_item->>'dueDate', '')::date,
       COALESCE(NULLIF(v_item->>'priority', ''), 'MEDIUM'),
       'OPEN', p_created_by);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.create_store_visit(uuid, text, text, date, text, text, integer, text, text, jsonb, jsonb, text[], jsonb, uuid) TO anon, authenticated;

-- ── Write: update a visit's editable fields (findings / checklist / score) ────
CREATE OR REPLACE FUNCTION public.update_store_visit(
  p_visit_id uuid,
  p_findings text DEFAULT NULL,
  p_checklist jsonb DEFAULT NULL,
  p_score integer DEFAULT NULL,
  p_score_breakdown jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE public.store_visits
     SET findings        = COALESCE(p_findings, findings),
         checklist       = COALESCE(p_checklist, checklist),
         score           = COALESCE(GREATEST(0, LEAST(100, p_score)), score),
         score_breakdown = COALESCE(p_score_breakdown, score_breakdown),
         updated_at      = now()
   WHERE id = p_visit_id
   RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Visit % not found', p_visit_id; END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.update_store_visit(uuid, text, jsonb, integer, jsonb) TO anon, authenticated;

-- ── Write: add a standalone action item ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_store_visit_action_item(
  p_node_id uuid DEFAULT NULL,
  p_location_name text DEFAULT NULL,
  p_item text DEFAULT NULL,
  p_assigned_to text DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_priority text DEFAULT 'MEDIUM',
  p_visit_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant uuid; v_id uuid;
BEGIN
  IF COALESCE(NULLIF(btrim(p_item), ''), '') = '' THEN
    RAISE EXCEPTION 'Item description is required';
  END IF;
  v_tenant := _store_visit_tenant(p_node_id);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No tenant configured'; END IF;

  INSERT INTO public.store_visit_action_items
    (tenant_id, node_id, visit_id, location_name, item, assigned_to,
     visit_date, due_date, priority, status, created_by)
  VALUES
    (v_tenant, p_node_id, p_visit_id, NULLIF(btrim(COALESCE(p_location_name, '')), ''),
     btrim(p_item), NULLIF(btrim(COALESCE(p_assigned_to, '')), ''),
     current_date, p_due_date,
     COALESCE(NULLIF(p_priority, ''), 'MEDIUM'), 'OPEN', p_created_by)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.create_store_visit_action_item(uuid, text, text, text, date, text, uuid, uuid) TO anon, authenticated;

-- ── Write: move an action item's status ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_store_visit_action_item_status(
  p_item_id uuid,
  p_status text,
  p_actor_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_status text;
BEGIN
  v_status := upper(COALESCE(NULLIF(btrim(p_status), ''), 'OPEN'));
  IF v_status NOT IN ('OPEN', 'IN PROGRESS', 'COMPLETE') THEN
    RAISE EXCEPTION 'Invalid status %', p_status;
  END IF;
  UPDATE public.store_visit_action_items
     SET status          = v_status,
         completed_at     = CASE WHEN v_status = 'COMPLETE' THEN now() ELSE NULL END,
         completed_by_id  = CASE WHEN v_status = 'COMPLETE' THEN p_actor_id ELSE NULL END,
         updated_at       = now()
   WHERE id = p_item_id
   RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Action item % not found', p_item_id; END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'status', v_status);
END; $$;
GRANT EXECUTE ON FUNCTION public.set_store_visit_action_item_status(uuid, text, uuid) TO anon, authenticated;
