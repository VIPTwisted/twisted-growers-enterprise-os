/* THE ACCESS REPAIRS THAT LET NINE MORE VIEWS STOP BYPASSING ROW SECURITY.
 *
 * The probe (view_rls_flip_log) held nine views back for exactly two access
 * defects, both fixed here:
 *
 * 1. SEVEN ops/reference tables had RLS enabled and NO policy for signed-in
 *    users — silent deny-all. Four views over them (assertion coverage,
 *    examination readiness, glossary conflicts, house rules) would have gone
 *    blank when flipped. These tables hold audit standards, glossary terms,
 *    navigation registry, root-cause history and the 280E doctrine notes —
 *    reference and ops material the OS is built to SHOW, with no PII and no
 *    secrets. They get plain read policies.
 *
 * 2. apex_raw had a read POLICY (admin-gated) but no GRANT — so five sales
 *    coverage views errored "permission denied" as a signed-in user instead of
 *    filtering. The grant is added; RLS still gates rows to admins. While
 *    here, the policy qual gains the (select ...) wrapper so the STABLE
 *    f_caller_is_admin() hoists to an InitPlan instead of evaluating per row —
 *    one down-payment on task #34, the pathology the probe caught timing out
 *    v_ownership_verdict. */

create policy aa_read  on public.audit_assertion       for select to authenticated using (true);
create policy es_read  on public.examination_standard  for select to authenticated using (true);
create policy gt_read  on public.glossary_term         for select to authenticated using (true);
create policy gv_read  on public.glossary_variant      for select to authenticated using (true);
create policy nr_read  on public.nav_registry          for select to authenticated using (true);
create policy rcl_read on public.root_cause_ledger     for select to authenticated using (true);
create policy t28_read on public.tax_280e_doctrine     for select to authenticated using (true);

grant select on public.apex_raw to authenticated;
alter policy apex_raw_admin_read on public.apex_raw using ((select public.f_caller_is_admin()));;
