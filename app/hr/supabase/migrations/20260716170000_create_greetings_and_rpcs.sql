-- AI Greeting Approvals (COO console).
-- Replaces the old localStorage-only greetings queue with a real, persisted backend.
-- The engine proposes energetic greetings for COO approval; approved lines join the
-- login / clock-in rotation. HR is single-tenant; tenant is derived from org_nodes
-- exactly like create_helpdesk_ticket / create_employee. Access is via SECURITY DEFINER
-- RPCs only (RLS on, no anon policies) — the app authenticates through pin_login and
-- calls RPCs under the anon role, so EXECUTE is granted to anon + authenticated like
-- every sibling HR RPC. Greetings are company-wide, so they are tenant-scoped (not
-- node-scoped): one approved rotation for the whole organization.

-- ── Table: one row per greeting line (proposed / approved / rejected) ────────────────
CREATE TABLE IF NOT EXISTS public.hr_greetings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  text             text NOT NULL,
  status           text NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  source           text NOT NULL DEFAULT 'ai',         -- ai | manual
  proposed_at      timestamptz NOT NULL DEFAULT now(),
  decided_at       timestamptz,
  decided_by_id    uuid,
  decided_by_name  text,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_greetings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS hr_greetings_tenant_idx ON public.hr_greetings (tenant_id);
CREATE INDEX IF NOT EXISTS hr_greetings_status_idx ON public.hr_greetings (status);
-- Avoid proposing / approving the exact same line twice within a tenant.
CREATE UNIQUE INDEX IF NOT EXISTS hr_greetings_tenant_text_uk ON public.hr_greetings (tenant_id, text);

-- ── Table: 30-day AI batch cadence log (enforces "one batch per 30 days") ────────────
CREATE TABLE IF NOT EXISTS public.hr_greeting_batches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  generated_at   timestamptz NOT NULL DEFAULT now(),
  proposed_count integer NOT NULL DEFAULT 0,
  generated_by   uuid
);
ALTER TABLE public.hr_greeting_batches ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS hr_greeting_batches_tenant_idx ON public.hr_greeting_batches (tenant_id, generated_at DESC);

-- ── Read: greetings, optionally filtered by status. get_* keeps the client wrapper quiet.
CREATE OR REPLACE FUNCTION public.get_greetings(
  p_status text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(g ORDER BY g.proposed_at DESC), '[]'::jsonb)
  FROM (
    SELECT id, tenant_id, text, status, source, proposed_at,
           decided_at, decided_by_id, decided_by_name, created_at, updated_at
    FROM public.hr_greetings hg
    WHERE (p_status IS NULL OR hg.status = p_status)
  ) g;
$$;
GRANT EXECUTE ON FUNCTION public.get_greetings(text) TO anon, authenticated;

-- ── Read: KPI counts for the console header. _summary keeps the client wrapper quiet.
CREATE OR REPLACE FUNCTION public.get_greetings_summary()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'pending',  COUNT(*) FILTER (WHERE status = 'pending'),
    'approved', COUNT(*) FILTER (WHERE status = 'approved'),
    'rejected', COUNT(*) FILTER (WHERE status = 'rejected'),
    'last_batch_at', (SELECT max(generated_at) FROM public.hr_greeting_batches)
  )
  FROM public.hr_greetings;
$$;
GRANT EXECUTE ON FUNCTION public.get_greetings_summary() TO anon, authenticated;

-- ── Write: approve a proposal (COO action) — joins the rotation.
CREATE OR REPLACE FUNCTION public.approve_greeting(
  p_id uuid,
  p_actor_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE public.hr_greetings
     SET status = 'approved',
         decided_at = now(),
         decided_by_id = p_actor_id,
         decided_by_name = NULLIF(btrim(COALESCE(p_actor_name, '')), ''),
         updated_at = now()
   WHERE id = p_id
   RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Greeting % not found', p_id; END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'status', 'approved');
END; $$;
GRANT EXECUTE ON FUNCTION public.approve_greeting(uuid, uuid, text) TO anon, authenticated;

-- ── Write: reject a proposal (COO action).
CREATE OR REPLACE FUNCTION public.reject_greeting(
  p_id uuid,
  p_actor_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE public.hr_greetings
     SET status = 'rejected',
         decided_at = now(),
         decided_by_id = p_actor_id,
         decided_by_name = NULLIF(btrim(COALESCE(p_actor_name, '')), ''),
         updated_at = now()
   WHERE id = p_id
   RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Greeting % not found', p_id; END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'status', 'rejected');
END; $$;
GRANT EXECUTE ON FUNCTION public.reject_greeting(uuid, uuid, text) TO anon, authenticated;

-- ── Write: propose a fresh batch for COO review, capped to one batch per 30 days.
-- Content is composed server-side from curated energetic fragments (the product's
-- greeting engine) and persisted as real, reviewable rows — no client-side randomness,
-- no localStorage. Returns { ok, due, generated, next_due }. If not yet due, generates
-- nothing and reports the next eligible date.
CREATE OR REPLACE FUNCTION public.greetings_generate_batch(
  p_actor_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_count integer DEFAULT 25
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid;
  v_last   timestamptz;
  v_seed   integer;
  v_made   integer := 0;
  v_line   text;
  i        integer;
  openers  text[] := ARRAY[
    'Let''s', 'Today', 'This shift', 'Right now', 'Come on team', 'Team VIP',
    'Starting now', 'Every guest —', 'From open to close', 'This is the day —'];
  mids     text[] := ARRAY[
    'bring big energy', 'lead with a smile', 'spread good vibes', 'stay happy and sharp',
    'turn hellos into sales', 'make it warm and fun', 'keep the floor electric',
    'radiate positivity', 'sell with heart', 'own every interaction',
    'be contagiously upbeat', 'drive sales with a grin'];
  closers  text[] := ARRAY[
    'and watch the sales follow.', '— guests can feel it.', 'and make today count.',
    'because good vibes close.', 'and leave them smiling.', '— that''s the VIP way.',
    'and outshine yesterday.', 'so every guest comes back.'];
BEGIN
  SELECT tenant_id INTO v_tenant FROM org_nodes ORDER BY tenant_id LIMIT 1;  -- HR is single-tenant
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No tenant configured'; END IF;

  SELECT max(generated_at) INTO v_last FROM public.hr_greeting_batches WHERE tenant_id = v_tenant;
  IF v_last IS NOT NULL AND v_last > now() - interval '30 days' THEN
    RETURN jsonb_build_object('ok', true, 'due', false, 'generated', 0,
                              'next_due', v_last + interval '30 days');
  END IF;

  -- deterministic-but-varied composition seeded off how many lines already exist
  SELECT count(*) INTO v_seed FROM public.hr_greetings WHERE tenant_id = v_tenant;
  FOR i IN 0 .. GREATEST(COALESCE(p_count, 25), 1) - 1 LOOP
    v_line :=
      openers[1 + ((v_seed + i) * 3) % array_length(openers, 1)] || ' ' ||
      mids   [1 + ((v_seed + i) * 5 + 1) % array_length(mids, 1)] || ' ' ||
      closers[1 + ((v_seed + i) * 7 + 2) % array_length(closers, 1)];
    INSERT INTO public.hr_greetings (tenant_id, text, status, source, created_by)
    VALUES (v_tenant, v_line, 'pending', 'ai', p_actor_id)
    ON CONFLICT (tenant_id, text) DO NOTHING;
    IF FOUND THEN v_made := v_made + 1; END IF;
  END LOOP;

  INSERT INTO public.hr_greeting_batches (tenant_id, proposed_count, generated_by)
  VALUES (v_tenant, v_made, p_actor_id);

  RETURN jsonb_build_object('ok', true, 'due', true, 'generated', v_made,
                            'next_due', now() + interval '30 days');
END; $$;
GRANT EXECUTE ON FUNCTION public.greetings_generate_batch(uuid, text, integer) TO anon, authenticated;
