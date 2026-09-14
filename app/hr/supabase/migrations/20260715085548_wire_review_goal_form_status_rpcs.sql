-- 3 more phantom RPCs wired to their real existing tables (exact client args).

-- Reviews: acknowledge / dispute a performance review
CREATE OR REPLACE FUNCTION public.update_review_status(
  p_review_id uuid, p_status text, p_dispute_reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE performance_reviews
     SET status = COALESCE(NULLIF(p_status,''), status),
         acknowledged_at = CASE WHEN p_status = 'acknowledged' THEN now() ELSE acknowledged_at END,
         notes = CASE WHEN COALESCE(p_dispute_reason,'') <> ''
                   THEN COALESCE(notes,'') || E'\n\nDispute: ' || p_dispute_reason ELSE notes END,
         updated_at = now()
   WHERE id = p_review_id
   RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Review % not found', p_review_id; END IF;
  RETURN v_id;
END; $$;

-- Goals: update current progress value
CREATE OR REPLACE FUNCTION public.update_goal_progress(
  p_goal_id uuid, p_progress numeric, p_note text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE sales_goals
     SET current_value = p_progress,
         description = CASE WHEN COALESCE(p_note,'') <> ''
                        THEN COALESCE(description,'') || E'\n[' || CURRENT_DATE || '] ' || p_note ELSE description END,
         updated_at = now()
   WHERE id = p_goal_id
   RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Goal % not found', p_goal_id; END IF;
  RETURN v_id;
END; $$;

-- Forms: manager marks a submission approved/rejected/etc.
CREATE OR REPLACE FUNCTION public.update_form_submission_status(
  p_sub_id uuid, p_status text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE hr_form_submissions
     SET status = p_status, updated_at = now()
   WHERE id = p_sub_id
   RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Submission % not found', p_sub_id; END IF;
  RETURN v_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.update_review_status(uuid,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_goal_progress(uuid,numeric,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_form_submission_status(uuid,text) TO anon, authenticated;
