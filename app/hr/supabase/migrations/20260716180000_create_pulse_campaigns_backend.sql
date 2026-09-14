-- VIP Pulse — survey campaigns backend (Microsoft Viva Pulse analog).
-- Replaces the old localStorage-only Pulse.jsx (LS_CAMP / LS_RESP / seedCamps) with a
-- real, tenant-scoped backend on the HR brain (zsmdejhgdyyaakqsjhmk).
--
-- HR is single-tenant; tenant is derived from org_nodes exactly like create_employee /
-- create_helpdesk_ticket. Access is via SECURITY DEFINER RPCs only (RLS on, no anon
-- policies) — the app authenticates through pin_login and calls RPCs under the anon role,
-- so EXECUTE is granted to anon + authenticated like every sibling HR RPC.
--
-- Anonymity model: pulse_responses.person_id is ALWAYS stored (so one-response-per-person
-- can be enforced and employees can see what they've completed), but get_pulse_responses
-- NEVER returns any identity column — analytics only ever sees the answer payload. This
-- preserves candor for anonymous campaigns while still de-duplicating submissions.

-- ── Tables ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pulse_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  node_id         uuid,
  title           text NOT NULL,
  questions       jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{id,type,text,options?}]
  audience        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {roles:[],locations:[]}
  anonymous       boolean NOT NULL DEFAULT true,
  status          text NOT NULL DEFAULT 'active',       -- active | closed
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pulse_campaigns ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pulse_responses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  campaign_id    uuid NOT NULL REFERENCES public.pulse_campaigns(id) ON DELETE CASCADE,
  person_id      uuid,
  responder_name text,
  answers        jsonb NOT NULL DEFAULT '{}'::jsonb,    -- {questionId: value}
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pulse_responses ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS pulse_campaigns_status_idx  ON public.pulse_campaigns (status);
CREATE INDEX IF NOT EXISTS pulse_responses_camp_idx    ON public.pulse_responses (campaign_id);
-- One response per person per campaign (person_id is always stored, even for anonymous).
CREATE UNIQUE INDEX IF NOT EXISTS pulse_responses_camp_person_uq
  ON public.pulse_responses (campaign_id, person_id) WHERE person_id IS NOT NULL;

-- ── Reads ───────────────────────────────────────────────────────────────────────
-- All campaigns for the tenant, each with its live response count (HR manage view + KPIs).
CREATE OR REPLACE FUNCTION public.get_pulse_campaigns(
  p_node_ids uuid[] DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(c ORDER BY c.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT pc.id, pc.title, pc.questions, pc.audience, pc.anonymous, pc.status,
           pc.created_by_name, pc.created_at,
           (SELECT count(*) FROM public.pulse_responses pr WHERE pr.campaign_id = pc.id) AS response_count
    FROM public.pulse_campaigns pc
  ) c;
$$;
GRANT EXECUTE ON FUNCTION public.get_pulse_campaigns(uuid[]) TO anon, authenticated;

-- Active campaigns for an employee's "My Surveys" tab, each flagged responded / not.
CREATE OR REPLACE FUNCTION public.get_my_pulse_surveys(
  p_person_id uuid
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(c ORDER BY c.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT pc.id, pc.title, pc.questions, pc.audience, pc.anonymous, pc.status, pc.created_at,
           EXISTS (
             SELECT 1 FROM public.pulse_responses pr
             WHERE pr.campaign_id = pc.id AND pr.person_id = p_person_id
           ) AS responded
    FROM public.pulse_campaigns pc
    WHERE pc.status = 'active'
  ) c;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_pulse_surveys(uuid) TO anon, authenticated;

-- Responses for one campaign — ANSWERS ONLY (no identity ever, anonymity-safe).
CREATE OR REPLACE FUNCTION public.get_pulse_responses(
  p_campaign_id uuid
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(r ORDER BY r.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT pr.answers, pr.created_at
    FROM public.pulse_responses pr
    WHERE pr.campaign_id = p_campaign_id
  ) r;
$$;
GRANT EXECUTE ON FUNCTION public.get_pulse_responses(uuid) TO anon, authenticated;

-- Aggregate KPIs for the HR manage header (campaigns / active / total responses / eNPS).
-- eNPS scans every answer whose owning question is type 'nps' with a numeric value.
CREATE OR REPLACE FUNCTION public.get_pulse_kpis(
  p_node_ids uuid[] DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH nps AS (
    SELECT (a.val)::numeric AS score
    FROM public.pulse_responses r
    JOIN public.pulse_campaigns c ON c.id = r.campaign_id
    CROSS JOIN LATERAL jsonb_each(r.answers) AS a(qid, val)
    WHERE jsonb_typeof(a.val) = 'number'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(c.questions) q
        WHERE q->>'id' = a.qid AND q->>'type' = 'nps'
      )
  ), agg AS (
    SELECT count(*) FILTER (WHERE score >= 9) AS promoters,
           count(*) FILTER (WHERE score <= 6) AS detractors,
           count(*) AS n
    FROM nps
  )
  SELECT jsonb_build_object(
    'campaigns',       (SELECT count(*) FROM public.pulse_campaigns),
    'active',          (SELECT count(*) FROM public.pulse_campaigns WHERE status = 'active'),
    'total_responses', (SELECT count(*) FROM public.pulse_responses),
    'enps',            (SELECT CASE WHEN n > 0
                                    THEN round(((promoters - detractors)::numeric / n) * 100)
                                    ELSE NULL END
                        FROM agg)
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_pulse_kpis(uuid[]) TO anon, authenticated;

-- ── Writes ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_pulse_campaign(
  p_title text,
  p_questions jsonb,
  p_audience jsonb DEFAULT '{}'::jsonb,
  p_anonymous boolean DEFAULT true,
  p_created_by uuid DEFAULT NULL,
  p_created_by_name text DEFAULT NULL,
  p_node_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant uuid; v_id uuid;
BEGIN
  IF COALESCE(NULLIF(btrim(p_title), ''), '') = '' THEN
    RAISE EXCEPTION 'Campaign title is required';
  END IF;
  IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array'
     OR jsonb_array_length(p_questions) = 0 THEN
    RAISE EXCEPTION 'At least one question is required';
  END IF;

  IF p_node_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant FROM org_nodes WHERE id = p_node_id LIMIT 1;
  END IF;
  IF v_tenant IS NULL THEN
    SELECT tenant_id INTO v_tenant FROM org_nodes ORDER BY tenant_id LIMIT 1;  -- HR is single-tenant
  END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No tenant configured'; END IF;

  INSERT INTO public.pulse_campaigns
    (tenant_id, node_id, title, questions, audience, anonymous, status, created_by, created_by_name)
  VALUES
    (v_tenant, p_node_id, btrim(p_title), p_questions,
     COALESCE(p_audience, '{}'::jsonb), COALESCE(p_anonymous, true),
     'active', p_created_by, NULLIF(btrim(COALESCE(p_created_by_name, '')), ''))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.create_pulse_campaign(text, jsonb, jsonb, boolean, uuid, text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_pulse_campaign_status(
  p_campaign_id uuid,
  p_status text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_status text;
BEGIN
  v_status := COALESCE(NULLIF(p_status, ''), 'active');
  IF v_status NOT IN ('active', 'closed') THEN
    RAISE EXCEPTION 'Invalid status %', p_status;
  END IF;
  UPDATE public.pulse_campaigns
     SET status = v_status, updated_at = now()
   WHERE id = p_campaign_id
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Campaign not found'; END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'status', v_status);
END; $$;
GRANT EXECUTE ON FUNCTION public.set_pulse_campaign_status(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_pulse_response(
  p_campaign_id uuid,
  p_person_id uuid,
  p_answers jsonb,
  p_responder_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant uuid; v_anon boolean; v_status text; v_id uuid;
BEGIN
  SELECT tenant_id, anonymous, status INTO v_tenant, v_anon, v_status
  FROM public.pulse_campaigns WHERE id = p_campaign_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Campaign not found'; END IF;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'Campaign is closed'; END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'Answers are required';
  END IF;
  IF p_person_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pulse_responses
    WHERE campaign_id = p_campaign_id AND person_id = p_person_id
  ) THEN
    RAISE EXCEPTION 'You have already responded to this survey';
  END IF;

  INSERT INTO public.pulse_responses
    (tenant_id, campaign_id, person_id, responder_name, answers)
  VALUES
    (v_tenant, p_campaign_id, p_person_id,
     CASE WHEN v_anon THEN 'Anonymous' ELSE NULLIF(btrim(COALESCE(p_responder_name, '')), '') END,
     p_answers)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.submit_pulse_response(uuid, uuid, jsonb, text) TO anon, authenticated;

-- ── Daily Pulse enforcement settings (admin-adjustable, was localStorage) ─────────
CREATE TABLE IF NOT EXISTS public.pulse_settings (
  tenant_id            uuid PRIMARY KEY,
  reminder_mins        integer NOT NULL DEFAULT 30,
  enforce_on_clock_in  boolean NOT NULL DEFAULT false,
  enforce_break_return boolean NOT NULL DEFAULT true,
  ai_reminder          boolean NOT NULL DEFAULT true,
  updated_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pulse_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_pulse_settings(
  p_node_ids uuid[] DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant uuid; v jsonb;
BEGIN
  SELECT tenant_id INTO v_tenant FROM org_nodes ORDER BY tenant_id LIMIT 1;  -- HR single-tenant
  SELECT jsonb_build_object(
           'reminderMins', reminder_mins,
           'enforceOnClockIn', enforce_on_clock_in,
           'enforceOnBreakReturn', enforce_break_return,
           'aiReminder', ai_reminder
         ) INTO v
  FROM public.pulse_settings WHERE tenant_id = v_tenant;
  IF v IS NULL THEN
    v := jsonb_build_object('reminderMins', 30, 'enforceOnClockIn', false,
                            'enforceOnBreakReturn', true, 'aiReminder', true);
  END IF;
  RETURN v;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_pulse_settings(uuid[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_pulse_settings(
  p_reminder_mins integer,
  p_enforce_on_clock_in boolean,
  p_enforce_break_return boolean,
  p_ai_reminder boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM org_nodes ORDER BY tenant_id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No tenant configured'; END IF;
  INSERT INTO public.pulse_settings
    (tenant_id, reminder_mins, enforce_on_clock_in, enforce_break_return, ai_reminder, updated_at)
  VALUES
    (v_tenant, GREATEST(0, COALESCE(p_reminder_mins, 30)),
     COALESCE(p_enforce_on_clock_in, false), COALESCE(p_enforce_break_return, true),
     COALESCE(p_ai_reminder, true), now())
  ON CONFLICT (tenant_id) DO UPDATE
    SET reminder_mins = EXCLUDED.reminder_mins,
        enforce_on_clock_in = EXCLUDED.enforce_on_clock_in,
        enforce_break_return = EXCLUDED.enforce_break_return,
        ai_reminder = EXCLUDED.ai_reminder,
        updated_at = now();
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.set_pulse_settings(integer, boolean, boolean, boolean) TO anon, authenticated;
