-- Help Desk (Odoo/Monday-style employee support tickets: HR / IT / Facilities / Payroll).
-- Replaces the old localStorage-only HelpDesk screen with a real, node-scoped backend.
-- HR is single-tenant; tenant is derived from org_nodes exactly like create_employee /
-- create_disciplinary_action. Access is via SECURITY DEFINER RPCs only (RLS on, no anon
-- policies) — the app authenticates through pin_login and calls RPCs under the anon role,
-- so EXECUTE is granted to anon + authenticated like every sibling HR RPC.

CREATE TABLE IF NOT EXISTS public.helpdesk_tickets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  node_id          uuid,
  subject          text NOT NULL,
  category         text NOT NULL DEFAULT 'Other',
  priority         text NOT NULL DEFAULT 'normal',
  status           text NOT NULL DEFAULT 'new',
  description      text,
  requester_id     uuid,
  requester_name   text,
  assignee_id      uuid,
  assignee_name    text,
  resolved_at      timestamptz,
  resolved_by_id   uuid,
  resolved_by_name text,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.helpdesk_tickets ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS helpdesk_tickets_node_idx      ON public.helpdesk_tickets (node_id);
CREATE INDEX IF NOT EXISTS helpdesk_tickets_requester_idx ON public.helpdesk_tickets (requester_id);
CREATE INDEX IF NOT EXISTS helpdesk_tickets_status_idx    ON public.helpdesk_tickets (status);

-- ── Read: tickets in the caller's node scope PLUS any the caller opened themselves.
-- Named get_* so the client's honest-failure wrapper stays quiet at load time.
CREATE OR REPLACE FUNCTION public.get_helpdesk_tickets(
  p_node_ids uuid[] DEFAULT NULL,
  p_requester_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT id, tenant_id, node_id, subject, category, priority, status, description,
           requester_id, requester_name, assignee_id, assignee_name,
           resolved_at, resolved_by_id, resolved_by_name, created_by, created_at, updated_at
    FROM public.helpdesk_tickets ht
    WHERE (
      (p_node_ids IS NOT NULL AND array_length(p_node_ids, 1) IS NOT NULL AND ht.node_id = ANY(p_node_ids))
      OR (p_requester_id IS NOT NULL AND ht.requester_id = p_requester_id)
    )
  ) t;
$$;
GRANT EXECUTE ON FUNCTION public.get_helpdesk_tickets(uuid[], uuid) TO anon, authenticated;

-- ── Write: create a ticket. Tenant derived from node when known, else single-tenant fallback.
CREATE OR REPLACE FUNCTION public.create_helpdesk_ticket(
  p_subject text,
  p_category text DEFAULT 'Other',
  p_priority text DEFAULT 'normal',
  p_description text DEFAULT NULL,
  p_requester_id uuid DEFAULT NULL,
  p_requester_name text DEFAULT NULL,
  p_node_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant uuid; v_id uuid;
BEGIN
  IF COALESCE(NULLIF(btrim(p_subject), ''), '') = '' THEN
    RAISE EXCEPTION 'Subject is required';
  END IF;
  IF p_node_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant FROM org_nodes WHERE id = p_node_id LIMIT 1;
  END IF;
  IF v_tenant IS NULL THEN
    SELECT tenant_id INTO v_tenant FROM org_nodes ORDER BY tenant_id LIMIT 1;  -- HR is single-tenant
  END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No tenant configured'; END IF;

  INSERT INTO public.helpdesk_tickets
    (tenant_id, node_id, subject, category, priority, status, description,
     requester_id, requester_name, created_by)
  VALUES
    (v_tenant, p_node_id, btrim(p_subject),
     COALESCE(NULLIF(p_category, ''), 'Other'),
     COALESCE(NULLIF(p_priority, ''), 'normal'),
     'new',
     NULLIF(btrim(COALESCE(p_description, '')), ''),
     p_requester_id, p_requester_name, p_requester_id)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.create_helpdesk_ticket(text, text, text, text, uuid, text, uuid) TO anon, authenticated;

-- ── Write: move a ticket's status (triage board + drawer actions). Optionally (re)assign.
-- status='resolved' stamps resolved_at/by; moving back to 'new' (reopen) clears the stamp.
CREATE OR REPLACE FUNCTION public.set_helpdesk_ticket_status(
  p_ticket_id uuid,
  p_status text,
  p_actor_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_assignee_id uuid DEFAULT NULL,
  p_assignee_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_status text;
BEGIN
  v_status := COALESCE(NULLIF(p_status, ''), 'new');
  IF v_status NOT IN ('new', 'in_progress', 'waiting', 'resolved') THEN
    RAISE EXCEPTION 'Invalid status %', p_status;
  END IF;

  UPDATE public.helpdesk_tickets
     SET status = v_status,
         assignee_id   = COALESCE(p_assignee_id, assignee_id),
         assignee_name = COALESCE(NULLIF(p_assignee_name, ''), assignee_name),
         resolved_at      = CASE WHEN v_status = 'resolved' THEN now()
                                 WHEN v_status = 'new' THEN NULL
                                 ELSE resolved_at END,
         resolved_by_id   = CASE WHEN v_status = 'resolved' THEN p_actor_id
                                 WHEN v_status = 'new' THEN NULL
                                 ELSE resolved_by_id END,
         resolved_by_name = CASE WHEN v_status = 'resolved' THEN p_actor_name
                                 WHEN v_status = 'new' THEN NULL
                                 ELSE resolved_by_name END,
         updated_at = now()
   WHERE id = p_ticket_id
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN RAISE EXCEPTION 'Ticket % not found', p_ticket_id; END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'status', v_status);
END; $$;
GRANT EXECUTE ON FUNCTION public.set_helpdesk_ticket_status(uuid, text, uuid, text, uuid, text) TO anon, authenticated;
