-- Feature Toggles — finish the real backend for src/screens/FeatureToggles.jsx.
--
-- LIVE-DB FORENSICS (verified 2026-07-17 against zsmdejhgdyyaakqsjhmk via anon REST):
--   * public.feature_flags ALREADY EXISTS and is the natural backing store.
--     Confirmed columns: id (uuid), feature (text = flag key), enabled (bool),
--     config (jsonb), tenant_id (uuid), node_id (uuid), created_at, updated_at.
--     RLS is ON: anon SELECT returns rows (permissive read) but a direct anon
--     INSERT fails with 42501 (no write policy). It is EMPTY (0 rows) today and
--     there are NO get/set RPCs for it (all 404). We add SECURITY DEFINER RPCs.
--   * public.app_audit_log + write_audit(...) + get_audit_log(...) are LIVE and
--     are the real, shared audit trail. This screen REUSES write_audit for every
--     flag/permission change and get_audit_log (action-filtered) for its Audit
--     tab — no new audit table is created.
--
-- config jsonb shape (one row per feature, tenant/node global = NULL/NULL):
--   { "rollout": { "locs": [..], "roles": [..], "pct": 100 },
--     "allowed_roles": [..] | null,        -- null/absent = all roles
--     "overrides": { "allow": [personId..], "block": [personId..] } }
--
-- Access model matches every sibling HR RPC: SECURITY DEFINER, RLS on the table,
-- EXECUTE granted to anon + authenticated (the app authenticates via pin_login
-- and calls RPCs under the anon role). Idempotent: safe to re-run.

-- ── Backing table: make the global-scope columns nullable + config default ───
-- (SECURITY DEFINER RPCs write tenant_id/node_id = NULL for enterprise-wide
--  flags; guarantee those inserts cannot fail on a stray NOT NULL.)
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS config    jsonb;
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS node_id   uuid;
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS enabled   boolean;
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.feature_flags ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE public.feature_flags ALTER COLUMN node_id   DROP NOT NULL;
ALTER TABLE public.feature_flags ALTER COLUMN config SET DEFAULT '{}'::jsonb;
ALTER TABLE public.feature_flags ALTER COLUMN enabled SET DEFAULT true;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- One canonical row per feature at global scope; underpins the upsert helpers.
CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_feature_global_uidx
  ON public.feature_flags (feature)
  WHERE tenant_id IS NULL AND node_id IS NULL;

-- ── Read: every global feature flag + its config ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_feature_flags()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'feature',    f.feature,
           'enabled',    f.enabled,
           'config',     COALESCE(f.config, '{}'::jsonb),
           'updated_at', f.updated_at
         ) ORDER BY f.feature), '[]'::jsonb)
  FROM public.feature_flags f
  WHERE f.tenant_id IS NULL AND f.node_id IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.get_feature_flags() TO anon, authenticated;

-- ── Write: enable/disable a single flag (upsert) + audit on real change ───────
CREATE OR REPLACE FUNCTION public.set_feature_flag(
  p_feature    text,
  p_enabled    boolean,
  p_actor      uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_actor_role text DEFAULT NULL,
  p_label      text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_prev boolean; v_found boolean := false;
BEGIN
  IF NULLIF(btrim(COALESCE(p_feature, '')), '') IS NULL THEN
    RAISE EXCEPTION 'feature key is required';
  END IF;

  SELECT enabled INTO v_prev
  FROM public.feature_flags
  WHERE feature = p_feature AND tenant_id IS NULL AND node_id IS NULL
  FOR UPDATE;
  v_found := FOUND;

  IF v_found THEN
    UPDATE public.feature_flags
       SET enabled = COALESCE(p_enabled, true), updated_at = now()
     WHERE feature = p_feature AND tenant_id IS NULL AND node_id IS NULL;
  ELSE
    INSERT INTO public.feature_flags (feature, enabled, config, tenant_id, node_id, updated_at)
    VALUES (p_feature, COALESCE(p_enabled, true), '{}'::jsonb, NULL, NULL, now());
  END IF;

  -- Audit only a real state change (reuses the shared audit trail).
  IF (v_prev IS DISTINCT FROM COALESCE(p_enabled, true)) THEN
    PERFORM public.write_audit(
      p_actor, p_actor_name, p_actor_role,
      'Feature Flag Changed',
      COALESCE(NULLIF(btrim(COALESCE(p_label, '')), ''), p_feature),
      NULL,
      CASE WHEN COALESCE(p_enabled, true) THEN 'Enabled' ELSE 'Disabled' END,
      jsonb_build_object('feature', p_feature, 'from', v_prev, 'to', COALESCE(p_enabled, true))
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'feature', p_feature, 'enabled', COALESCE(p_enabled, true));
END; $$;
GRANT EXECUTE ON FUNCTION public.set_feature_flag(text, boolean, uuid, text, text, text) TO anon, authenticated;

-- ── Write: merge config (rollout / allowed_roles / per-person overrides) ──────
-- p_action/p_target optional: when supplied, records a permission-change audit.
CREATE OR REPLACE FUNCTION public.set_feature_config(
  p_feature    text,
  p_config     jsonb,
  p_actor      uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_actor_role text DEFAULT NULL,
  p_action     text DEFAULT NULL,
  p_target     text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_config jsonb; v_found boolean := false;
BEGIN
  IF NULLIF(btrim(COALESCE(p_feature, '')), '') IS NULL THEN
    RAISE EXCEPTION 'feature key is required';
  END IF;

  SELECT COALESCE(config, '{}'::jsonb) INTO v_config
  FROM public.feature_flags
  WHERE feature = p_feature AND tenant_id IS NULL AND node_id IS NULL
  FOR UPDATE;
  v_found := FOUND;

  v_config := COALESCE(v_config, '{}'::jsonb) || COALESCE(p_config, '{}'::jsonb);

  IF v_found THEN
    UPDATE public.feature_flags
       SET config = v_config, updated_at = now()
     WHERE feature = p_feature AND tenant_id IS NULL AND node_id IS NULL;
  ELSE
    INSERT INTO public.feature_flags (feature, enabled, config, tenant_id, node_id, updated_at)
    VALUES (p_feature, true, v_config, NULL, NULL, now());
  END IF;

  IF NULLIF(btrim(COALESCE(p_action, '')), '') IS NOT NULL THEN
    PERFORM public.write_audit(
      p_actor, p_actor_name, p_actor_role,
      btrim(p_action),
      COALESCE(NULLIF(btrim(COALESCE(p_target, '')), ''), p_feature),
      NULL, 'Success',
      jsonb_build_object('feature', p_feature)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'feature', p_feature, 'config', v_config);
END; $$;
GRANT EXECUTE ON FUNCTION public.set_feature_config(text, jsonb, uuid, text, text, text, text) TO anon, authenticated;
