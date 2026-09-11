-- GPT: recover only the previous polling policy. Retain all newly received data.
-- This refuses a changed policy so recovery cannot silently undo another writer.
begin;
set local application_name = 'gpt_apex_freshness_recovery';
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $recovery$
declare v_job bigint; v_count integer;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('gpt_apex_freshness',0)) then
    raise exception 'Another freshness repair owns this transaction';
  end if;
  perform 1 from public.apex_entity
   where entity in ('shipping-orders','batches','products','buyers','buyer-leads')
   order by entity for update;
  select count(*) into v_count from public.apex_entity
   where entity in ('shipping-orders','batches','products','buyers','buyer-leads')
     and required is true and supports_delta is true and pull_mode='loop'
     and min_interval_minutes=10;
  if v_count <> 5 then raise exception 'Policy changed; inspect before recovery'; end if;
  select jobid into strict v_job from cron.job
   where jobname='apex-sync-daily' and active is true
     and schedule='* * * * *'
     and command='set statement_timeout = ''20min''; select public.tg_apex_delta_all()'
     and database=current_database();
  perform cron.alter_job(v_job, schedule := '15 */2 * * *');
  update public.apex_entity
     set min_interval_minutes=case when entity='shipping-orders' then 120 else 240 end
   where entity in ('shipping-orders','batches','products','buyers','buyer-leads');
end
$recovery$;
commit;
