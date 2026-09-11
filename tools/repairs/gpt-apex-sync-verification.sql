-- GPT: preserve each decoded API response, verify every stored record, and commit
-- the successful run and cursor together. API verification is not an independent
-- source population certificate. Apply through the migration runner transaction.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.apex_entity add column if not exists verification_max_run_seconds integer not null default 900
  check (verification_max_run_seconds between 60 and 3600);
alter table public.apex_entity add column if not exists verification_overlap_seconds integer not null default 60
  check (verification_overlap_seconds between 1 and 3600);

create table if not exists public.apex_sync_verification (
  run_id uuid not null,
  entity text not null references public.apex_entity(entity),
  started_at timestamptz not null default clock_timestamp(),
  lease_until timestamptz not null,
  finished_at timestamptz,
  state text not null default 'running' check (state in ('running','api_verified','incomplete','error')),
  policy jsonb not null,
  cursor_before timestamptz,
  request_from timestamptz,
  cursor_after timestamptz,
  page_size integer not null check (page_size between 1 and 200),
  page_count integer not null default 0,
  records_seen integer not null default 0,
  records_written integer not null default 0,
  source_total integer,
  terminal_page boolean not null default false,
  manifest_sha256 text,
  legacy_run_id bigint references public.apex_sync_run(id),
  error text,
  primary key (run_id,entity),
  check ((state='running') = (finished_at is null)),
  check (page_count>=0 and records_seen>=0 and records_written>=0),
  check (state<>'api_verified' or (error is null and terminal_page and manifest_sha256 is not null))
);
create unique index if not exists apex_sync_verification_one_running on public.apex_sync_verification(entity) where state='running';
create index if not exists apex_sync_verification_entity_time on public.apex_sync_verification(entity,started_at desc);

create table if not exists public.apex_sync_page_receipt (
  run_id uuid not null,
  entity text not null,
  page_no integer not null check (page_no>0),
  request_params jsonb not null,
  response_body text not null,
  response_sha256 text not null check (response_sha256 ~ '^[a-f0-9]{64}$'),
  received_at timestamptz not null default clock_timestamp(),
  record_count integer not null check (record_count>=0),
  terminal_page boolean not null,
  primary key (run_id,entity,page_no),
  foreign key (run_id,entity) references public.apex_sync_verification(run_id,entity)
);
create table if not exists public.apex_record_verification (
  run_id uuid not null,
  entity text not null,
  page_no integer not null,
  ordinal integer not null check (ordinal>0),
  source_id text not null,
  raw_id bigint not null references public.apex_raw(id),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz not null default clock_timestamp(),
  primary key (run_id,entity,source_id),
  unique (run_id,entity,page_no,ordinal),
  foreign key (run_id,entity,page_no) references public.apex_sync_page_receipt(run_id,entity,page_no)
);
create index if not exists apex_record_verification_raw on public.apex_record_verification(raw_id);

alter table public.apex_sync_verification enable row level security;
alter table public.apex_sync_page_receipt enable row level security;
alter table public.apex_record_verification enable row level security;
revoke all on public.apex_sync_verification,public.apex_sync_page_receipt,public.apex_record_verification from public,anon,authenticated,service_role;
grant select,insert,update on public.apex_sync_verification to service_role;
grant select,insert on public.apex_sync_page_receipt,public.apex_record_verification to service_role;

create or replace function public.tg_apex_evidence_immutable() returns trigger
language plpgsql set search_path='' as $fn$
begin
  if tg_table_name<>'apex_sync_verification' or tg_op='DELETE' then
    raise exception 'Apex verification evidence is immutable';
  end if;
  if old.state<>'running' then
    raise exception 'Apex verification evidence is immutable';
  end if;
  return new;
end
$fn$;
drop trigger if exists apex_verification_immutable on public.apex_sync_verification;
create trigger apex_verification_immutable before update or delete on public.apex_sync_verification
for each row execute function public.tg_apex_evidence_immutable();
drop trigger if exists apex_page_immutable on public.apex_sync_page_receipt;
create trigger apex_page_immutable before update or delete on public.apex_sync_page_receipt
for each row execute function public.tg_apex_evidence_immutable();
drop trigger if exists apex_record_evidence_immutable on public.apex_record_verification;
create trigger apex_record_evidence_immutable before update or delete on public.apex_record_verification
for each row execute function public.tg_apex_evidence_immutable();

create or replace function public.tg_apex_verification_begin(p_run uuid,p_entity text,p_seed timestamptz,p_page_size integer)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare e public.apex_entity%rowtype; v public.apex_sync_verification%rowtype; prior_run record; c timestamptz;
begin
  select * into strict e from public.apex_entity where entity=p_entity for update;
  select * into v from public.apex_sync_verification where run_id=p_run and entity=p_entity;
  if found then
    if v.state<>'running' or v.page_size<>p_page_size then raise exception 'Run identity already used'; end if;
    return to_jsonb(v);
  end if;
  for prior_run in select run_id from public.apex_sync_verification where entity=p_entity and state='running' loop
    if exists(select 1 from public.apex_sync_verification where run_id=prior_run.run_id and entity=p_entity and lease_until>clock_timestamp()) then
      raise exception 'Another Apex verification run is still active for %',p_entity;
    end if;
    perform public.tg_apex_verification_finish(prior_run.run_id,p_entity,false,'Verification lease expired before completion',null);
  end loop;
  select updated_at_from into c from public.apex_watermark where entity=p_entity;
  insert into public.apex_sync_verification(run_id,entity,lease_until,policy,cursor_before,request_from,page_size)
    values(p_run,p_entity,clock_timestamp()+make_interval(secs=>e.verification_max_run_seconds),to_jsonb(e),c,
      case when e.supports_delta then case when c is null then p_seed else c-make_interval(secs=>e.verification_overlap_seconds) end end,p_page_size) returning * into v;
  if e.supports_delta and v.request_from is null then raise exception 'Delta source requires a recorded starting cursor'; end if;
  return to_jsonb(v);
end
$fn$;

create or replace function public.tg_apex_verification_page(p_run uuid,p_entity text,p_page integer,p_params jsonb,p_body text,p_sha256 text)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare v public.apex_sync_verification%rowtype; prior_page public.apex_sync_page_receipt%rowtype;
  body jsonb; chunk jsonb; rows_json jsonb; rec record; raw_row public.apex_raw%rowtype;
  total_n integer; last_page_n integer; prior_last_page_n integer; current_page_n integer; row_n integer; written_n integer:=0;
  next_link boolean; terminal boolean; parsed_value text; expected_params jsonb; raw_key bigint;
begin
  select * into strict v from public.apex_sync_verification where run_id=p_run and entity=p_entity for update;
  if v.state<>'running' or v.lease_until<=clock_timestamp() then raise exception 'Verification run is closed or expired'; end if;
  if encode(sha256(convert_to(p_body,'UTF8')),'hex') is distinct from p_sha256 then raise exception 'Source response hash mismatch'; end if;
  select * into prior_page from public.apex_sync_page_receipt where run_id=p_run and entity=p_entity and page_no=p_page;
  if found then
    if prior_page.response_body is distinct from p_body or prior_page.request_params is distinct from p_params then raise exception 'Replayed page changed'; end if;
    return jsonb_build_object('page',p_page,'records',prior_page.record_count,'has_more',not prior_page.terminal_page,'replayed',true);
  end if;
  if p_page<>v.page_count+1 or v.terminal_page then raise exception 'Page sequence is incomplete or already terminal'; end if;
  expected_params:=coalesce(v.policy->'nesting','{}'::jsonb);
  if expected_params='null'::jsonb then expected_params:='{}'::jsonb; end if;
  if (v.policy->>'supports_paging')::boolean then expected_params:=expected_params||jsonb_build_object('per_page',v.page_size::text,'page',p_page::text); end if;
  if (v.policy->>'supports_delta')::boolean then
    if (p_params->>'updated_at_from')::timestamptz is distinct from v.request_from then raise exception 'Page uses the wrong source interval'; end if;
    expected_params:=expected_params||jsonb_build_object('updated_at_from',p_params->>'updated_at_from');
  end if;
  if p_params is distinct from expected_params then raise exception 'Page parameters differ from the captured source policy'; end if;
  body:=p_body::jsonb;
  chunk:=body->coalesce(v.policy->>'root_key','data');
  if jsonb_typeof(chunk)='array' then rows_json:=chunk;
  elsif jsonb_typeof(chunk)='object' and not (v.policy->>'supports_paging')::boolean then rows_json:=jsonb_build_array(chunk);
  else raise exception 'Missing or invalid Apex record collection'; end if;
  row_n:=jsonb_array_length(rows_json);
  if (v.policy->>'supports_paging')::boolean and row_n>v.page_size then raise exception 'Source page exceeds requested size'; end if;
  for rec in select value,ordinality from jsonb_array_elements(rows_json) with ordinality loop
    if jsonb_typeof(rec.value)<>'object' or coalesce(jsonb_typeof(rec.value->'id'),'null') not in ('string','number') or btrim(rec.value->>'id')='' then raise exception 'Source row has no valid identity'; end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(rows_json))<>row_n then raise exception 'Source page repeats an identity'; end if;
  if exists(select 1 from jsonb_array_elements(rows_json) x join public.apex_record_verification r on r.run_id=p_run and r.entity=p_entity and r.source_id=x.value->>'id') then raise exception 'Pagination repeated a previously received identity'; end if;

  foreach parsed_value in array array[body#>>'{meta,total}',body#>>'{meta,last_page}',body#>>'{meta,current_page}']
  loop
    if parsed_value is not null and parsed_value!~'^[0-9]+$' then raise exception 'Malformed pagination metadata'; end if;
  end loop;
  total_n:=(body#>>'{meta,total}')::integer;
  last_page_n:=(body#>>'{meta,last_page}')::integer;
  current_page_n:=(body#>>'{meta,current_page}')::integer;
  select (response_body::jsonb#>>'{meta,last_page}')::integer into prior_last_page_n
    from public.apex_sync_page_receipt
    where run_id=p_run and entity=p_entity and response_body::jsonb#>>'{meta,last_page}' is not null
    order by page_no limit 1;
  if prior_last_page_n is not null and last_page_n is distinct from prior_last_page_n then raise exception 'Source last page changed while paging'; end if;
  if current_page_n is not null and current_page_n<>p_page then raise exception 'Source returned the wrong page'; end if;
  if last_page_n is not null and (last_page_n<1 or last_page_n<p_page) then raise exception 'Invalid source last page'; end if;
  if v.source_total is not null and total_n is distinct from v.source_total then raise exception 'Source population changed while paging'; end if;
  if total_n is not null and v.records_seen+row_n>total_n then raise exception 'Source returned more than its declared population'; end if;
  next_link:=nullif(body#>>'{links,next}','') is not null;
  terminal:=case
    when not (v.policy->>'supports_paging')::boolean then true
    when last_page_n is not null then p_page=last_page_n
    when next_link then false
    when total_n is not null then v.records_seen+row_n=total_n
    else row_n<v.page_size end;
  if terminal and next_link then raise exception 'Source pagination contradicts its terminal page'; end if;
  if terminal and total_n is not null and v.records_seen+row_n<>total_n then raise exception 'Terminal page leaves source records missing'; end if;
  if not terminal and row_n=0 then raise exception 'Empty page with a remaining source population'; end if;

  insert into public.apex_sync_page_receipt(run_id,entity,page_no,request_params,response_body,response_sha256,record_count,terminal_page)
    values(p_run,p_entity,p_page,p_params,p_body,p_sha256,row_n,terminal);
  for rec in select value,ordinality from jsonb_array_elements(rows_json) with ordinality loop
    raw_key:=null;
    insert into public.apex_raw(entity,apex_id,payload,run_id) values(p_entity,rec.value->>'id',rec.value,p_run)
      on conflict(entity,apex_id,payload_hash) do nothing returning id into raw_key;
    if raw_key is not null then written_n:=written_n+1; end if;
    select * into strict raw_row from public.apex_raw
      where entity=p_entity and apex_id=rec.value->>'id' and payload_hash=md5(rec.value::text);
    if raw_row.payload is distinct from rec.value then raise exception 'Stored Apex payload differs from source'; end if;
    insert into public.apex_record_verification(run_id,entity,page_no,ordinal,source_id,raw_id,source_sha256)
      values(p_run,p_entity,p_page,rec.ordinality,rec.value->>'id',raw_row.id,encode(sha256(convert_to(rec.value::text,'UTF8')),'hex'));
  end loop;
  update public.apex_sync_verification set page_count=p_page,records_seen=records_seen+row_n,
    records_written=records_written+written_n,source_total=coalesce(source_total,total_n),terminal_page=terminal
    where run_id=p_run and entity=p_entity;
  return jsonb_build_object('page',p_page,'records',row_n,'written',written_n,'has_more',not terminal,'replayed',false);
end
$fn$;

create or replace function public.tg_apex_verification_finish(p_run uuid,p_entity text,p_complete boolean,p_error text,p_http_status integer)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare v public.apex_sync_verification%rowtype; e public.apex_entity%rowtype;
  c timestamptz; n integer; bad integer; root_hash text; why text:=nullif(p_error,''); result_state text;
  after_cursor timestamptz; finished timestamptz:=clock_timestamp(); legacy bigint;
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
  if e.supports_delta and n=0 and not exists(select 1 from public.apex_raw where entity=p_entity) then
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
    manifest_sha256=root_hash,error=why,legacy_run_id=legacy where run_id=p_run and entity=p_entity returning * into v;
  return to_jsonb(v)||jsonb_build_object('ok',why is null);
end
$fn$;

revoke all on function public.tg_apex_evidence_immutable() from public,anon,authenticated;
revoke all on function public.tg_apex_verification_begin(uuid,text,timestamptz,integer) from public,anon,authenticated;
revoke all on function public.tg_apex_verification_page(uuid,text,integer,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.tg_apex_verification_finish(uuid,text,boolean,text,integer) from public,anon,authenticated;
grant execute on function public.tg_apex_verification_begin(uuid,text,timestamptz,integer) to service_role;
grant execute on function public.tg_apex_verification_page(uuid,text,integer,jsonb,text,text) to service_role;
grant execute on function public.tg_apex_verification_finish(uuid,text,boolean,text,integer) to service_role;
