-- Empty history is an evidenced API population, never an assumption from a delta.
-- Additive, database-only repair. Source calls are GET; no vendor writes.
set local lock_timeout='5s';
set local statement_timeout='60s';

create table public.apex_empty_history_proof (
 id uuid primary key default gen_random_uuid(),
 entity text not null references public.apex_entity(entity),
 started_at timestamptz not null default clock_timestamp(),
 finished_at timestamptz,
 state text not null default 'budget_pending' check(state in ('budget_pending','probing','proven_empty','refused')),
 context jsonb not null,
 history_start timestamptz not null,
 requests jsonb not null default '{}',
 evidence jsonb not null default '{}',
 error text,
 check((state in ('budget_pending','probing'))=(finished_at is null)),
 check(state<>'proven_empty' or error is null)
);
create unique index apex_empty_history_one_open on public.apex_empty_history_proof(entity) where state in ('budget_pending','probing');
alter table public.apex_empty_history_proof enable row level security;
revoke all on public.apex_empty_history_proof from public,anon,authenticated,service_role;
grant select on public.apex_empty_history_proof to service_role;
alter table public.apex_sync_verification add column empty_history_proof_id uuid references public.apex_empty_history_proof(id);

create function public.tg_apex_empty_history_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or old.state in ('proven_empty','refused') then raise exception 'Apex history evidence is immutable'; end if;
 if new.entity is distinct from old.entity or new.started_at is distinct from old.started_at
  or new.context is distinct from old.context or new.history_start is distinct from old.history_start then
  raise exception 'Apex history reservation cannot change';
 end if;
 return new;
end $$;
create trigger apex_empty_history_immutable before update or delete on public.apex_empty_history_proof for each row execute function public.tg_apex_empty_history_immutable();

create function public.tg_apex_history_context(p_entity text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.apex_entity%rowtype; company jsonb; token text; base text;
begin
 select * into strict e from public.apex_entity where entity=p_entity;
 select payload into company from public.apex_raw where entity='company' order by fetched_at desc,id desc limit 1;
 if nullif(company->>'id','') is null or nullif(company->>'created_at','') is null then raise exception 'Apex company identity and creation evidence are required'; end if;
 if (company->>'created_at')::timestamptz>clock_timestamp() then raise exception 'Apex company creation is in the future'; end if;
 select nullif(btrim(value),'') into token from public.integration_secrets where name='APEX_API_KEY';
 if token is null then raise exception 'Apex API key is not configured'; end if;
 select rtrim(coalesce(nullif(btrim(value),''),'https://app.apextrading.com/api'),'/') into base from public.integration_secrets where name='APEX_API_BASE';
 base:=coalesce(base,'https://app.apextrading.com/api');
 if base not like 'https://%' then raise exception 'Apex requires HTTPS'; end if;
 return jsonb_build_object('api_base',base,'credential_sha256',encode(sha256(convert_to(token,'UTF8')),'hex'),
 'company_id',company->>'id','company_created_at',(company->>'created_at')::timestamptz,
 'policy',jsonb_build_object('entity',e.entity,'endpoint',e.endpoint,'api_version',e.api_version,'root_key',e.root_key,
 'scope_needed',e.scope_needed,'supports_delta',e.supports_delta,'supports_paging',e.supports_paging,'nesting',coalesce(e.nesting,'{}'::jsonb)));
end $$;

-- Administrative bootstrap only. Workers can read proven evidence, not manufacture it.
create function public.tg_apex_begin_empty_history(p_entity text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.apex_entity%rowtype; p public.apex_empty_history_proof%rowtype; ctx jsonb; req bigint; key_value text;
begin
 select * into strict e from public.apex_entity where entity=p_entity for update;
 if coalesce(e.endpoint,'') not in ('/receiving-orders','/transporter-orders') or e.root_key is distinct from 'orders' or e.api_version is distinct from 'v1'
  or e.scope_needed is distinct from (case when e.endpoint='/receiving-orders' then 'view:receiving-orders' else 'view:shipping-orders' end)
  or e.supports_delta is distinct from true or e.supports_paging is distinct from true or coalesce(e.nesting,'{}'::jsonb)<>'{}'::jsonb then
  raise exception 'Empty order bootstrap requires the reviewed order endpoint contract';
 end if;
 if exists(select 1 from public.apex_sync_verification where entity=p_entity and state='running') then raise exception 'An Apex sync is running'; end if;
 if exists(select 1 from public.apex_raw where entity=p_entity) then raise exception 'This repair is only for a zero-record mirror'; end if;
 select * into p from public.apex_empty_history_proof where entity=p_entity and state in ('budget_pending','probing');
 if found then return jsonb_build_object('id',p.id,'state',p.state); end if;
 ctx:=public.tg_apex_history_context(p_entity);
 insert into public.apex_empty_history_proof(entity,context,history_start)
 values(p_entity,ctx,(ctx->>'company_created_at')::timestamptz-make_interval(secs=>e.verification_overlap_seconds)) returning * into p;
 select value into key_value from public.integration_secrets where name='APEX_API_KEY';
 req:=net.http_get(url:=(ctx->>'api_base')||'/v1/usage',headers:=jsonb_build_object('Authorization','Bearer '||btrim(key_value),'Accept','application/json'),timeout_milliseconds:=20000);
 update public.apex_empty_history_proof set requests=jsonb_build_object('usage',jsonb_build_object('id',req,'path','/v1/usage','params','{}'::jsonb,'started_at',clock_timestamp())) where id=p.id;
 return jsonb_build_object('id',p.id,'state',p.state);
end $$;

create function public.tg_apex_progress_empty_history(p_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.apex_empty_history_proof%rowtype; e public.apex_entity%rowtype; ctx jsonb; request record; response record;
 ev jsonb:='{}'; body jsonb; data jsonb; reqs jsonb; params jsonb; path text; probe_label text; key_value text; request_id bigint; scope text;
begin
 select entity into probe_label from public.apex_empty_history_proof where id=p_id;
 select * into strict e from public.apex_entity where entity=probe_label for update;
 select * into strict p from public.apex_empty_history_proof where id=p_id for update;
 if p.state in ('proven_empty','refused') then return jsonb_build_object('id',p.id,'state',p.state,'error',p.error); end if;
 begin
  if clock_timestamp()>p.started_at+make_interval(secs=>e.verification_max_run_seconds) then raise exception 'History proof expired before completion'; end if;
  ctx:=public.tg_apex_history_context(e.entity);
  if ctx is distinct from p.context then raise exception 'Apex account, credential or endpoint contract changed'; end if;
  if exists(select 1 from public.apex_sync_verification where entity=e.entity and state='running') then raise exception 'An Apex sync is running'; end if;
  if exists(select 1 from public.apex_raw where entity=e.entity) then raise exception 'Source history is no longer an empty mirror'; end if;
  for request in select key,value from jsonb_each(p.requests) loop
   select * into response from net._http_response where id=(request.value->>'id')::bigint;
   if not found then return jsonb_build_object('id',p.id,'state',p.state,'waiting_for',request.key); end if;
   ev:=ev||jsonb_build_object(request.key,jsonb_build_object('request',request.value,'http_status',response.status_code,
    'received_at',response.created,'response_body',response.content,'response_sha256',encode(sha256(convert_to(coalesce(response.content,''),'UTF8')),'hex'),
    'error',response.error_msg,'timed_out',response.timed_out));
   if response.status_code is distinct from 200 or response.timed_out or response.error_msg is not null then raise exception 'Apex % request did not succeed',request.key; end if;
   perform response.content::jsonb;
  end loop;
  if p.state='budget_pending' then
   data:=(ev#>>'{usage,response_body}')::jsonb->'data';
   if jsonb_typeof(data->'credits_used') is distinct from 'number' or jsonb_typeof(data->'monthly_credit_limit') is distinct from 'number'
    or (data->>'credits_used')::numeric<0 or (data->>'monthly_credit_limit')::numeric<=0 then raise exception 'Current Apex credit allowance is unknown'; end if;
   -- Five one-record GETs, no nested collections: reserve more than their maximum cost.
   if (data->>'credits_used')::numeric+25 >= (data->>'monthly_credit_limit')::numeric*0.90 then raise exception 'Apex credit guard refused history reads'; end if;
   select value into key_value from public.integration_secrets where name='APEX_API_KEY';
   reqs:=p.requests;
   foreach probe_label in array array['company','welcome','default','not_cancelled','cancelled'] loop
    params:='{}';
    if probe_label in ('company','welcome') then path:='/v1/'||probe_label;
    else
     path:='/'||e.api_version||e.endpoint;
     params:=jsonb_build_object('page','1','per_page','1','updated_at_from',p.history_start::text);
     if probe_label<>'default' then params:=params||jsonb_build_object('cancelled',case when probe_label='cancelled' then 'true' else 'false' end); end if;
    end if;
    request_id:=net.http_get(url:=(ctx->>'api_base')||path,params:=params,
     headers:=jsonb_build_object('Authorization','Bearer '||btrim(key_value),'Accept','application/json'),timeout_milliseconds:=20000);
    reqs:=reqs||jsonb_build_object(probe_label,jsonb_build_object('id',request_id,'path',path,'params',params,'started_at',clock_timestamp()));
   end loop;
   update public.apex_empty_history_proof set state='probing',requests=reqs,evidence=ev where id=p.id;
   return jsonb_build_object('id',p.id,'state','probing');
  end if;
  if (select count(*) from jsonb_object_keys(ev))<>6 then raise exception 'History proof has missing response legs'; end if;
  body:=(ev#>>'{company,response_body}')::jsonb->'company';
  if body->>'id' is distinct from ctx->>'company_id'
   or (body->>'created_at')::timestamptz is distinct from (ctx->>'company_created_at')::timestamptz
   or p.history_start>(body->>'created_at')::timestamptz then raise exception 'Source company does not match the history interval'; end if;
  scope:=e.scope_needed;
  body:=(ev#>>'{welcome,response_body}')::jsonb;
  if scope is null or jsonb_typeof(body->'access') is distinct from 'array' or not (body->'access' ? scope) or not (body->'access' ? 'view:company') then raise exception 'Source did not confirm required Apex abilities'; end if;
  foreach probe_label in array array['default','not_cancelled','cancelled'] loop
   body:=(ev#>>array[probe_label,'response_body'])::jsonb;
   params:=p.requests#>array[probe_label,'params'];
   if jsonb_typeof(body->'orders') is distinct from 'array' or body->'orders'<>'[]'::jsonb
    or body#>'{meta,total}' is distinct from '0'::jsonb or body#>'{meta,current_page}' is distinct from '1'::jsonb
    or body#>'{meta,last_page}' is distinct from '1'::jsonb or body#>'{meta,per_page}' is distinct from '1'::jsonb
    or body#>'{links,next}' is distinct from 'null'::jsonb or body#>'{links,prev}' is distinct from 'null'::jsonb
    or body#>>'{meta,path}' is distinct from (ctx->>'api_base')||'/'||e.api_version||e.endpoint then
    raise exception 'Apex % response is not an explicit complete empty population',probe_label;
   end if;
   if params->>'page' is distinct from '1' or params->>'per_page' is distinct from '1' or (params->>'updated_at_from')::timestamptz is distinct from p.history_start
    or params-array['page','per_page','updated_at_from','cancelled']<>'{}'::jsonb
    or (probe_label='default' and params ? 'cancelled')
    or (probe_label='cancelled' and params->>'cancelled' is distinct from 'true')
    or (probe_label='not_cancelled' and params->>'cancelled' is distinct from 'false') then raise exception 'Unexpected source history filter'; end if;
  end loop;
  update public.apex_empty_history_proof set state='proven_empty',finished_at=clock_timestamp(),evidence=ev where id=p.id;
  return jsonb_build_object('id',p.id,'state','proven_empty','scope','API order history: default, cancelled and not-cancelled; independent business population not certified');
 exception when others then
  update public.apex_empty_history_proof set state='refused',finished_at=clock_timestamp(),evidence=p.evidence||ev,error=sqlerrm where id=p.id;
  return jsonb_build_object('id',p.id,'state','refused','error',sqlerrm);
 end;
end $$;

revoke all on function public.tg_apex_empty_history_immutable(),public.tg_apex_history_context(text),public.tg_apex_begin_empty_history(text),public.tg_apex_progress_empty_history(uuid) from public,anon,authenticated,service_role;
grant execute on function public.tg_apex_history_context(text) to service_role;

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
  if e.supports_delta and exists(select 1 from public.apex_empty_history_proof where entity=p_entity and state='proven_empty') then
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



-- Technical endpoint controls; no business figures or vendor mutations.
do $$ begin
 if not exists(select 1 from public.apex_entity where entity='receiving-orders' and endpoint='/receiving-orders' and root_key='orders' and api_version='v1' and min_interval_minutes=720 and required)
 or not exists(select 1 from public.apex_entity where entity='transporter-orders' and endpoint='/transporter-orders' and root_key='orders' and api_version='v1' and min_interval_minutes=240 and not required and scope_needed='view:transporter-orders') then
  raise exception 'Apex endpoint policy changed since recovery capture';
 end if;
 update public.apex_entity set min_interval_minutes=10 where entity='receiving-orders';
 update public.apex_entity set min_interval_minutes=10,required=true,scope_needed='view:shipping-orders',
  why=why||' | GPT 11 Sep 2026 correction: official transporter-order documentation requires view:shipping-orders, confirmed by the current welcome response. Enabled for the owner-requested complete-data ten-minute cadence. Empty history still requires preserved API evidence.'
 where entity='transporter-orders';
end $$;
