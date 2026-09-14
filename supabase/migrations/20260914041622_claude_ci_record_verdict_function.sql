-- BP-16-3: CI's own verdict per commit. The gates connect as the read-only role, and a read-only role must stay
-- read-only — so the recorder goes through one narrow SECURITY DEFINER function that can write exactly one kind of
-- row (source 'ci') and nothing else. Found on the first run: "permission denied for table deploy_state".
create or replace function public.f_ci_record(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_run text := left(coalesce(p->>'run_id', ''), 40); v_sha text := lower(left(coalesce(p->>'sha', ''), 40));
        v_branch text := left(coalesce(p->>'branch', ''), 120); v_verdict text := lower(left(coalesce(p->>'verdict', 'unknown'), 20)); v_title text := left(coalesce(p->>'title', 'Gates'), 120);
begin
  if v_run = '' or v_sha !~ '^[0-9a-f]{7,40}$' then raise exception 'f_ci_record needs run_id and a commit sha.'; end if;
  if v_verdict not in ('success', 'failure', 'cancelled', 'skipped', 'unknown') then v_verdict := 'unknown'; end if;
  insert into public.deploy_state (deploy_id, source, site, branch, commit_ref, state, title, created_at, published_at)
  values ('ci-' || v_run, 'ci', 'twisted-growers-enterprise-os', nullif(v_branch, ''), v_sha, v_verdict, v_title || ' ' || v_verdict || ' for ' || left(v_sha, 7), now(), now())
  on conflict (deploy_id) do update set state = excluded.state, last_seen_at = now();
  return jsonb_build_object('ok', true, 'deploy_id', 'ci-' || v_run, 'state', v_verdict);
end $$;
revoke all on function public.f_ci_record(jsonb) from public;
grant execute on function public.f_ci_record(jsonb) to tg_desktop_reader, service_role, postgres;;
