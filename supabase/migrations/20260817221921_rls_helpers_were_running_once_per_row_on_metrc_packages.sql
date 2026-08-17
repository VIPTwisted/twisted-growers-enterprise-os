/* The RLS helpers were running once per ROW on metrc_packages.
 *
 * The owner's Command dashboard showed four red boxes, all reading
 * "canceling statement due to statement timeout". The role `authenticated` carries
 * statement_timeout=8s. Measured under that exact role:
 *
 *   v_stock_headline          10,405 ms   OVER  <- all four boxes
 *   v_global_management           36 ms   fine
 *   mv_department_dashboard      1.6 ms   fine
 *
 * One view, not four problems. v_stock_headline scans metrc_packages, and
 * metrc_packages carries two PERMISSIVE policies that call a function WITHOUT
 * wrapping it:
 *
 *   cfo_read   SELECT  to authenticated   USING is_finance_reader()
 *   exec_all   ALL     to PUBLIC          USING is_executive()
 *
 * An unwrapped call is evaluated per row. 19,559 rows x 2 policies is roughly 39,000
 * function calls for a query that returns ONE row. Wrapped in (select ...), a STABLE
 * function is hoisted to an InitPlan and runs once. Both helpers are STABLE — checked,
 * not assumed — so this changes nothing about who may read what. Same roles, same
 * predicates, same answers.
 *
 * The pattern is already used correctly elsewhere in this schema: agent_findings
 * af_write reads `(SELECT auth.uid())`. These two were simply written the other way.
 *
 * THIS IS 2 OF 259. A sweep across pg_policy found 259 policies on 216 tables with an
 * unwrapped function call, covering about 495,000 rows of per-row evaluation. Only the
 * two on the measured hot path are changed here. The rest are catalogued rather than
 * swept, because 259 policy rewrites on a licensed operation is its own piece of work
 * with its own before-and-after measurement, not a footnote to a dashboard fix. Doing
 * it blind is how a permission quietly changes shape.
 */

drop policy if exists cfo_read on public.metrc_packages;
create policy cfo_read on public.metrc_packages
  for select to authenticated
  using ((select public.is_finance_reader()));

drop policy if exists exec_all on public.metrc_packages;
create policy exec_all on public.metrc_packages
  for all to public
  using ((select public.is_executive()))
  with check ((select public.is_executive()));

comment on table public.metrc_packages is
  'Metrc package mirror, read-only. RLS helpers are wrapped in (select ...) so a STABLE '
  'function is hoisted to an InitPlan and evaluated ONCE per query rather than once per '
  'row. Unwrapped, v_stock_headline took 10.4s against the 8s authenticated timeout and '
  'took four Command dashboard panels down with it. Fixed 17 Aug 2026, Agent I.';;
