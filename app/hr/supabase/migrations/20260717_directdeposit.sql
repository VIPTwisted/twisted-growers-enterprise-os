-- ============================================================================
-- Pay & Direct Deposit backend
-- Screen: src/screens/DirectDeposit.jsx
--
-- Reuses the pre-existing dd_change_requests table plus the pre-existing read
-- RPCs get_my_direct_deposit(p_person_id) and get_pending_dd_changes(p_node_ids).
-- Adds the missing write RPCs (submit / review) and the payroll surfaces that
-- had no backend at all (pay stubs, W-4, payroll runs, pay adjustments) so the
-- screen can render real data with honest empty states instead of mock arrays.
--
-- All money/PII tables: RLS ENABLED with NO permissive policy — reachable only
-- through the SECURITY DEFINER RPCs below (owner-privileged, search_path pinned).
-- Idempotent: safe to re-run.
-- ============================================================================

-- ── dd_change_requests: additive columns the UI needs (table already exists) ──
ALTER TABLE public.dd_change_requests ADD COLUMN IF NOT EXISTS routing_last4  text;
ALTER TABLE public.dd_change_requests ADD COLUMN IF NOT EXISTS effective_date date;

-- ── Pay stubs (produced by payroll; empty until real payroll integration) ─────
CREATE TABLE IF NOT EXISTS public.pay_stubs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid,
  node_id           uuid,
  person_id         uuid NOT NULL,
  period_start      date NOT NULL,
  period_end        date NOT NULL,
  pay_date          date,
  reg_hours         numeric NOT NULL DEFAULT 0,
  ot_hours          numeric NOT NULL DEFAULT 0,
  tips              numeric NOT NULL DEFAULT 0,
  gross             numeric NOT NULL DEFAULT 0,
  fed_tax           numeric NOT NULL DEFAULT 0,
  state_tax         numeric NOT NULL DEFAULT 0,
  ct_tax            numeric NOT NULL DEFAULT 0,
  health            numeric NOT NULL DEFAULT 0,
  retirement_401k   numeric NOT NULL DEFAULT 0,
  other_deductions  numeric NOT NULL DEFAULT 0,
  net               numeric NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'Paid',
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pay_stubs_person_idx ON public.pay_stubs(person_id, pay_date DESC);
ALTER TABLE public.pay_stubs ENABLE ROW LEVEL SECURITY;

-- ── W-4 federal withholding (history-preserving; latest row is current) ───────
CREATE TABLE IF NOT EXISTS public.w4_withholding (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid,
  person_id          uuid NOT NULL,
  filing_status      text NOT NULL DEFAULT 'Single',
  allowances         int  NOT NULL DEFAULT 0,
  extra_withholding  numeric NOT NULL DEFAULT 0,
  effective_date     date NOT NULL DEFAULT CURRENT_DATE,
  updated_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS w4_withholding_person_idx ON public.w4_withholding(person_id, created_at DESC);
ALTER TABLE public.w4_withholding ENABLE ROW LEVEL SECURITY;

-- ── Payroll runs (recorded when HR runs payroll) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  node_id         uuid,
  run_date        date NOT NULL DEFAULT CURRENT_DATE,
  pay_date        date,
  employee_count  int  NOT NULL DEFAULT 0,
  total_gross     numeric NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'completed',
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_runs_node_idx ON public.payroll_runs(node_id, run_date DESC);
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

-- ── Per-employee pay adjustments queued for the next run ──────────────────────
CREATE TABLE IF NOT EXISTS public.pay_adjustments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  node_id         uuid,
  person_id       uuid NOT NULL,
  adj_type        text NOT NULL DEFAULT 'Bonus',
  amount          numeric NOT NULL DEFAULT 0,
  note            text,
  status          text NOT NULL DEFAULT 'queued',   -- queued | applied
  payroll_run_id  uuid,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pay_adjustments_status_idx ON public.pay_adjustments(status, node_id);
ALTER TABLE public.pay_adjustments ENABLE ROW LEVEL SECURITY;

-- ── Helper: resolve (node_id, tenant_id) for a person from their assignment ───
CREATE OR REPLACE FUNCTION public._dd_person_scope(p_person_id uuid)
RETURNS TABLE(node_id uuid, tenant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT a.node_id, n.tenant_id
  FROM assignments a JOIN org_nodes n ON n.id = a.node_id
  WHERE a.person_id = p_person_id
  ORDER BY a.effective_from DESC NULLS LAST
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public._dd_person_scope(uuid) TO anon, authenticated;

-- ── Roster with pay + direct-deposit setup status (no existing equivalent) ────
-- get_roster gives names/roles/locations but not wage or DD status; this joins
-- the latest wage_history + latest dd_change_requests per person.
CREATE OR REPLACE FUNCTION public.get_dd_roster(p_node_ids uuid[])
RETURNS TABLE(
  person_id     uuid,
  full_name     text,
  node_id       uuid,
  location      text,
  role_name     text,
  wage          numeric,
  bank_name     text,
  account_type  text,
  account_last4 text,
  dd_status     text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    p.id,
    COALESCE(p.display_name, p.full_name) AS full_name,
    a.node_id,
    n.name AS location,
    r.name AS role_name,
    w.new_wage AS wage,
    d.bank_name,
    d.account_type,
    CASE WHEN d.status IN ('approved','active') THEN d.account_last4 ELSE NULL END AS account_last4,
    CASE
      WHEN d.status IN ('approved','active') THEN 'Active'
      WHEN d.status = 'pending' THEN 'Pending'
      ELSE 'Missing'
    END AS dd_status
  FROM people p
  JOIN LATERAL (
    SELECT a2.node_id, a2.role_id
    FROM assignments a2
    WHERE a2.person_id = p.id
    ORDER BY a2.effective_from DESC NULLS LAST
    LIMIT 1
  ) a ON TRUE
  JOIN org_nodes n ON n.id = a.node_id
  LEFT JOIN roles r ON r.id = a.role_id
  LEFT JOIN LATERAL (
    SELECT wh.new_wage FROM wage_history wh
    WHERE wh.person_id = p.id
    ORDER BY wh.effective_date DESC, wh.created_at DESC LIMIT 1
  ) w ON TRUE
  LEFT JOIN LATERAL (
    SELECT dc.bank_name, dc.account_type, dc.account_last4, dc.status
    FROM dd_change_requests dc
    WHERE dc.person_id = p.id
    ORDER BY (dc.status IN ('approved','active')) DESC, dc.submitted_at DESC NULLS LAST
    LIMIT 1
  ) d ON TRUE
  WHERE a.node_id = ANY(p_node_ids)
    AND COALESCE(p.is_active, TRUE) = TRUE
  ORDER BY full_name;
$$;
GRANT EXECUTE ON FUNCTION public.get_dd_roster(uuid[]) TO anon, authenticated;

-- ── Submit a direct-deposit change (employee) → pending review ────────────────
CREATE OR REPLACE FUNCTION public.submit_dd_change(
  p_person_id     uuid,
  p_bank_name     text,
  p_account_type  text,
  p_routing_last4 text,
  p_account_last4 text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_node uuid; v_id uuid;
BEGIN
  SELECT node_id INTO v_node FROM public._dd_person_scope(p_person_id);
  INSERT INTO dd_change_requests(node_id, person_id, bank_name, account_type,
                                 routing_last4, account_last4, status, submitted_at)
  VALUES (v_node, p_person_id, p_bank_name, p_account_type,
          NULLIF(RIGHT(regexp_replace(COALESCE(p_routing_last4,''),'\D','','g'),4),''),
          NULLIF(RIGHT(regexp_replace(COALESCE(p_account_last4,''),'\D','','g'),4),''),
          'pending', now())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.submit_dd_change(uuid,text,text,text,text) TO anon, authenticated;

-- ── Review a pending direct-deposit change (HR/manager) ───────────────────────
CREATE OR REPLACE FUNCTION public.review_dd_change(
  p_request_id uuid, p_action text, p_reviewer_id uuid DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_status text; v_person uuid;
BEGIN
  v_status := CASE lower(p_action) WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected'
                                   ELSE lower(p_action) END;
  SELECT person_id INTO v_person FROM dd_change_requests WHERE id = p_request_id;
  IF v_person IS NULL THEN RETURN FALSE; END IF;
  -- Approving a new account supersedes the person's prior active account.
  IF v_status = 'approved' THEN
    UPDATE dd_change_requests SET status = 'superseded'
     WHERE person_id = v_person AND status IN ('approved','active') AND id <> p_request_id;
  END IF;
  UPDATE dd_change_requests
     SET status = v_status,
         reviewed_by = p_reviewer_id,
         reviewed_at = now(),
         effective_date = CASE WHEN v_status = 'approved' THEN CURRENT_DATE ELSE effective_date END
   WHERE id = p_request_id;
  RETURN TRUE;
END; $$;
GRANT EXECUTE ON FUNCTION public.review_dd_change(uuid,text,uuid) TO anon, authenticated;

-- ── Pay stubs for the signed-in employee ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_pay_stubs(p_person_id uuid, p_limit int DEFAULT 26)
RETURNS SETOF public.pay_stubs
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM pay_stubs
  WHERE person_id = p_person_id
  ORDER BY COALESCE(pay_date, period_end) DESC
  LIMIT GREATEST(p_limit, 1);
$$;
GRANT EXECUTE ON FUNCTION public.get_my_pay_stubs(uuid,int) TO anon, authenticated;

-- ── W-4 read / write ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_w4(p_person_id uuid)
RETURNS SETOF public.w4_withholding
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM w4_withholding
  WHERE person_id = p_person_id
  ORDER BY created_at DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_w4(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_w4(
  p_person_id uuid, p_filing_status text, p_allowances int,
  p_extra numeric, p_updated_by uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant uuid; v_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public._dd_person_scope(p_person_id);
  INSERT INTO w4_withholding(tenant_id, person_id, filing_status, allowances, extra_withholding, updated_by)
  VALUES (v_tenant, p_person_id, COALESCE(p_filing_status,'Single'),
          COALESCE(p_allowances,0), COALESCE(p_extra,0), p_updated_by)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.save_w4(uuid,text,int,numeric,uuid) TO anon, authenticated;

-- ── Pay adjustments: list / add / remove ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_pay_adjustments(p_node_ids uuid[], p_status text DEFAULT 'queued')
RETURNS TABLE(
  id uuid, person_id uuid, employee_name text, adj_type text,
  amount numeric, note text, status text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT pa.id, pa.person_id, COALESCE(p.display_name, p.full_name) AS employee_name,
         pa.adj_type, pa.amount, pa.note, pa.status, pa.created_at
  FROM pay_adjustments pa
  LEFT JOIN people p ON p.id = pa.person_id
  WHERE pa.node_id = ANY(p_node_ids)
    AND (p_status IS NULL OR pa.status = p_status)
  ORDER BY pa.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_pay_adjustments(uuid[],text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.add_pay_adjustment(
  p_person_id uuid, p_type text, p_amount numeric,
  p_note text DEFAULT NULL, p_created_by uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_node uuid; v_tenant uuid; v_id uuid;
BEGIN
  SELECT node_id, tenant_id INTO v_node, v_tenant FROM public._dd_person_scope(p_person_id);
  INSERT INTO pay_adjustments(tenant_id, node_id, person_id, adj_type, amount, note, status, created_by)
  VALUES (v_tenant, v_node, p_person_id, COALESCE(p_type,'Bonus'), COALESCE(p_amount,0),
          p_note, 'queued', p_created_by)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.add_pay_adjustment(uuid,text,numeric,text,uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.remove_pay_adjustment(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  DELETE FROM pay_adjustments WHERE id = p_id AND status = 'queued';
  RETURN FOUND;
END; $$;
GRANT EXECUTE ON FUNCTION public.remove_pay_adjustment(uuid) TO anon, authenticated;

-- ── Payroll runs: list / run ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_payroll_runs(p_node_ids uuid[], p_limit int DEFAULT 12)
RETURNS SETOF public.payroll_runs
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM payroll_runs
  WHERE node_id = ANY(p_node_ids)
  ORDER BY run_date DESC, created_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;
GRANT EXECUTE ON FUNCTION public.get_payroll_runs(uuid[],int) TO anon, authenticated;

-- Records a payroll run: applies every queued adjustment in scope and stamps a
-- run row with the real employee count + real queued-adjustment total. Does NOT
-- fabricate hours/gross it does not have.
CREATE OR REPLACE FUNCTION public.run_payroll(
  p_node_ids uuid[], p_pay_date date DEFAULT NULL, p_created_by uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_node uuid; v_tenant uuid; v_count int; v_gross numeric; v_id uuid;
BEGIN
  v_node := (p_node_ids)[1];
  SELECT tenant_id INTO v_tenant FROM org_nodes WHERE id = v_node;
  SELECT count(*) INTO v_count FROM public.get_dd_roster(p_node_ids);
  SELECT COALESCE(sum(amount),0) INTO v_gross
    FROM pay_adjustments WHERE node_id = ANY(p_node_ids) AND status = 'queued';
  INSERT INTO payroll_runs(tenant_id, node_id, run_date, pay_date, employee_count, total_gross, status, created_by)
  VALUES (v_tenant, v_node, CURRENT_DATE, COALESCE(p_pay_date, CURRENT_DATE),
          COALESCE(v_count,0), v_gross, 'completed', p_created_by)
  RETURNING id INTO v_id;
  UPDATE pay_adjustments
     SET status = 'applied', payroll_run_id = v_id
   WHERE node_id = ANY(p_node_ids) AND status = 'queued';
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.run_payroll(uuid[],date,uuid) TO anon, authenticated;
