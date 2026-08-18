/* THE THREE GUARDED CRON VIEWS GO BACK TO OWNER-MODE — invoker mode blanked them
 * for everyone, executives included.
 *
 * After the self-guard wrap, verification as the signed-in owner read
 * v_cron_health = 65 rows but v_loop_health, v_sentinel_coverage and
 * v_sentinel_cron_silence = 0. The difference: those three carried
 * security_invoker = true, so they executed as the caller — and pg_cron's own
 * RLS (username = current_user) hides every job from the authenticated role no
 * matter who is signed in. The is_executive() guard in the body already does
 * the gating these views need; owner-mode is what lets them read cron.job at
 * all, exactly as their rls_intent declarations state. v_cron_health, which
 * kept owner-mode, is the proven-correct configuration — this aligns the other
 * three with it. */

alter view public.v_loop_health set (security_invoker = false);
alter view public.v_sentinel_coverage set (security_invoker = false);
alter view public.v_sentinel_cron_silence set (security_invoker = false);;
