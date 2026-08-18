/* 168 views bypassed RLS and leaked to any signed-in user.
 *
 * Owner, 18 Aug 2026: "are you building the database in supa correctly for OS so all data
 * is pulled from supa correctly?" The honest answer was no, and this is the proof.
 *
 * A Postgres view runs as its OWNER unless security_invoker is set. The owner here is a
 * superuser, so any view without that option reads straight past the caller's RLS. Row
 * security on the tables is complete — 431 of 431 have it enabled — and 216 views quietly
 * defeat it, 168 of them over tables that carry real policies.
 *
 * MEASURED as role `authenticated` with NO app_users row — a signed-in person with no
 * granted role whatsoever:
 *
 *   metrc_packages           0 rows   correctly blocked by its policy
 *   v_metrc_credential_risk 29 rows   READABLE
 *   v_customers            127 rows   READABLE
 *   v_dept_dash_cfo          9 rows   READABLE
 *   v_money_position         1 row    READABLE
 *
 * The table refuses and the view hands it over. Credential risk, the customer list, the
 * CFO dashboard and the cash position are all reachable by anyone who can sign in.
 *
 * THIS MIGRATION FIXES THE SENSITIVE ONES ONLY, and deliberately not all 168.
 * Turning security_invoker on makes a view obey the caller's RLS, which is correct — but
 * for a view whose page is meant to be visible to staff whose role lacks a policy on the
 * underlying table, it will start returning nothing. That is a page going blank, and it
 * has to be tested page by page rather than applied to 168 views at 2am. The rest are
 * raised as a critical finding with the list attached.
 *
 * Chosen here: credentials, customers, money and executive dashboards. If one of these
 * goes blank for someone, the correct answer is a policy granting them the rows, not a
 * view that shows everyone everything.
 */

alter view public.v_metrc_credential_risk set (security_invoker = true);
alter view public.v_customers             set (security_invoker = true);
alter view public.v_customer_directory    set (security_invoker = true);
alter view public.v_customer_history      set (security_invoker = true);
alter view public.v_money_position        set (security_invoker = true);
alter view public.v_dept_dash_cfo         set (security_invoker = true);
alter view public.v_ceo_dashboard         set (security_invoker = true);
alter view public.v_supplier_costs        set (security_invoker = true);
alter view public.v_true_cost_per_pound   set (security_invoker = true);
alter view public.v_actual_cost_per_pound set (security_invoker = true);
alter view public.v_admin_settings        set (security_invoker = true);
alter view public.v_alert_email_recipients set (security_invoker = true);
alter view public.v_role_clearance_breaches set (security_invoker = true);
alter view public.v_leadership_accountability set (security_invoker = true);
alter view public.v_leadership_cost_vs_output set (security_invoker = true);

/* The probe used to prove this took a relation name and switched role. It has done its
   job and must not stay in the schema — the same reasoning that removed the timing
   helpers earlier today. */
drop function if exists public.f_probe_as_authenticated(text);

insert into public.watchdog_findings (
  observed_at, fingerprint, severity, what, where_it_is, who_is_accountable,
  when_it_started, why_it_matters, how_it_was_detected, what_to_do,
  the_arithmetic, evidence, record_count, solutions, guard_recommendation)
values (
  now(), 'views_without_security_invoker_bypass_rls', 'critical',
  '153 views still run as their owner instead of the caller, so they read past row '
    || 'security. Any signed-in user with no role can read whatever they expose.',
  'public schema. 216 views lack security_invoker; 168 of those read a table that has RLS '
    || 'policies; 15 of the most sensitive were corrected on 18 Aug 2026, leaving 153.',
  'Agent I, Database COO.',
  'Since each view was created. Row security on tables is complete and always has been — '
    || 'this is the view layer defeating it, not a missing policy.',
  'Row security is the only thing standing between a signed-in employee and every '
    || 'customer, cost and credential figure in the platform. Proven on 18 Aug 2026 as '
    || 'role authenticated with no app_users row: metrc_packages returned 0 rows as it '
    || 'should, while v_customers returned 127 and v_metrc_credential_risk returned 29.',
  'Compared pg_class.reloptions against the RLS status of every table each view depends '
    || 'on, then probed a sample directly as the authenticated role.',
  'Set security_invoker on the remaining 153, ONE PAGE AT A TIME. A view that starts '
    || 'returning nothing means the caller genuinely lacks a policy on the underlying '
    || 'table, and the fix is that policy — not leaving the view open.',
  '431 of 431 tables have RLS. 216 of 493 views lack security_invoker. 168 of those read a '
    || 'protected table. 15 corrected, 153 remain.',
  jsonb_build_object('views_without_invoker', 216, 'over_protected_tables', 168,
                     'corrected_now', 15, 'remaining', 153,
                     'proof', jsonb_build_object('metrc_packages', 0, 'v_customers', 127,
                                                 'v_metrc_credential_risk', 29,
                                                 'v_dept_dash_cfo', 9, 'v_money_position', 1)),
  153,
  array[
    'Set security_invoker = true per view, testing the page that reads it each time.',
    'Where a page then goes blank, add the RLS policy that grants that role its rows — the '
      || 'blankness is the honest answer and the policy is the fix.',
    'Add a gate that refuses any NEW view over a protected table without security_invoker, '
      || 'so this cannot regrow.'],
  'Do not set all 153 at once. A view going blank is a page going blank, and the pages have '
    || 'to be checked. But do not leave them either: the platform currently enforces row '
    || 'security on its tables and hands the same data over through its views.')
on conflict do nothing;;
