-- The function's RETURNS TABLE names (checker, subject, verdict, detail) shadow real
-- columns of the same name inside the body -- tg_reconcile_tiles().verdict and
-- verification_runs.verdict both became ambiguous. The OUT names are never used as
-- variables here (results come back via RETURN QUERY), so resolving the conflict in
-- favour of the column is correct and total.
do $$
declare src text;
begin
  select p.prosrc into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'tg_auditor_pass';
  if src is null then
    raise exception 'tg_auditor_pass not found.';
  end if;
  if src like '%variable_conflict%' then
    raise notice 'pragma already present, nothing to do';
    return;
  end if;
  execute 'create or replace function public.tg_auditor_pass() '
       || 'returns table(checker text, subject text, verdict text, detail text) '
       || 'language plpgsql security definer set search_path = public, pg_temp as '
       || quote_literal(E'#variable_conflict use_column\n' || src);
end $$;

revoke all on function public.tg_auditor_pass() from public, anon;
grant execute on function public.tg_auditor_pass() to authenticated;;
