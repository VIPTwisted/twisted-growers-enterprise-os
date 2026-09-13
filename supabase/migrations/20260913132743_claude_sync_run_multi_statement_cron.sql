-- A cron command can be "set statement_timeout = '20min'; select tg_x()" — EXECUTE takes one statement,
-- so the dispatcher runs each statement of the job's command in turn.
create or replace function public.f_sync_run(p_key text) returns jsonb
language plpgsql security definer set search_path = public, cron, hr as $$
declare r public.sync_registry%rowtype; v_req bigint; v_cmd text; v_run bigint; v_res text; stmt text;
begin
  if not (public.current_app_role()::text in ('owner','executive')) then
    raise exception 'Only the owner or an executive may run a sync from here.' using errcode = '42501';
  end if;
  select * into r from public.sync_registry where key = p_key and enabled;
  if r.key is null then raise exception 'No enabled sync called %.', p_key; end if;
  insert into public.sync_registry_run (key, requested_by, method) values (r.key, auth.uid(), r.kind) returning id into v_run;
  begin
    if r.kind = 'edge_function' then
      v_req := public.tg_call_function(r.runner);
      update public.sync_registry_run set request_id = v_req, result = 'dispatched' where id = v_run;
      return jsonb_build_object('ok', true, 'run_id', v_run, 'request_id', v_req, 'method', 'edge_function', 'note', 'Dispatched; poll f_sync_run_result(run_id) for the answer.');
    elsif r.kind = 'cron' and r.cron_jobname is not null then
      select command into v_cmd from cron.job where jobname = r.cron_jobname;
      foreach stmt in array string_to_array(v_cmd, ';') loop
        if btrim(stmt) <> '' then execute btrim(stmt); end if;
      end loop;
      update public.sync_registry_run set result = 'ran: ' || left(v_cmd, 200) where id = v_run;
      return jsonb_build_object('ok', true, 'run_id', v_run, 'method', 'cron command', 'note', 'Ran the job''s command now.');
    elsif r.kind in ('rpc', 'bridge') then
      execute format('select %s()', r.runner) into v_res;
      update public.sync_registry_run set result = coalesce(v_res, 'done') where id = v_run;
      return jsonb_build_object('ok', true, 'run_id', v_run, 'method', r.kind, 'result', v_res);
    else
      raise exception 'Sync % has no runnable definition.', p_key;
    end if;
  exception when others then
    update public.sync_registry_run set error = left(sqlerrm, 500) where id = v_run;
    return jsonb_build_object('ok', false, 'run_id', v_run, 'error', sqlerrm);
  end;
end $$;
