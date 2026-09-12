set local lock_timeout='5s';
set local statement_timeout='60s';
do $$ begin
 if encode(sha256(convert_to(pg_get_functiondef('public.tg_apex_verification_finish(uuid,text,boolean,text,integer)'::regprocedure),'UTF8')),'hex') <> '6f7e486989e926f65c27f8377ce677096f7f0a63367f2b2ad2024ee0fdc2d687' then raise exception 'Completion function drift; continuity correction refused'; end if;
 if exists(select 1 from public.apex_sync_verification where state='running') then raise exception 'Drain active Apex syncs first'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.tg_apex_verification_finish(p_run uuid, p_entity text, p_complete boolean, p_error text, p_http_status integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v public.apex_sync_verification%rowtype; e public.apex_entity%rowtype;
  c timestamptz; n integer; bad integer; root_hash text; why text:=nullif(p_error,''); result_state text;
  after_cursor timestamptz; finished timestamptz:=clock_timestamp(); legacy bigint; proof public.apex_empty_history_proof%rowtype; history_context jsonb;
begin
  select * into strict e from public.apex_entity where entity=p_entity for update;
  select * into strict v from public.apex_sync_verification where run_id=p_run and entity=p_entity for update;
  if v.state<>'running' then return to_jsonb(v)||jsonb_build_object('ok',v.state='api_verified'); end if;
  if p_complete is not true then why:=coalesce(why,'Source pull did not complete'); end if;
  if p_http_status is null or p_http_status<200 or p_http_status>=300 then why:=coalesce(why,'Source HTTP success was not confirmed'); end if;
  if v.lease_until<=finished then why:=coalesce(why,'Verification lease expired'); end if;
  if v.policy is distinct from to_jsonb(e) then why:=coalesce(why,'Source policy changed during the run'); end if;
  if not v.terminal_page or v.page_count=0 then why:=coalesce(why,'Complete source pagination was not received'); end if;
  select count(*),count(*) filter(where a.id is null or a.entity<>r.entity or a.apex_id<>r.source_id
      or encode(sha256(convert_to(a.payload::text,'UTF8')),'hex')<>r.source_sha256),
    encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(r.source_id,r.source_sha256,r.raw_id) order by r.source_id),'[]'::jsonb)::text,'UTF8')),'hex')
    into n,bad,root_hash from public.apex_record_verification r left join public.apex_raw a on a.id=r.raw_id where r.run_id=p_run and r.entity=p_entity;
  if n<>v.records_seen or bad>0 then why:=coalesce(why,'Stored record manifest no longer agrees with source evidence'); end if;
  if v.source_total is not null and n<>v.source_total then why:=coalesce(why,'Verified population differs from source total'); end if;
  if exists(select 1 from public.apex_empty_history_proof where entity=p_entity and state='proven_empty') then
    begin
      history_context:=public.tg_apex_history_context(p_entity);
    exception when others then
      why:=coalesce(why,'Cannot validate the Apex initialization context: '||sqlerrm);
    end;
    select h.* into proof from public.apex_empty_history_proof h
     where h.entity=p_entity and h.state='proven_empty' and h.context=history_context
     and v.started_at>=h.finished_at and (
       v.request_from<=h.started_at or exists(select 1 from public.apex_sync_verification prior
        where prior.entity=p_entity and prior.state='api_verified' and prior.empty_history_proof_id=h.id
         and prior.cursor_after=v.cursor_before and prior.finished_at<=v.started_at))
     order by h.finished_at desc limit 1;
  end if;
  if proof.id is null and
   exists(select 1 from public.apex_empty_history_proof where entity=p_entity and state='proven_empty') then
    why:=coalesce(why,'Apex history context or cursor continuity is unproven; cursor held');
  end if;
  if e.supports_delta and n=0 and proof.id is null and
   (not exists(select 1 from public.apex_raw where entity=p_entity)
    or exists(select 1 from public.apex_empty_history_proof where entity=p_entity)) then
    why:=coalesce(why,'Empty first delta is not proof of an empty source population; cursor held');
  end if;
  insert into public.apex_watermark(entity) values(p_entity) on conflict(entity) do nothing;
  select updated_at_from into c from public.apex_watermark where entity=p_entity for update;
  if c is distinct from v.cursor_before then why:=coalesce(why,'Another run changed the source cursor; this run cannot overwrite it'); end if;
  result_state:=case when why is null then 'api_verified' when v.page_count>0 then 'incomplete' else 'error' end;
  after_cursor:=case when why is null and e.supports_delta then v.started_at else c end;
  if why is null then
    update public.apex_watermark set updated_at_from=after_cursor,last_success_at=finished,last_attempt_at=finished,consecutive_errors=0 where entity=p_entity;
  else
    update public.apex_watermark set last_attempt_at=finished,consecutive_errors=coalesce(consecutive_errors,0)+1 where entity=p_entity;
  end if;
  insert into public.apex_sync_run(run_id,entity,started_at,finished_at,status,http_status,rows_seen,rows_written,watermark_before,watermark_after,error,meta_total)
    values(p_run,p_entity,v.started_at,finished,case when why is null then 'ok' else 'error' end,p_http_status,v.records_seen,v.records_written,v.cursor_before,after_cursor,why,v.source_total)
    returning id into legacy;
  update public.apex_sync_verification set state=result_state,finished_at=finished,cursor_after=after_cursor,
    manifest_sha256=root_hash,error=why,legacy_run_id=legacy,empty_history_proof_id=proof.id where run_id=p_run and entity=p_entity returning * into v;
  return to_jsonb(v)||jsonb_build_object('ok',why is null);
end
$function$;
