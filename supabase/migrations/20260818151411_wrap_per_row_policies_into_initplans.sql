/* THE PER-ROW POLICY TAX, PAID OFF WHOLESALE — task #34.
 *
 * A policy qual like `is_executive()` re-evaluates the helper for EVERY ROW the
 * statement touches: current_app_role() -> app_users lookup, per row, across
 * 800k-row scans. Wrapped as `(select is_executive())` the planner hoists the
 * STABLE call into an InitPlan — evaluated once per statement, identical
 * result. The cost is not theoretical: this exact chain took the August
 * dashboard from 10.4s to 552ms when the first policies were wrapped, and
 * TODAY the RLS probe measured it timing out v_ownership_verdict as a signed-in
 * user (current_app_role -> f_role_can -> is_executive -> f_material_origin,
 * per row, past the statement budget).
 *
 * WHY A MECHANICAL PASS IS SAFE HERE AND ONLY HERE. The transform whitelist is
 * zero-argument stable helpers (is_executive, f_caller_is_admin, f_can_read_hr,
 * f_my_employee_id, current_app_role, auth.uid) — no column arguments, so
 * hoisting cannot change any row's verdict — and it only touches policies whose
 * expressions contain NO 'select' at all, so nothing already wrapped or complex
 * is rewritten. Every change is recorded before/after in policy_wrap_log.
 * The 13 mixed/partially-wrapped policies are deliberately untouched. */

create table if not exists public.policy_wrap_log (
  id bigint generated always as identity primary key,
  wrapped_at timestamptz not null default now(),
  relname text not null,
  polname text not null,
  before_qual text, after_qual text,
  before_wchk text, after_wchk text
);
comment on table public.policy_wrap_log is
  'Audit of the task #34 mechanical policy wrap, 18 Aug 2026: each row is one policy whose '
  'zero-arg stable helper calls were wrapped into (select ...) InitPlans. Agent I.';
alter table public.policy_wrap_log enable row level security;
create policy pwl_read on public.policy_wrap_log for select to authenticated using (true);

do $$
declare
  r record;
  new_qual text; new_wchk text;
  wrap constant text[] := array['is_executive','f_caller_is_admin','f_can_read_hr','f_my_employee_id','current_app_role'];
  fn text;
  n int := 0;
begin
  for r in
    select p.polname, c.relname,
           pg_get_expr(p.polqual, p.polrelid) as qual,
           pg_get_expr(p.polwithcheck, p.polrelid) as wchk
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n2 on n2.oid = c.relnamespace
    where n2.nspname = 'public'
      and (coalesce(pg_get_expr(p.polqual, p.polrelid),'') || ' ' ||
           coalesce(pg_get_expr(p.polwithcheck, p.polrelid),'')) !~* 'select'
      and (coalesce(pg_get_expr(p.polqual, p.polrelid),'') || ' ' ||
           coalesce(pg_get_expr(p.polwithcheck, p.polrelid),''))
          ~ '(is_executive|f_caller_is_admin|f_can_read_hr|f_my_employee_id|current_app_role|auth\.uid)\(\)'
  loop
    new_qual := r.qual; new_wchk := r.wchk;
    foreach fn in array wrap loop
      new_qual := regexp_replace(new_qual, '\m' || fn || '\(\)', '(select ' || fn || '())', 'g');
      new_wchk := regexp_replace(new_wchk, '\m' || fn || '\(\)', '(select ' || fn || '())', 'g');
    end loop;
    new_qual := regexp_replace(new_qual, '\mauth\.uid\(\)', '(select auth.uid())', 'g');
    new_wchk := regexp_replace(new_wchk, '\mauth\.uid\(\)', '(select auth.uid())', 'g');

    if new_qual is distinct from r.qual or new_wchk is distinct from r.wchk then
      if r.qual is not null and r.wchk is not null then
        execute format('alter policy %I on public.%I using (%s) with check (%s)', r.polname, r.relname, new_qual, new_wchk);
      elsif r.qual is not null then
        execute format('alter policy %I on public.%I using (%s)', r.polname, r.relname, new_qual);
      else
        execute format('alter policy %I on public.%I with check (%s)', r.polname, r.relname, new_wchk);
      end if;
      insert into policy_wrap_log (relname, polname, before_qual, after_qual, before_wchk, after_wchk)
      values (r.relname, r.polname, r.qual, new_qual, r.wchk, new_wchk);
      n := n + 1;
    end if;
  end loop;
  raise notice 'wrapped % policies', n;
end $$;;
