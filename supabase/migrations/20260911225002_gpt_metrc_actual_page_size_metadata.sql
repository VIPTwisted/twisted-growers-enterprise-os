-- GPT: live Metrc reports actual records on a short or empty page as PageSize.
-- Accept only the requested page capacity or the actual array length.
-- TotalRecords, TotalPages, page sequence and terminal coverage remain enforced.
create or replace function public.tg_metrc_stage_page(p_run_id bigint,p_state text,p_page integer,p_path text,p_params jsonb,p_response text,p_sha256 text)
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
    elsif (field in ('Page','CurrentPage') and val<>p_page) or (field='PageSize' and val not in (h.page_size,n))
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
