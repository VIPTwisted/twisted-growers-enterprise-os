-- tg_call_function used pg_net's 5 s default, so the Run button never saw a sync's answer (the
-- function kept running server-side; the response row stayed empty). Cron callers keep 5 s; the
-- Sync page asks for 150 s so the answer lands in net._http_response for f_sync_run_result.
create or replace function public.tg_call_function(p_path text, p_body jsonb default '{}'::jsonb, p_timeout_ms integer default 5000)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare anon text; req bigint;
begin
  select value into anon from integration_secrets where name = 'SUPABASE_ANON_KEY';
  if anon is null then
    raise exception 'SUPABASE_ANON_KEY is not stored. Every scheduled call to an Edge Function needs it: the gateway checks a bearer token before the function''s own admin key is ever seen.';
  end if;
  select net.http_post(
    url := 'https://fxetuqjryttnypgepsru.supabase.co/functions/v1/' || p_path,
    headers := jsonb_build_object(
      'x-admin-key', (select value from integration_secrets where name = 'TG_ADMIN_KEY'),
      'Authorization', 'Bearer ' || anon,
      'Content-Type', 'application/json'),
    body := p_body,
    timeout_milliseconds := greatest(1000, least(p_timeout_ms, 300000))) into req;
  return req;
end $$;

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
      v_req := public.tg_call_function(r.runner, '{}'::jsonb, 150000);
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
