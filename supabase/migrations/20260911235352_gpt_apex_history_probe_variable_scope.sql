set local lock_timeout='5s';
set local statement_timeout='60s';
create or replace function public.tg_apex_progress_empty_history(p_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
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
