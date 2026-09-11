-- GPT: stage exact Metrc responses, then promote a complete feed atomically.
-- API delivery/storage evidence only; this is not a population certificate.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.metrc_sync_verification (
  run_id bigint primary key references public.metrc_sync_runs(id),
  endpoint text not null, license text not null,
  window_start timestamptz not null, window_end timestamptz not null,
  advance_cursor boolean not null, page_size integer not null check(page_size between 1 and 20),
  started_at timestamptz not null default clock_timestamp(), lease_until timestamptz not null,
  state text not null default 'running' check(state in ('running','api_verified','incomplete','error')),
  finished_at timestamptz, records_verified integer not null default 0,
  receipt jsonb, error text,
  check((state='running')=(finished_at is null))
);
create unique index metrc_sync_verification_feed_lease on public.metrc_sync_verification(license,endpoint) where state='running';
create table public.metrc_sync_page_receipt (
  run_id bigint not null references public.metrc_sync_verification(run_id),
  source_state text not null, page_number integer not null check(page_number>0),
  path text not null, request_params jsonb not null,
  received_at timestamptz not null default clock_timestamp(),
  response_text text not null, response_sha256 text not null,
  records_count integer not null check(records_count>=0), terminal boolean not null,
  source_total integer, source_pages integer,
  primary key(run_id,source_state,page_number)
);
create table public.metrc_record_verification (
  run_id bigint not null, source_state text not null, page_number integer not null,
  ordinal integer not null, source_id text not null, mirror_key jsonb not null,
  source_raw jsonb not null, source_sha256 text not null, mapped_fields jsonb not null,
  mirror_before jsonb, mirror_after jsonb not null,
  verified_at timestamptz not null default clock_timestamp(),
  primary key(run_id,mirror_key),
  foreign key(run_id,source_state,page_number) references public.metrc_sync_page_receipt(run_id,source_state,page_number)
);
create index metrc_record_verification_source on public.metrc_record_verification(source_id,verified_at desc);

create function public.tg_metrc_verification_immutable() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_table_name='metrc_sync_verification' and tg_op='UPDATE' then
   if old.state='running'
     and (to_jsonb(new)-array['state','finished_at','records_verified','receipt','error'])
       = (to_jsonb(old)-array['state','finished_at','records_verified','receipt','error'])
     and new.state<>'running' then return new; end if;
  end if;
  raise exception 'Metrc source evidence is immutable';
end $$;
create trigger metrc_verification_immutable before update or delete on public.metrc_sync_verification
  for each row execute function public.tg_metrc_verification_immutable();
create trigger metrc_page_immutable before update or delete on public.metrc_sync_page_receipt
  for each row execute function public.tg_metrc_verification_immutable();
create trigger metrc_record_immutable before update or delete on public.metrc_record_verification
  for each row execute function public.tg_metrc_verification_immutable();

-- Fixed API/mirror protocol, not business policy. No caller-supplied SQL identifiers.
create function public.tg_metrc_feed_contract(p_endpoint text) returns jsonb
language sql immutable security invoker set search_path='' as $$
 select case p_endpoint
 when 'packages' then '{"table":"metrc_packages","keys":["license","tag"],"states":["active","onhold","inactive","intransit"]}'::jsonb
 when 'plants' then '{"table":"metrc_plants","keys":["license","tag"],"states":["vegetative","flowering","onhold","inactive"]}'::jsonb
 when 'harvests' then '{"table":"metrc_harvests","keys":["license","metrc_id"],"states":["active","onhold","inactive"]}'::jsonb
 when 'plantbatches' then '{"table":"metrc_plant_batches","keys":["license","name"],"states":["active","inactive"]}'::jsonb
 when 'transfers' then '{"table":"metrc_transfers","keys":["license","manifest_number","direction"],"states":["incoming","outgoing","rejected"]}'::jsonb end
$$;
create function public.tg_metrc_source_date(v jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$
 select case when jsonb_typeof(v)='string' and v#>>'{}'<>'' then to_jsonb(left(v#>>'{}',10)) else 'null'::jsonb end
$$;
create function public.tg_metrc_project_record(e text,l text,s text,r jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare pairs jsonb; result jsonb;
begin
 if jsonb_typeof(r)<>'object' or jsonb_typeof(r->'Id') is distinct from 'number'
    or (r->>'Id') !~ '^[1-9][0-9]*$' then raise exception 'Missing or invalid Metrc source identity'; end if;
 -- Arrays retain SQL NULL separately, so absent optional fields are omitted while explicit null survives.
 case e
 when 'packages' then
  select jsonb_object_agg(k,v) into pairs from (values
   ('tag',r->'Label'),('item_name',coalesce(nullif(r#>'{Item,Name}','null'::jsonb),r->'ProductName')),
   ('quantity',r->'Quantity'),('uom',coalesce(nullif(r->'UnitOfMeasureAbbreviation','null'::jsonb),r->'UnitOfMeasureName')),
   ('location',r->'LocationName'),('packaged_on',public.tg_metrc_source_date(r->'PackagedDate')),
   ('lab_testing_state',r->'LabTestingState'),('finished',coalesce(nullif(r->'IsFinished','null'::jsonb),'false'::jsonb)),('source_state',to_jsonb(s))) a(k,v) where v is not null;
 when 'plants' then
  select jsonb_object_agg(k,v) into pairs from (values
   ('tag',r->'Label'),('strain',r->'StrainName'),('phase',coalesce(nullif(r->'GrowthPhase','null'::jsonb),to_jsonb(s))),
   ('room',r->'LocationName'),('planted_on',public.tg_metrc_source_date(r->'PlantedDate')),('source_state',to_jsonb(s))) a(k,v) where v is not null;
 when 'harvests' then
  select jsonb_object_agg(k,v) into pairs from (values
   ('metrc_id',r->'Id'),('name',r->'Name'),('harvest_start',public.tg_metrc_source_date(r->'HarvestStartDate')),
   ('wet_weight',coalesce(nullif(r->'TotalWetWeight','null'::jsonb),r->'CurrentWeight')),('waste_weight',r->'TotalWasteWeight'),
   ('package_count',r->'PackageCount'),('source_state',to_jsonb(s))) a(k,v) where v is not null;
 when 'plantbatches' then
  select jsonb_object_agg(k,v) into pairs from (values
   ('name',r->'Name'),('strain',r->'StrainName'),('count',coalesce(nullif(r->'UntrackedCount','null'::jsonb),r->'Count')),
   ('batch_type',r->'Type'),('planted_on',public.tg_metrc_source_date(r->'PlantedDate')),('source_state',to_jsonb(s))) a(k,v) where v is not null;
 when 'transfers' then
  select jsonb_object_agg(k,v) into pairs from (values
   ('manifest_number',coalesce(nullif(r->'ManifestNumber','null'::jsonb),to_jsonb(r->>'Id'))),('direction',to_jsonb(s)),
   ('shipper',r->'ShipperFacilityName'),('recipient',coalesce(nullif(r->'RecipientFacilityName','null'::jsonb),r->'DeliveryFacilities')),
   ('created_on',public.tg_metrc_source_date(r->'CreatedDateTime'))) a(k,v) where v is not null;
 else raise exception 'Unsupported Metrc verification feed'; end case;
 result:=jsonb_build_object('license',l)||pairs;
 if exists(select 1 from jsonb_array_elements_text(public.tg_metrc_feed_contract(e)->'keys') k
           where not result ? k or result->k='null'::jsonb or btrim(result->>k)='') then
   raise exception 'Missing Metrc mirror identity'; end if;
 return result;
end $$;

create function public.tg_metrc_begin_verification(p_run_id bigint,p_endpoint text,p_license text,
 p_window_start timestamptz,p_window_end timestamptz,p_page_size integer,p_advance_cursor boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.metrc_sync_runs; h public.metrc_sync_verification; deadline numeric;
begin
 if public.tg_metrc_feed_contract(p_endpoint) is null or p_license is null or btrim(p_license)=''
    or p_window_start is null or p_window_end is null or not isfinite(p_window_start) or not isfinite(p_window_end)
    or p_window_start>p_window_end or p_page_size is null or p_page_size not between 1 and 20
    or p_advance_cursor is null then raise exception 'Invalid Metrc verification contract'; end if;
 perform pg_advisory_xact_lock(hashtextextended('metrc-verification:'||p_license||':'||p_endpoint,0));
 select * into strict r from public.metrc_sync_runs where id=p_run_id for update;
 if r.license is distinct from p_license or r.endpoint not in (p_endpoint||' (delta)',p_endpoint||' (full sweep)')
    or r.endpoint is null or r.status is distinct from 'running' or r.finished_at is not null
    or r.error is not null or r.started_at is null or p_window_end>r.started_at
    or r.started_at>clock_timestamp() then raise exception 'Run is not eligible for source verification'; end if;
 select * into h from public.metrc_sync_verification where license=p_license and endpoint=p_endpoint and state='running' for update;
 if found then
  if h.lease_until>clock_timestamp() then raise exception 'Metrc feed verification already in progress'; end if;
  update public.metrc_sync_verification set state='incomplete',finished_at=clock_timestamp(),error='Worker lease expired; staged pages were not promoted' where run_id=h.run_id;
  update public.metrc_sync_runs set status='partial',finished_at=clock_timestamp(),error='Verification lease expired; no source verification commit' where id=h.run_id and status='running';
 end if;
 select case when jsonb_typeof(value)='object' then coalesce(value->>'ms',value->>'value')::numeric else null end into deadline
 from public.configurations where key='metrc_sync_soft_deadline_ms';
 -- Worker deadline plus bounded transport drain, independent of business freshness policies.
 deadline:=greatest(110000,least(coalesce(deadline,110000),3600000));
 insert into public.metrc_sync_verification(run_id,endpoint,license,window_start,window_end,page_size,advance_cursor,lease_until)
 values(p_run_id,p_endpoint,p_license,p_window_start,p_window_end,p_page_size,p_advance_cursor,clock_timestamp()+make_interval(secs=>(deadline/1000+60)::double precision)) returning * into h;
 return to_jsonb(h)-'receipt';
end $$;

create function public.tg_metrc_stage_page(p_run_id bigint,p_state text,p_page integer,p_path text,p_params jsonb,p_response text,p_sha256 text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare h public.metrc_sync_verification; previous public.metrc_sync_page_receipt;
 b jsonb; rows jsonb; n integer; total integer; pages integer; terminal boolean; field text; val integer; required jsonb;
begin
 select * into strict h from public.metrc_sync_verification where run_id=p_run_id for update;
 if h.state<>'running' or h.lease_until<=clock_timestamp() then raise exception 'Metrc verification lease is not active'; end if;
 if p_response is null or encode(sha256(convert_to(p_response,'UTF8')),'hex') is distinct from p_sha256 then raise exception 'Metrc response checksum mismatch'; end if;
 required:=jsonb_build_object('licenseNumber',h.license,'pageNumber',p_page,'pageSize',h.page_size,
   'lastModifiedStart',h.window_start,'lastModifiedEnd',h.window_end);
 if p_page is null or p_page<1 or not (public.tg_metrc_feed_contract(h.endpoint)->'states') ? p_state
    or p_path is distinct from '/'||h.endpoint||'/v2/'||p_state
    or p_params->>'licenseNumber' is distinct from h.license
    or (p_params->>'pageNumber')::integer is distinct from p_page or (p_params->>'pageSize')::integer is distinct from h.page_size
    or (p_params->>'lastModifiedStart')::timestamptz is distinct from h.window_start
    or (p_params->>'lastModifiedEnd')::timestamptz is distinct from h.window_end
    or (select count(*) from jsonb_object_keys(p_params))<>5 then raise exception 'Metrc page request differs from declared coverage'; end if;
 select * into previous from public.metrc_sync_page_receipt where run_id=p_run_id and source_state=p_state and page_number=p_page;
 if found then
  if previous.response_sha256<>p_sha256 or previous.request_params<>p_params or previous.path<>p_path then raise exception 'Metrc page replay changed'; end if;
  return jsonb_build_object('records',previous.records_count,'terminal',previous.terminal);
 end if;
 if p_page<>1+coalesce((select max(page_number) from public.metrc_sync_page_receipt where run_id=p_run_id and source_state=p_state),0)
    or exists(select 1 from public.metrc_sync_page_receipt where run_id=p_run_id and source_state=p_state and metrc_sync_page_receipt.terminal) then raise exception 'Missing page or page after terminator'; end if;
 b:=p_response::jsonb;
 if jsonb_typeof(b)='array' then rows:=b;
 elsif jsonb_typeof(b)='object' and jsonb_typeof(b->'Data')='array' then rows:=b->'Data';
 else raise exception 'Metrc response lacks a record array'; end if;
 n:=jsonb_array_length(rows);
 if n>h.page_size then raise exception 'Metrc page exceeds requested size'; end if;
 if jsonb_typeof(b)='object' then
  foreach field in array array['Total','TotalRecords','Page','CurrentPage','PageSize','RecordsOnPage','TotalPages'] loop
   if b ? field then
    if jsonb_typeof(b->field)<>'number' or (b->>field)!~'^[0-9]+$' then raise exception 'Invalid pagination metadata: %',field; end if;
    val:=(b->>field)::integer;
    if field in ('Total','TotalRecords') then
      if total is not null and total<>val then raise exception 'Conflicting source totals'; end if; total:=val;
    elsif field='TotalPages' then pages:=val;
    elsif (field in ('Page','CurrentPage') and val<>p_page) or (field='PageSize' and val<>h.page_size)
       or (field='RecordsOnPage' and val<>n) then raise exception 'Pagination metadata mismatch: %',field; end if;
   end if;
  end loop;
 end if;
 if exists(select 1 from public.metrc_sync_page_receipt where run_id=p_run_id and source_state=p_state
   and (source_total is distinct from total or source_pages is distinct from pages)) then raise exception 'Source pagination changed during pull'; end if;
 terminal:=n<h.page_size or (pages is not null and p_page>=pages);
 if pages is not null and (p_page>greatest(pages,1) or (p_page<pages and n<h.page_size)) then raise exception 'Premature or excess source page'; end if;
 if total is not null and ((terminal and coalesce((select sum(records_count) from public.metrc_sync_page_receipt where run_id=p_run_id and source_state=p_state),0)+n<>total)
   or (pages is not null and pages not in (greatest(1,ceil(total::numeric/h.page_size)::integer),ceil(total::numeric/h.page_size)::integer))) then raise exception 'Source total does not reconcile'; end if;
 perform public.tg_metrc_project_record(h.endpoint,h.license,p_state,value) from jsonb_array_elements(rows);
 insert into public.metrc_sync_page_receipt(run_id,source_state,page_number,path,request_params,response_text,response_sha256,records_count,terminal,source_total,source_pages)
 values(p_run_id,p_state,p_page,p_path,p_params,p_response,p_sha256,n,terminal,total,pages);
 return jsonb_build_object('records',n,'terminal',terminal);
end $$;

create function public.tg_metrc_finish_verification(p_run_id bigint,p_complete boolean,p_error text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare h public.metrc_sync_verification; spec jsonb; keys text[]; row record; raw jsonb; mapped jsonb; key jsonb;
 before_row jsonb; after_row jsonb; input jsonb; cols text; updates text; predicate text; col text; n integer:=0;
 cursor_receipt jsonb; result jsonb; manifest text; r public.metrc_sync_runs;
begin
 select * into strict h from public.metrc_sync_verification where run_id=p_run_id for update;
 if h.state<>'running' then
  if h.state='api_verified' and p_complete then return h.receipt; end if;
  if h.state in ('incomplete','error') and not p_complete then return h.receipt; end if;
  raise exception 'Metrc verification already closed with a different outcome';
 end if;
 select * into strict r from public.metrc_sync_runs where id=p_run_id for update;
 if not p_complete then
  result:=jsonb_build_object('kind','metrc_record_commit_v1','run_id',p_run_id,'state','incomplete','records',0);
  update public.metrc_sync_verification set state='incomplete',finished_at=clock_timestamp(),error=left(p_error,480),receipt=result where run_id=p_run_id;
  update public.metrc_sync_runs set status='partial',records=0,finished_at=clock_timestamp(),error=left(p_error,480),note='Staged source pages retained; no mirror promotion or cursor advancement' where id=p_run_id and status='running';
  return result;
 end if;
 if p_complete is null or p_error is not null or h.lease_until<=clock_timestamp() or r.status is distinct from 'running' or r.finished_at is not null then raise exception 'Metrc run cannot be verified'; end if;
 spec:=public.tg_metrc_feed_contract(h.endpoint);
 if exists(select 1 from jsonb_array_elements_text(spec->'states') s where not exists(
   select 1 from public.metrc_sync_page_receipt p where p.run_id=p_run_id and p.source_state=s and p.terminal)) then raise exception 'Metrc lifecycle coverage is incomplete'; end if;
 select array_agg(value) into keys from jsonb_array_elements_text(spec->'keys');
 select string_agg(format('t.%I = (jsonb_populate_record(null::public.%I,$1)).%I',k,spec->>'table',k),' and ') into predicate from unnest(keys) k;
 for row in
  select p.source_state,p.page_number,v.value,v.ordinality from public.metrc_sync_page_receipt p
  cross join lateral jsonb_array_elements(case when jsonb_typeof(p.response_text::jsonb)='array' then p.response_text::jsonb else p.response_text::jsonb->'Data' end) with ordinality v
  where p.run_id=p_run_id order by p.source_state,p.page_number,v.ordinality
 loop
  raw:=row.value; mapped:=public.tg_metrc_project_record(h.endpoint,h.license,row.source_state,raw);
  select jsonb_object_agg(k,mapped->k) into key from unnest(keys) k;
  execute format('select to_jsonb(t) from public.%I t where %s for update',spec->>'table',predicate) into before_row using key;
  if before_row is not null and before_row->'raw' is distinct from raw then
   if (before_row->>'synced_at')::timestamptz>h.started_at then raise exception 'Mirror changed after verification began; retry from current source'; end if;
   if jsonb_typeof(before_row#>'{raw,LastModified}')='string' and jsonb_typeof(raw->'LastModified')='string'
      and (before_row#>>'{raw,LastModified}')::timestamptz>(raw->>'LastModified')::timestamptz then raise exception 'Source response would overwrite newer mirror data'; end if;
  end if;
  input:=mapped||jsonb_build_object('raw',raw,'synced_at',clock_timestamp());
  -- Type conversion must not round quantities or coerce a malformed field silently.
  execute format('select to_jsonb(jsonb_populate_record(null::public.%I,$1))',spec->>'table') into after_row using input;
  for col in select jsonb_object_keys(mapped) loop
   if after_row->col is distinct from mapped->col then raise exception 'Metrc mapping loses information in column %',col; end if;
  end loop;
  select string_agg(format('%I',k),',' order by k),string_agg(format('%I=excluded.%I',k,k),',' order by k) filter(where not k=any(keys))
    into cols,updates from jsonb_object_keys(input) k;
  execute format('insert into public.%I as t (%s) select %s from jsonb_populate_record(null::public.%I,$1) on conflict (%s) do update set %s returning to_jsonb(t)',
    spec->>'table',cols,cols,spec->>'table',(select string_agg(format('%I',k),',') from unnest(keys) k),updates) into after_row using input;
  if after_row->'raw' is distinct from raw then raise exception 'Stored Metrc payload differs from source'; end if;
  for col in select jsonb_object_keys(mapped) loop
   if after_row->col is distinct from mapped->col then raise exception 'Stored Metrc field differs: %',col; end if;
  end loop;
  insert into public.metrc_record_verification(run_id,source_state,page_number,ordinal,source_id,mirror_key,source_raw,source_sha256,mapped_fields,mirror_before,mirror_after)
  values(p_run_id,row.source_state,row.page_number,row.ordinality,raw->>'Id',key,raw,encode(sha256(convert_to(raw::text,'UTF8')),'hex'),mapped,before_row,after_row);
  n:=n+1;
 end loop;
 if n<>(select coalesce(sum(records_count),0) from public.metrc_sync_page_receipt where run_id=p_run_id) then raise exception 'Metrc committed population differs from staged pages'; end if;
 select encode(sha256(convert_to(coalesce(string_agg(source_state||':'||page_number||':'||response_sha256,E'\n' order by source_state,page_number),''),'UTF8')),'hex') into manifest
 from public.metrc_sync_page_receipt where run_id=p_run_id;
 if h.advance_cursor then
  cursor_receipt:=public.tg_metrc_finish_cursor(p_run_id,h.endpoint,h.license,h.window_start,h.window_end,n);
 else
  update public.metrc_sync_runs set status='ok',records=n,error=null,finished_at=clock_timestamp(),note='Source pages and every delivered record verified; historical window only' where id=p_run_id;
 end if;
 result:=jsonb_build_object('kind','metrc_record_commit_v1','run_id',p_run_id,'state','api_verified','endpoint',h.endpoint,'license',h.license,
   'window_start',h.window_start,'window_end',h.window_end,'records',n,'manifest_sha256',manifest,'cursor',cursor_receipt,'committed_at',clock_timestamp(),
   'scope','Delivered records and mapped fields; not full-source population certification');
 update public.metrc_sync_verification set state='api_verified',finished_at=clock_timestamp(),records_verified=n,receipt=result where run_id=p_run_id;
 return result;
end $$;

-- Compare a specified historical receipt with the actual current row; never carry its status forward blindly.
create function public.tg_metrc_check_record_receipt(p_run_id bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare h public.metrc_sync_verification; spec jsonb; r record; current_row jsonb; predicate text; n integer:=0; raw_bad integer:=0; mapped_bad integer:=0; missing integer:=0;
begin
 select * into strict h from public.metrc_sync_verification where run_id=p_run_id;
 spec:=public.tg_metrc_feed_contract(h.endpoint);
 select string_agg(format('t.%I = (jsonb_populate_record(null::public.%I,$1)).%I',k,spec->>'table',k),' and ')
 into predicate from jsonb_array_elements_text(spec->'keys') k;
 for r in select * from public.metrc_record_verification where run_id=p_run_id loop
  execute format('select to_jsonb(t) from public.%I t where %s',spec->>'table',predicate) into current_row using r.mirror_key;
  n:=n+1;
  if current_row is null then missing:=missing+1;
  else
   if current_row->'raw' is distinct from r.source_raw then raw_bad:=raw_bad+1; end if;
   if exists(select 1 from jsonb_each(r.mapped_fields) f where current_row->f.key is distinct from f.value) then mapped_bad:=mapped_bad+1; end if;
  end if;
 end loop;
 return jsonb_build_object('run_id',p_run_id,'historical_state',h.state,'checked_at',clock_timestamp(),'records',n,'missing',missing,'raw_changed',raw_bad,'mapped_changed',mapped_bad,
   'current_match',h.state='api_verified' and n>0 and n=h.records_verified and missing=0 and raw_bad=0 and mapped_bad=0,'scope','Only records in this receipt');
end $$;

alter table public.metrc_sync_verification enable row level security;
alter table public.metrc_sync_page_receipt enable row level security;
alter table public.metrc_record_verification enable row level security;
create policy metrc_verification_service on public.metrc_sync_verification for all to service_role using(true) with check(true);
create policy metrc_page_service on public.metrc_sync_page_receipt for all to service_role using(true) with check(true);
create policy metrc_record_service on public.metrc_record_verification for all to service_role using(true) with check(true);
revoke all on public.metrc_sync_verification,public.metrc_sync_page_receipt,public.metrc_record_verification from public,anon,authenticated;
grant select,insert,update on public.metrc_sync_verification to service_role;
grant select,insert on public.metrc_sync_page_receipt,public.metrc_record_verification to service_role;
do $$ declare f record; begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('tg_metrc_verification_immutable','tg_metrc_feed_contract','tg_metrc_source_date','tg_metrc_project_record','tg_metrc_begin_verification','tg_metrc_stage_page','tg_metrc_finish_verification','tg_metrc_check_record_receipt') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
  execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
