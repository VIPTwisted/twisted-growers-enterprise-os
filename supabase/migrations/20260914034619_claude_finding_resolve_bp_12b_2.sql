-- BP-12b-2 Findings queue exemplar: "decide in place". One RPC resolves an agent finding with a written
-- resolution, attributed, and only by a role that may decide (owner, executive, admin, manager, dept_head, cfo, hr).
-- The finding keeps its history: resolution text carries who and when; a reopen is a new finding, never an edit.
create or replace function public.f_finding_resolve(p_id uuid, p_resolution text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r text := public.current_app_role()::text; n int;
begin
  if r is null or r not in ('owner','executive','admin','manager','dept_head','cfo','hr') then
    raise exception 'The % role may not resolve findings.', coalesce(r, 'signed-out') using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_resolution, '')), '') is null then raise exception 'A resolution needs words: what was decided and why.'; end if;
  update public.agent_findings
     set resolved_at = now(), resolution = left(btrim(p_resolution), 1000) || ' — resolved by ' || r || ' (' || coalesce(auth.uid()::text, '—') || ') at ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ' UTC'
   where id = p_id and resolved_at is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'No open finding with that id — it may already be resolved.'; end if;
  return jsonb_build_object('ok', true, 'id', p_id, 'resolved_at', now());
end $$;
grant execute on function public.f_finding_resolve(uuid, text) to authenticated;;
