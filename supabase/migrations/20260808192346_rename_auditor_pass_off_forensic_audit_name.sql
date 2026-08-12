-- tg_forensic_audit(text) already existed from the forensic_audit_engine work and
-- carries a DEFAULT, so adding a zero-argument overload made every call ambiguous.
-- The existing engine is left completely untouched; the new pass is renamed.
-- Body is copied out of the catalogue rather than retyped, so the two cannot differ.
do $$
declare src text;
begin
  select p.prosrc into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'tg_forensic_audit'
     and pg_get_function_identity_arguments(p.oid) = '';
  if src is null then
    raise exception 'Expected a zero-argument tg_forensic_audit to rename; none found.';
  end if;
  execute 'create or replace function public.tg_auditor_pass() '
       || 'returns table(checker text, subject text, verdict text, detail text) '
       || 'language plpgsql security definer set search_path = public, pg_temp as '
       || quote_literal(src);
end $$;

drop function public.tg_forensic_audit();

revoke all on function public.tg_auditor_pass() from public, anon;
grant execute on function public.tg_auditor_pass() to authenticated;

comment on function public.tg_auditor_pass() is
'The 24/7 conformance pass. Every row it writes carries a denominator (LAW 1) and the age of the data it examined (LAW 2). Distinct from tg_forensic_audit(text), which is the older section/metric engine.';

update checker_registry set runs_where = 'tg_auditor_pass()'
 where runs_where = 'tg_forensic_audit()';;
