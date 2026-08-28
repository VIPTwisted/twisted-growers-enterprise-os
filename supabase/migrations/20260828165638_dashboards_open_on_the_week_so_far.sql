/* Dashboards open on the week so far — owner ruling, 28 Aug 2026.
 *
 * "Dashboards default to this_week_td (Monday → today), not this_week through Sunday."
 *
 * The distinction is not pedantry. Measured against Friday 2026-08-28:
 *
 *   this_week      2026-08-24 → 2026-08-30    includes Saturday and Sunday, unlived
 *   this_week_td   2026-08-24 → 2026-08-28    Monday to today
 *
 * A dashboard opening on `this_week` reports a week that has not happened yet. Every
 * rate, every per-day average and every "on track" judgement is then divided by seven
 * days of which two do not exist, and the page reads low for reasons nobody can see.
 * A to-date window is the only one whose denominator is real.
 *
 * WHERE THIS LIVES, AND WHY NOT IN JSX. f_date_default resolves in this order:
 *
 *   1. user_page_date_default   this user, this page
 *   2. user_settings            this user's own default
 *   3. nav_registry.default_range   <- the governed page default, set here
 *   4. range_kind = 'snapshot' -> today
 *   5. company fallback -> this_month
 *
 * So a policy row is the whole mechanism. The spec says it plainly — "no JSX hardcode"
 * — and it is also the reason a user's saved choice still wins: this moves the floor,
 * not the ceiling.
 *
 * THE TOWER KEEPS range_kind = 'snapshot', DELIBERATELY. Its figures are a position,
 * not a flow: v_control_tower is (metric, value) with no date column, and the KPI cards
 * are whole-table counts. The default_range below governs the control the page now
 * mounts; range_kind stays 'snapshot' because that is what the data is, and it is what
 * makes the page disclose "tiles cover all time" instead of pretending the selection
 * moved them. Setting it to 'activity' would make the Tower claim a flow it does not
 * have. The honest fix for that is a dated tower view, which is not this migration.
 */

update public.nav_registry
   set default_range = 'this_week_td'
 where view_key in ('tower', 'dept_dash_command', 'dept_dash_cultivation')
   and default_range is distinct from 'this_week_td';

/* Prove the three landed rather than trusting the UPDATE's row count, which is silent
   about a view_key that has been renamed out from under this file. */
do $$
declare missing text;
begin
  select string_agg(k, ', ')
    into missing
    from unnest(array['tower','dept_dash_command','dept_dash_cultivation']) as k
   where not exists (
     select 1 from public.nav_registry n
      where n.view_key = k and n.default_range = 'this_week_td');

  if missing is not null then
    raise exception
      'Period bus: these view_keys did not take the governed week-to-date default: %. '
      'Either the row is absent or the key was renamed; find it before assuming the '
      'default applied.', missing;
  end if;
end $$;
