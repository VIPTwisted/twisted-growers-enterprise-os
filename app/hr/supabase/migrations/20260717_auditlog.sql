-- Audit Log — finish the real backend for src/screens/AuditLog.jsx + src/lib/audit.js.
--
-- LIVE-DB FORENSICS (verified 2026-07-17 against zsmdejhgdyyaakqsjhmk via anon REST):
--   * public.app_audit_log EXISTS and is the REAL backing store of the live
--     get_audit_log RPC (54 real events; columns exactly: id uuid, actor_id,
--     actor_name, actor_role, action, target, node_name, result, meta,
--     created_at). It is RLS-protected (anon direct SELECT sees 0 rows) and
--     has NO node_id / tenant_id columns yet.
--   * public.audit_log (bigint id, actor_person, entity_type, entity_id,
--     detail) is a DIFFERENT legacy table written by pin_login etc. — DO NOT
--     TOUCH IT and do not create a same-named conflicting table.
--   * Live get_audit_log has the OLD 4-arg signature
--     (p_from, p_to, p_action, p_limit) — the screen passes p_node_ids too,
--     so its call currently fails with PGRST202. Creating the 5-arg version
--     with CREATE OR REPLACE alone would leave BOTH overloads and make the
--     4-arg call (src/lib/audit.js fetchAuditLog) ambiguous; therefore we
--     drop every existing overload first.
--   * write_audit, dismiss_audit_event, get_audit_dismissals,
--     audit_dismissals: missing live (404) — built here.
--
-- Access model matches every sibling HR RPC: SECURITY DEFINER, RLS on the
-- tables, no anon table policies, EXECUTE granted to anon + authenticated
-- (the app authenticates via pin_login and calls RPCs under the anon role).
-- Idempotent: safe to re-run.

-- ── Backing table: add node scoping + ensure RLS + indexes ───────────────────
ALTER TABLE public.app_audit_log ADD COLUMN IF NOT EXISTS node_id uuid;
ALTER TABLE public.app_audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS app_audit_log_created_idx ON public.app_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS app_audit_log_action_idx  ON public.app_audit_log (action);
CREATE INDEX IF NOT EXISTS app_audit_log_actor_idx   ON public.app_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS app_audit_log_node_idx    ON public.app_audit_log (node_id);

-- ── Table: forensic dismissals (Security Events "Dismiss" persists here) ─────
CREATE TABLE IF NOT EXISTS public.audit_dismissals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL,
  actor_id    uuid,
  actor_name  text,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id)
);
ALTER TABLE public.audit_dismissals ENABLE ROW LEVEL SECURITY;

-- ── Drop ALL existing get_audit_log overloads (prevents 300-ambiguous calls) ─
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_audit_log'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
  END LOOP;
END $do$;

-- ── Read: node-scoped, filterable event feed ─────────────────────────────────
-- Canonical signature the screen calls; audit.js fetchAuditLog omits
-- p_node_ids and resolves via its DEFAULT. p_node_ids NULL/empty = every node
-- (exec view). Events with a NULL node_id (system-wide, e.g. Login) are always
-- visible so scoping never hides platform-level activity. Existing 54 live
-- events all have node_id NULL, so nothing already recorded disappears.
CREATE FUNCTION public.get_audit_log(
  p_from     text    DEFAULT NULL,
  p_to       text    DEFAULT NULL,
  p_action   text    DEFAULT NULL,
  p_limit    integer DEFAULT 500,
  p_node_ids uuid[]  DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT a.id, a.actor_id, a.actor_name, a.actor_role, a.action, a.target,
           a.node_id, a.node_name, a.result, a.meta, a.created_at
    FROM public.app_audit_log a
    WHERE (p_from   IS NULL OR a.created_at >= p_from::timestamptz)
      AND (p_to     IS NULL OR a.created_at <  (p_to::date + 1))
      AND (p_action IS NULL OR a.action = p_action)
      AND (
        p_node_ids IS NULL
        OR array_length(p_node_ids, 1) IS NULL
        OR a.node_id = ANY(p_node_ids)
        OR a.node_id IS NULL
      )
    ORDER BY a.created_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 500), 1)
  ) t;
$$;
GRANT EXECUTE ON FUNCTION public.get_audit_log(text, text, text, integer, uuid[]) TO anon, authenticated;

-- ── Write: append an audit event (exact signature of src/lib/audit.js) ───────
CREATE OR REPLACE FUNCTION public.write_audit(
  p_actor_id   uuid    DEFAULT NULL,
  p_actor_name text    DEFAULT NULL,
  p_actor_role text    DEFAULT NULL,
  p_action     text    DEFAULT NULL,
  p_target     text    DEFAULT NULL,
  p_node_name  text    DEFAULT NULL,
  p_result     text    DEFAULT 'Success',
  p_meta       jsonb   DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_node uuid; v_id uuid;
BEGIN
  IF NULLIF(btrim(COALESCE(p_action, '')), '') IS NULL THEN
    RAISE EXCEPTION 'action is required';
  END IF;

  -- Resolve node_id when the supplied node name matches an org node.
  IF NULLIF(btrim(COALESCE(p_node_name, '')), '') IS NOT NULL THEN
    SELECT id INTO v_node FROM org_nodes WHERE name = btrim(p_node_name) LIMIT 1;
  END IF;

  INSERT INTO public.app_audit_log
    (actor_id, actor_name, actor_role, action, target, node_id, node_name, result, meta)
  VALUES
    (p_actor_id,
     NULLIF(btrim(COALESCE(p_actor_name, '')), ''),
     NULLIF(btrim(COALESCE(p_actor_role, '')), ''),
     btrim(p_action),
     NULLIF(btrim(COALESCE(p_target, '')), ''),
     v_node,
     NULLIF(btrim(COALESCE(p_node_name, '')), ''),
     COALESCE(NULLIF(btrim(COALESCE(p_result, '')), ''), 'Success'),
     COALESCE(p_meta, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.write_audit(uuid, text, text, text, text, text, text, jsonb) TO anon, authenticated;

-- ── Write: dismiss (acknowledge) a security event; persists across sessions ──
CREATE OR REPLACE FUNCTION public.dismiss_audit_event(
  p_event_id   uuid,
  p_actor_id   uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_reason     text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_event_id IS NULL THEN RAISE EXCEPTION 'event id is required'; END IF;

  INSERT INTO public.audit_dismissals (event_id, actor_id, actor_name, reason)
  VALUES (p_event_id, p_actor_id,
          NULLIF(btrim(COALESCE(p_actor_name, '')), ''),
          NULLIF(btrim(COALESCE(p_reason, '')), ''))
  ON CONFLICT (event_id) DO UPDATE
    SET actor_id   = EXCLUDED.actor_id,
        actor_name = EXCLUDED.actor_name,
        reason     = EXCLUDED.reason,
        created_at = now();

  RETURN jsonb_build_object('ok', true, 'event_id', p_event_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.dismiss_audit_event(uuid, uuid, text, text) TO anon, authenticated;

-- ── Read: dismissed event ids ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_audit_dismissals(
  p_actor_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('event_id', event_id, 'reason', reason)), '[]'::jsonb)
  FROM public.audit_dismissals;
$$;
GRANT EXECUTE ON FUNCTION public.get_audit_dismissals(uuid) TO anon, authenticated;
