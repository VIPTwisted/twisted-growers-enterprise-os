-- Requests (PTO & Leave) screen — backend gap closure.
-- HR brain project: zsmdejhgdyyaakqsjhmk
--
-- The Requests screen is otherwise fully served by EXISTING backend objects:
--   * reads    -> direct SELECT on public.time_off_requests (scoped by node_id),
--                 embedding public.people + public.org_nodes.
--   * submit   -> public.submit_pto_request(uuid,uuid,text,date,date,text)
--   * approve  -> public.review_time_off(p_action,p_request_id,p_reviewer_id)
--   * deny     -> public.review_time_off(p_action,p_request_id,p_reviewer_id)
--
-- The ONLY missing write path was employee self-cancel: the client had been
-- issuing a raw anon UPDATE on time_off_requests (works only while RLS is open,
-- and the fortress campaign will lock that table). This adds a proper
-- SECURITY DEFINER RPC so cancel keeps working after lockdown, and enforces
-- ownership + pending-only so a person can only withdraw their own,
-- not-yet-reviewed request.

CREATE OR REPLACE FUNCTION public.cancel_time_off_request(
  p_request_id uuid,
  p_person_id  uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE time_off_requests
     SET status = 'cancelled'
   WHERE id = p_request_id
     AND person_id = p_person_id
     AND lower(COALESCE(status, 'pending')) = 'pending'
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Request % not found, not yours, or already reviewed', p_request_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_time_off_request(uuid, uuid) TO anon, authenticated;
