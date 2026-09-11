-- GPT: complete one Metrc feed and save only its cursor in one transaction.
-- Additive, service-only API. Existing configuration and run evidence are retained.
create or replace function public.tg_metrc_finish_cursor(
  p_run_id bigint, p_endpoint text, p_license text,
  p_window_start timestamptz, p_window_end timestamptz, p_records integer
) returns jsonb
language plpgsql security invoker set search_path = ''
as $function$
declare
  r public.metrc_sync_runs;
  v_key text;
  v_cursors jsonb;
  v_before timestamptz;
  v_after timestamptz;
  v_receipt jsonb;
  v_finished timestamptz;
begin
  if p_run_id is null or p_run_id<=0 or p_endpoint is null
     or p_endpoint not in ('packages','plants','harvests','plantbatches','transfers')
     or p_license is null or btrim(p_license)='' or p_license like '%:%'
     or p_window_start is null or p_window_end is null
     or not isfinite(p_window_start) or not isfinite(p_window_end)
     or p_window_start>p_window_end or p_records is null or p_records<0 then
    raise exception 'Invalid Metrc cursor completion contract';
  end if;
  v_key := p_license || ':' || p_endpoint;
  select * into strict r from public.metrc_sync_runs where id=p_run_id for update;
  if r.license is distinct from p_license
     or r.endpoint not in (p_endpoint || ' (delta)', p_endpoint || ' (full sweep)')
     or r.endpoint is null then
    raise exception 'Run identity does not match cursor feed';
  end if;

  -- A lost HTTP response may be retried without changing the original receipt.
  if r.status='ok' and r.note is not null then
    begin v_receipt := r.note::jsonb;
    exception when invalid_text_representation then v_receipt := null; end;
    if v_receipt->>'kind'='metrc_cursor_commit_v1'
       and (v_receipt->>'run_id')::bigint=p_run_id
       and v_receipt->>'cursor_key'=v_key
       and (v_receipt->>'window_start')::timestamptz=p_window_start
       and (v_receipt->>'window_end')::timestamptz=p_window_end
       and (v_receipt->>'records')::integer=p_records
       and r.records=p_records and r.finished_at is not null and r.error is null then
      return v_receipt;
    end if;
  end if;
  if r.status is distinct from 'running' or r.finished_at is not null or r.error is not null
     or r.started_at is null or not isfinite(r.started_at)
     or p_window_end>r.started_at or r.started_at>clock_timestamp() then
    raise exception 'Run is not eligible for atomic cursor completion';
  end if;

  insert into public.configurations(key,value) values('metrc_sync_cursors','{}'::jsonb)
    on conflict(key) do nothing;
  select value into strict v_cursors from public.configurations
    where key='metrc_sync_cursors' for update;
  if jsonb_typeof(v_cursors) is distinct from 'object' then
    raise exception 'Metrc cursor configuration is not an object';
  end if;
  if v_cursors ? v_key then
    if jsonb_typeof(v_cursors->v_key) is distinct from 'string' then
      raise exception 'Existing feed cursor is not a timestamp string';
    end if;
    v_before := (v_cursors->>v_key)::timestamptz;
    if not isfinite(v_before) then raise exception 'Existing feed cursor is not finite'; end if;
    if p_window_start>v_before then
      raise exception 'Requested window starts after saved coverage; cursor held';
    end if;
  end if;
  v_after := greatest(v_before,p_window_end);
  v_finished := clock_timestamp();
  if v_before is null or p_window_end>v_before then
    update public.configurations
      set value=jsonb_set(value,array[v_key],to_jsonb(p_window_end)),updated_at=v_finished
      where key='metrc_sync_cursors';
  end if;
  v_receipt := jsonb_build_object(
    'kind','metrc_cursor_commit_v1','run_id',p_run_id,'cursor_key',v_key,
    'window_start',p_window_start,'window_end',p_window_end,'records',p_records,
    'cursor_before',v_before,'cursor_after',v_after,'committed_at',v_finished,
    'outcome',case when v_before is null or p_window_end>v_before then 'advanced' else 'kept_newer' end);
  update public.metrc_sync_runs set status='ok',records=p_records,error=null,
    note=v_receipt::text,finished_at=v_finished where id=p_run_id;
  return v_receipt;
end
$function$;
revoke all on function public.tg_metrc_finish_cursor(bigint,text,text,timestamptz,timestamptz,integer)
  from public,anon,authenticated;
grant execute on function public.tg_metrc_finish_cursor(bigint,text,text,timestamptz,timestamptz,integer)
  to service_role;
