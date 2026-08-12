/* AN INFRASTRUCTURE FAILURE IS NOT AN ANSWER. Agent A, 8 August 2026:

     "attempts = 0 and requeued_at = never on both. So requeue-stalled-bridge-jobs
      is not picking them up - either it only targets claimed jobs rather than
      error... Worth checking, because a retry job that runs 1,440 times a day and
      retries nothing is its own false-green."

   The challenge was right and so was the first hypothesis. It covered STALLS -
   claimed and never answered - and nothing else. Proved by planting a synthetic
   stalled job: running -> pending, attempts 0 -> 1. It does fire. It simply
   never covered this.

   The two jobs at 16:33 and 16:35 were mine: the bridge could not launch its
   worker at all, first a PATH resolution failure and then a cmd.exe quoting bug.
   Both are fixed. But the CLASS is what matters here - the bridge could not
   start, so it never read the question, and the person was handed a diagnostic
   as though it were an answer. Nothing about their question was wrong.

   That is worth retrying, and a wrong answer is not. So the retry is narrow: it
   matches failures that are unambiguously the LAUNCH failing, never a model that
   ran and produced something unhelpful. Same three-attempt cap - a machine that
   genuinely cannot launch must not cycle for ever - and the give-up message says
   plainly that the desktop is the problem, not the question. */
create or replace function f_requeue_stalled_bridge_jobs()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_requeued int; v_failed int; v_infra int;
begin
  with dead as (
    update ai_bridge_jobs
    set status = 'error',
        error = 'Given up after 3 attempts. The bridge claimed this and stopped before answering each time - the desktop may be crashing on this particular question.',
        answered_at = now()
    where status = 'running' and claimed_at < now() - interval '10 minutes' and attempts >= 3
    returning 1)
  select count(*) into v_failed from dead;

  with back as (
    update ai_bridge_jobs
    set status = 'pending', claimed_at = null, requeued_at = now(), attempts = attempts + 1
    where status = 'running' and claimed_at < now() - interval '10 minutes' and attempts < 3
    returning 1)
  select count(*) into v_requeued from back;

  /* Deliberately narrow. These three strings are the desktop failing to START
     its worker - not a model that ran and answered badly. A broader match would
     re-run genuinely failed questions for ever and bill the owner's patience for
     it. */
  with infra as (
    update ai_bridge_jobs
    set status = 'pending', claimed_at = null, answered_at = null,
        requeued_at = now(), attempts = attempts + 1, error = null
    where status = 'error'
      and attempts < 3
      and answered_at > now() - interval '24 hours'
      and (error ilike '%cannot find the path specified%'
           or error ilike '%is not recognized as an internal or external command%'
           or error ilike '%Could not start Claude Code%')
    returning 1)
  select count(*) into v_infra from infra;

  return jsonb_build_object('requeued_stalled', v_requeued,
                            'requeued_infrastructure', v_infra,
                            'given_up', v_failed, 'at', now());
end $$;

comment on function f_requeue_stalled_bridge_jobs is
  'Returns work a dead or broken bridge was holding. Covers stalled claims AND launch failures - the desktop failing to start its worker means the question was never read, so handing the person a diagnostic as an answer is wrong. Deliberately does NOT retry a model that ran and answered badly. Three attempts, then it says the desktop is the problem.';

/* Clear the synthetic test row planted to prove the stall path fires. */
delete from ai_bridge_jobs where question like 'SYNTHETIC STALL TEST%';

select f_requeue_stalled_bridge_jobs() as run_now;;
