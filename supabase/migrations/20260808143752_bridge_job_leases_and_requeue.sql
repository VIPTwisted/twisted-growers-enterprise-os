/* FORTIFYING THE BRIDGE, PART 1: A CLAIMED JOB CANNOT BE LOST.
   Owner, 8 August 2026: "why is this bridge so unstable and total shit what way
   can we fortify enhance it like microsoft or google would".

   The honest answer to the first half: it is one process, on one desktop, with
   nothing supervising it and no way to recover work it was holding when it
   died. Every one of those is fixable, and this is the one that can be fixed
   from the database side alone - it needs no desktop to be running to work.

   THE FAILURE IT CLOSES. A job goes pending -> running the moment the bridge
   claims it. If that process is then killed - a reboot, a crash, a taskkill
   like the one performed a minute ago - the row stays 'running' FOR EVER. The
   person watching the page waits for an answer that is never coming, and the
   next bridge to start does not pick it up, because claim only looks at
   'pending'. The work is not slow; it is gone, silently.

   That is exactly what a queue lease is for. A claim is a lease, not a
   transfer: hold it too long without answering and it returns to the queue.
   This is how every durable queue works and it is the difference between a
   pipeline that survives a machine dying and one that needs a person to notice.

   TEN MINUTES. Real answers have taken 250 seconds, so a limit under about five
   would return work that was still being done and answer it twice. Ten is far
   enough past the worst observed time to be safe, and short enough that nobody
   sits looking at a dead page for a shift. */
alter table ai_bridge_jobs add column if not exists attempts int not null default 0;
alter table ai_bridge_jobs add column if not exists requeued_at timestamptz;

comment on column ai_bridge_jobs.attempts is
  'How many times a bridge has claimed this. A job that keeps being claimed and lost is a poison message, and after 3 attempts it is failed rather than cycling for ever.';

create or replace function f_requeue_stalled_bridge_jobs()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_requeued int; v_failed int;
begin
  /* Poison-message guard FIRST. A question that kills the bridge every time it
     is claimed would otherwise cycle for ever, taking the bridge down with it
     on every pass - a retry loop that looks like instability and is actually
     one bad input. */
  with dead as (
    update ai_bridge_jobs
    set status = 'error',
        error = 'Given up after 3 attempts. The bridge claimed this and stopped before answering each time - the desktop may be crashing on this particular question.',
        answered_at = now()
    where status = 'running'
      and claimed_at < now() - interval '10 minutes'
      and attempts >= 3
    returning 1)
  select count(*) into v_failed from dead;

  with back as (
    update ai_bridge_jobs
    set status = 'pending', claimed_at = null, requeued_at = now(),
        attempts = attempts + 1
    where status = 'running'
      and claimed_at < now() - interval '10 minutes'
      and attempts < 3
    returning 1)
  select count(*) into v_requeued from back;

  return jsonb_build_object('requeued', v_requeued, 'given_up', v_failed, 'at', now());
end $$;

comment on function f_requeue_stalled_bridge_jobs is
  'Returns jobs a dead bridge was holding to the queue. Without this a claimed job stays running for ever and the person waiting never learns it is not coming. Runs every minute.';

revoke all on function f_requeue_stalled_bridge_jobs() from public;
grant execute on function f_requeue_stalled_bridge_jobs() to authenticated;

select cron.schedule('requeue-stalled-bridge-jobs', '* * * * *',
                     $$select f_requeue_stalled_bridge_jobs()$$);

/* Anything already stuck from today's restarts comes back now. */
select f_requeue_stalled_bridge_jobs() as recovered_now;;
