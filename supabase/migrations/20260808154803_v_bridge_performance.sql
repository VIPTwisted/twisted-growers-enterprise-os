/* HOW FAST IS IT, ANSWERED WITH DATA. Owner: "act like MIT engineer for google
   and microsoft".

   Every claim about speed today - mine included - has been a single stopwatch
   reading quoted as if it were the system's behaviour. One measurement is an
   anecdote. A p95 is a fact, and it is the number that matters: the average
   hides the person who waited a minute, and that person is the one who says
   the assistant is broken.

   Reads ai_bridge_jobs, which already records seconds per job. No new
   instrumentation, no agent to run, nothing to keep in step - the data was
   always there and nobody was looking at it. */
create or replace view v_bridge_performance as
with j as (
  select date_trunc('hour', created_at) as hour,
         status, seconds,
         extract(epoch from (claimed_at - created_at)) as waited_to_start
  from ai_bridge_jobs
  where created_at > now() - interval '7 days'
)
select hour,
       count(*)                                              as questions,
       count(*) filter (where status = 'done')                as answered,
       count(*) filter (where status = 'error')               as failed,
       count(*) filter (where status = 'running')             as still_running,
       round(avg(seconds) filter (where status = 'done'))::int              as avg_seconds,
       round(percentile_cont(0.50) within group (order by seconds)
             filter (where status = 'done'))::int                            as p50_seconds,
       round(percentile_cont(0.95) within group (order by seconds)
             filter (where status = 'done'))::int                            as p95_seconds,
       max(seconds) filter (where status = 'done')                           as slowest_seconds,
       round(avg(waited_to_start))::int                                      as avg_queue_wait_seconds
from j
group by hour
order by hour desc;

comment on view v_bridge_performance is
  'Bridge speed by hour over seven days. p95 is the number that matters - an average hides the person who waited a minute, and that person is the one who reports the assistant as broken. avg_queue_wait_seconds is time spent BEFORE any work started, which is the platform''s own overhead rather than the model''s.';

grant select on v_bridge_performance to authenticated;

select questions, answered, failed, avg_seconds, p50_seconds, p95_seconds,
       slowest_seconds, avg_queue_wait_seconds
from v_bridge_performance limit 3;;
