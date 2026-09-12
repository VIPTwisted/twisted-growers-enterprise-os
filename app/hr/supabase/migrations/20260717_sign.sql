-- e-Sign (Odoo Sign-style): send documents for signature, sign them, and keep an
-- auditable trail. Replaces the old localStorage-only Sign screen with a real,
-- node-scoped backend. HR is single-tenant; tenant is derived from org_nodes exactly
-- like create_helpdesk_ticket / create_disciplinary_action. Access is via SECURITY
-- DEFINER RPCs only (RLS on, no anon policies) — the app authenticates through
-- pin_login and calls RPCs under the anon role, so EXECUTE is granted to
-- anon + authenticated like every sibling HR RPC.
--
-- REUSED (not rebuilt): get_roster (recipient picker + signer names/locations),
--   people / assignments / org_nodes / roles (recipient -> node -> tenant resolution).
-- New: sign_requests table + get_sign_requests / create_sign_requests /
--   set_sign_request_status / apply_sign_signature.

CREATE TABLE IF NOT EXISTS public.sign_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  node_id         uuid,
  node_name       text,
  template_id     text NOT NULL,
  template_name   text NOT NULL,
  fields          jsonb NOT NULL DEFAULT '[]'::jsonb,
  signer_id       uuid,
  signer_name     text,
  status          text NOT NULL DEFAULT 'draft',   -- draft|sent|viewed|signed|completed|declined
  signature       text,
  signature_kind  text,                            -- typed|drawn
  signed_at       timestamptz,
  sent_at         timestamptz,
  audit           jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sign_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS sign_requests_node_idx   ON public.sign_requests (node_id);
CREATE INDEX IF NOT EXISTS sign_requests_signer_idx ON public.sign_requests (signer_id);
CREATE INDEX IF NOT EXISTS sign_requests_status_idx ON public.sign_requests (status);

-- ── Read: requests in the caller's node scope PLUS any addressed to the caller.
-- Named get_* so the client's honest-failure wrapper stays quiet at load time.
CREATE OR REPLACE FUNCTION public.get_sign_requests(
  p_node_ids uuid[] DEFAULT NULL,
  p_signer_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT id, tenant_id, node_id, node_name, template_id, template_name, fields,
           signer_id, signer_name, status, signature, signature_kind,
           signed_at, sent_at, audit, created_by, created_by_name, created_at, updated_at
    FROM public.sign_requests sr
    WHERE (
      (p_node_ids IS NOT NULL AND array_length(p_node_ids, 1) IS NOT NULL AND sr.node_id = ANY(p_node_ids))
      OR (p_signer_id IS NOT NULL AND sr.signer_id = p_signer_id)
    )
  ) t;
$$;
GRANT EXECUTE ON FUNCTION public.get_sign_requests(uuid[], uuid) TO anon, authenticated;

-- ── Write: send one document to a set of recipients (one request per recipient).
-- Each recipient's node/tenant is resolved from their assignment, preferring an
-- assignment inside the actor's current scope. Requests are created already 'sent'.
CREATE OR REPLACE FUNCTION public.create_sign_requests(
  p_template_id text,
  p_template_name text,
  p_recipient_ids uuid[],
  p_node_ids uuid[] DEFAULT NULL,
  p_fields jsonb DEFAULT '[]'::jsonb,
  p_actor_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_rid       uuid;
  v_node      uuid;
  v_nodename  text;
  v_tenant    uuid;
  v_signer    text;
  v_ts        timestamptz := now();
  v_actor     text := COALESCE(NULLIF(btrim(COALESCE(p_actor_name, '')), ''), 'HR');
  v_audit     jsonb;
  v_ids       uuid[] := ARRAY[]::uuid[];
  v_new       uuid;
BEGIN
  IF COALESCE(NULLIF(btrim(COALESCE(p_template_id, '')), ''), '') = '' THEN
    RAISE EXCEPTION 'Template is required';
  END IF;
  IF p_recipient_ids IS NULL OR array_length(p_recipient_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one recipient is required';
  END IF;

  FOREACH v_rid IN ARRAY p_recipient_ids LOOP
    v_node := NULL; v_nodename := NULL; v_tenant := NULL; v_signer := NULL;

    -- Prefer an assignment that falls inside the actor's current scope.
    SELECT a.node_id, n.name, n.tenant_id, p.full_name
      INTO v_node, v_nodename, v_tenant, v_signer
    FROM public.people p
    JOIN public.assignments a ON a.person_id = p.id
    JOIN public.org_nodes n   ON n.id = a.node_id
    WHERE p.id = v_rid
      AND (p_node_ids IS NULL OR a.node_id = ANY(p_node_ids))
    ORDER BY a.effective_from DESC NULLS LAST
    LIMIT 1;

    -- Fallback: any assignment for this person.
    IF v_node IS NULL THEN
      SELECT a.node_id, n.name, n.tenant_id, p.full_name
        INTO v_node, v_nodename, v_tenant, v_signer
      FROM public.people p
      JOIN public.assignments a ON a.person_id = p.id
      JOIN public.org_nodes n   ON n.id = a.node_id
      WHERE p.id = v_rid
      ORDER BY a.effective_from DESC NULLS LAST
      LIMIT 1;
    END IF;

    -- Last resort: person with no assignment (single-tenant fallback).
    IF v_signer IS NULL THEN
      SELECT full_name INTO v_signer FROM public.people WHERE id = v_rid LIMIT 1;
    END IF;
    IF v_tenant IS NULL THEN
      SELECT tenant_id INTO v_tenant FROM public.org_nodes ORDER BY tenant_id LIMIT 1;
    END IF;
    IF v_tenant IS NULL THEN RAISE EXCEPTION 'No tenant configured'; END IF;

    v_audit := jsonb_build_array(
      jsonb_build_object('event', 'created', 'by', v_actor, 'at', v_ts),
      jsonb_build_object('event', 'sent',    'by', v_actor, 'at', v_ts)
    );

    INSERT INTO public.sign_requests
      (tenant_id, node_id, node_name, template_id, template_name, fields,
       signer_id, signer_name, status, sent_at, audit, created_by, created_by_name)
    VALUES
      (v_tenant, v_node, COALESCE(v_nodename, '—'),
       btrim(p_template_id), COALESCE(NULLIF(btrim(COALESCE(p_template_name, '')), ''), p_template_id),
       COALESCE(p_fields, '[]'::jsonb),
       v_rid, COALESCE(v_signer, 'Employee'), 'sent', v_ts, v_audit,
       p_actor_id, v_actor)
    RETURNING id INTO v_new;

    v_ids := array_append(v_ids, v_new);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'count', array_length(v_ids, 1), 'ids', to_jsonb(v_ids));
END; $$;
GRANT EXECUTE ON FUNCTION public.create_sign_requests(text, text, uuid[], uuid[], jsonb, uuid, text) TO anon, authenticated;

-- ── Write: change a request's status (view / decline / manager move / complete).
-- Signing is handled by apply_sign_signature; this covers every non-signing move.
CREATE OR REPLACE FUNCTION public.set_sign_request_status(
  p_id uuid,
  p_status text,
  p_actor_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_status text;
  v_actor  text := COALESCE(NULLIF(btrim(COALESCE(p_actor_name, '')), ''), 'Manager');
  v_id     uuid;
  v_signer text;
BEGIN
  v_status := COALESCE(NULLIF(btrim(COALESCE(p_status, '')), ''), 'draft');
  IF v_status NOT IN ('draft', 'sent', 'viewed', 'signed', 'completed', 'declined') THEN
    RAISE EXCEPTION 'Invalid status %', p_status;
  END IF;

  SELECT signer_name INTO v_signer FROM public.sign_requests WHERE id = p_id;

  UPDATE public.sign_requests
     SET status  = v_status,
         sent_at = CASE WHEN v_status = 'sent' AND sent_at IS NULL THEN now() ELSE sent_at END,
         audit   = COALESCE(audit, '[]'::jsonb) || jsonb_build_object(
                     'event', CASE WHEN v_status = 'viewed' THEN 'viewed'
                                   WHEN v_status = 'declined' THEN 'declined'
                                   WHEN v_status = 'completed' THEN 'completed'
                                   ELSE 'moved → ' || v_status END,
                     'by', CASE WHEN v_status IN ('viewed', 'declined')
                                THEN COALESCE(NULLIF(btrim(COALESCE(p_actor_name, '')), ''), v_signer, 'Signer')
                                ELSE v_actor END,
                     'at', now()),
         updated_at = now()
   WHERE id = p_id
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN RAISE EXCEPTION 'Request % not found', p_id; END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'status', v_status);
END; $$;
GRANT EXECUTE ON FUNCTION public.set_sign_request_status(uuid, text, uuid, text) TO anon, authenticated;

-- ── Write: adopt a signature (typed name or drawn data-URL). Stamps signed_at and
-- appends a 'signed' audit event attributed to the signer.
CREATE OR REPLACE FUNCTION public.apply_sign_signature(
  p_id uuid,
  p_signature text,
  p_kind text DEFAULT 'typed',
  p_actor_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_id     uuid;
  v_ts     timestamptz := now();
  v_signer text;
  v_by     text;
BEGIN
  IF COALESCE(NULLIF(btrim(COALESCE(p_signature, '')), ''), '') = '' THEN
    RAISE EXCEPTION 'Signature is required';
  END IF;

  SELECT signer_name INTO v_signer FROM public.sign_requests WHERE id = p_id;
  v_by := COALESCE(NULLIF(btrim(COALESCE(p_actor_name, '')), ''), v_signer, 'Signer');

  UPDATE public.sign_requests
     SET status         = 'signed',
         signature      = p_signature,
         signature_kind = COALESCE(NULLIF(btrim(COALESCE(p_kind, '')), ''), 'typed'),
         signed_at      = v_ts,
         audit          = COALESCE(audit, '[]'::jsonb) || jsonb_build_object('event', 'signed', 'by', v_by, 'at', v_ts),
         updated_at     = v_ts
   WHERE id = p_id
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN RAISE EXCEPTION 'Request % not found', p_id; END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'status', 'signed', 'signed_at', v_ts);
END; $$;
GRANT EXECUTE ON FUNCTION public.apply_sign_signature(uuid, text, text, uuid, text) TO anon, authenticated;
