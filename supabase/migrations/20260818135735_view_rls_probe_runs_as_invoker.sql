/* Postgres forbids SET ROLE inside a SECURITY DEFINER function ("security-restricted
 * operation"), so the first probe run errored on every view. The probe does not need
 * definer rights: it is invoked over the admin connection, which owns the views and may
 * impersonate authenticated. Redefined as SECURITY INVOKER — the only change. */
create or replace function public.tg_probe_view_invoker(p_views text[], p_uid uuid, p_cap int default 5001)
returns table (view_name text, owner_rows bigint, invoker_rows bigint, verdict text, note text)
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v text;
  v_owner bigint; v_invoker bigint; v_verdict text; v_note text;
begin
  foreach v in array p_views loop
    v_owner := null; v_invoker := null; v_note := null;
    begin
      execute format('select count(*) from (select 1 from public.%I limit %s) s', v, p_cap) into v_owner;
      begin
        execute format('alter view public.%I set (security_invoker = true)', v);
        perform set_config('request.jwt.claims',
                           json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
        execute 'set local role authenticated';
        execute format('select count(*) from (select 1 from public.%I limit %s) s', v, p_cap) into v_invoker;
        execute 'reset role';
        raise exception using errcode = 'P0999', message = 'measured — rolling the trial flip back';
      exception
        when sqlstate 'P0999' then null;
        when others then
          v_note := 'as-user query failed: ' || sqlerrm;
      end;
      if v_note is not null then v_verdict := 'ERROR';
      elsif v_invoker = v_owner then v_verdict := 'MEASURED_SAFE';
      else v_verdict := 'MEASURED_DIFFERS';
           v_note := format('owner sees %s, signed-in user would see %s', v_owner, v_invoker);
      end if;
    exception when others then
      v_verdict := 'ERROR';
      v_note := 'owner-mode count failed: ' || sqlerrm;
    end;
    insert into view_rls_flip_log (view_name, probe_uid, owner_rows, invoker_rows, row_cap, verdict, note)
    values (v, p_uid, v_owner, v_invoker, p_cap, v_verdict, v_note);
    view_name := v; owner_rows := v_owner; invoker_rows := v_invoker; verdict := v_verdict; note := v_note;
    return next;
  end loop;
end $$;;
