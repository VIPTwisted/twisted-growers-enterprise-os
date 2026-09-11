-- GPT: bounded Apex delta freshness repair. Configuration only.
-- Execute the entire file as one transaction after capturing the current policy.
-- No business row, watermark, source payload, permission or worker is changed.
begin;
set local application_name = 'gpt_apex_freshness';
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $repair$
declare
  v_job bigint;
  v_count integer;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('gpt_apex_freshness',0)) then
    raise exception 'Another freshness repair owns this transaction';
  end if;

  perform 1 from public.apex_entity
   where entity in ('shipping-orders','batches','products','buyers','buyer-leads')
   order by entity for update;
  select count(*) into v_count
    from public.apex_entity
   where entity in ('shipping-orders','batches','products','buyers','buyer-leads')
     and required is true and supports_delta is true and pull_mode='loop'
     and min_interval_minutes=case when entity='shipping-orders' then 120 else 240 end;
  if v_count <> 5 then
    raise exception 'Apex policy changed or is incomplete; inspect before applying';
  end if;

  select jobid into strict v_job from cron.job
   where jobname='apex-sync-daily' and active is true
     and schedule='15 */2 * * *'
     and command='set statement_timeout = ''20min''; select public.tg_apex_delta_all()'
     and database=current_database();

  update public.apex_entity set min_interval_minutes=10
   where entity in ('shipping-orders','batches','products','buyers','buyer-leads');
  get diagnostics v_count = row_count;
  if v_count <> 5 then raise exception 'Expected exactly five policy changes'; end if;

  perform cron.alter_job(v_job, schedule := '* * * * *');

  if not exists(select 1 from cron.job where jobid=v_job and active
                and schedule='* * * * *') then
    raise exception 'Scheduler update was not persisted';
  end if;
end
$repair$;
commit;
