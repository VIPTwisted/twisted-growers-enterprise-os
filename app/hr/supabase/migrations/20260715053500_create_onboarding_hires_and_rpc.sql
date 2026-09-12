-- New-hire intake is a PENDING record, not a live employee/login. It converts to a real
-- person via hr_create_employee when the hire actually starts.
CREATE TABLE IF NOT EXISTS public.onboarding_hires (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  node_id            uuid,
  full_name          text NOT NULL,
  start_date         date,
  role_label         text,
  pay_rate           numeric,
  email              text,
  phone              text,
  emergency_name     text,
  emergency_phone    text,
  tasks              jsonb,
  raw                jsonb,
  status             text NOT NULL DEFAULT 'pending',
  converted_person_id uuid,
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.onboarding_hires ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.create_employee(p_data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant uuid; v_node uuid; v_id uuid; v_start date; v_rate numeric;
BEGIN
  SELECT tenant_id INTO v_tenant FROM org_nodes ORDER BY tenant_id LIMIT 1;  -- HR is single-tenant
  SELECT id INTO v_node FROM org_nodes
   WHERE tenant_id = v_tenant AND lower(name) = lower(COALESCE(p_data->>'location',''))
   LIMIT 1;
  BEGIN v_start := NULLIF(p_data->>'startDate','')::date; EXCEPTION WHEN OTHERS THEN v_start := NULL; END;
  BEGIN v_rate  := NULLIF(p_data->>'payRate','')::numeric; EXCEPTION WHEN OTHERS THEN v_rate := NULL; END;
  INSERT INTO onboarding_hires(tenant_id, node_id, full_name, start_date, role_label, pay_rate,
                               email, phone, emergency_name, emergency_phone, tasks, raw, status)
  VALUES (
    v_tenant, v_node,
    COALESCE(NULLIF(p_data->>'name',''),'(unnamed)'),
    v_start, p_data->>'role', v_rate,
    p_data->>'email', p_data->>'phone',
    p_data->>'emergencyName', p_data->>'emergencyPhone',
    p_data->'tasks', p_data, 'pending')
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_employee(jsonb) TO anon, authenticated;
