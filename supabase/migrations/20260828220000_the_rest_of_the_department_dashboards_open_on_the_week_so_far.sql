/* The remaining department dashboards open on the week so far — 28 Aug 2026.
 *
 * 20260828165638 moved three: tower, dept_dash_command and dept_dash_cultivation.
 * There are twelve. Nine were left on a frame nobody chose for them, and the
 * ruling is "dept dashboards = this_week_td", so this finishes the set — with two
 * deliberate exclusions that are argued below rather than quietly applied.
 *
 * WHY this_week_td AND NOT this_week. Measured on a Friday, this_week runs to the
 * Sunday: a dashboard would report two days that have not happened, and every
 * rate, per-day average and "on track" judgement is divided by a denominator
 * containing them. A to-date window is the only one whose denominator is real.
 *
 * ─── EXCLUSION 1: dept_dash_sales stays this_month_td ──────────────────────
 *
 * It is labelled "Finance Dashboard", and finance was ruled separately and
 * explicitly: "dashboards week-to-date / finance month-to-date — already ruled.
 * Do not let them pick one default for every tile." docs/PERIOD_BUS_SPEC.md says
 * the same thing twice over, listing `*_dashboard` under this_week AND
 * `finance, orders, sales, cost_*` under this_month. This row matches both
 * patterns, so the tie is broken by the more specific rule and by the fact that
 * finance reads in months: a week-to-date revenue figure invites comparison
 * against a monthly target and loses every time.
 *
 * ─── EXCLUSION 2: dept_dash_inventory stays today / snapshot ───────────────
 *
 * It is the only one of the twelve already marked range_kind 'snapshot', and that
 * is correct: stock on hand is a POSITION, not a flow. The spec puts "stock on
 * hand" under as_of_now for exactly this reason. Giving it an activity week would
 * make the page claim a flow it does not have — the same error as setting the
 * Tower to 'activity', which 20260828165638 deliberately avoided. A position
 * dashboard answers "what is here now", and a week window over that is not a
 * narrower answer, it is a different and wrong question.
 *
 * ─── dept_dash_settings IS included, and is the weakest of the seven ───────
 *
 * A settings surface is closer to configuration than to activity, so a week frame
 * may mean little on it. It is included because it is marked range_kind
 * 'activity' today and the ruling names dept dashboards without exception; if the
 * owner would rather it were a snapshot like inventory, that is one row and it is
 * flagged rather than decided here.
 *
 * Nothing about a preset, a week start or a catalogue is defined in this file.
 * f_date_default reads nav_registry.default_range third, after a user's own saved
 * choice for the page and their global default, so this moves the floor and never
 * the ceiling.
 */

update public.nav_registry
   set default_range = 'this_week_td'
 where view_key in (
         'dept_dash_hr',
         'dept_dash_metrc',
         'dept_dash_mfg',
         'dept_dash_preroll',
         'dept_dash_quality',
         'dept_dash_settings',
         'dept_dash_workspace'
       )
   and default_range is distinct from 'this_week_td';

/* Prove the whole set, not just the rows this file wrote. An UPDATE's row count
   is silent about a view_key renamed out from under it, and silent about the
   three that 20260828165638 was supposed to have already moved. */
do $$
declare bad text;
begin
  select string_agg(view_key || ' -> ' || coalesce(default_range, 'NULL'), ', ' order by view_key)
    into bad
    from public.nav_registry
   where enabled
     and (view_key = 'tower' or view_key like 'dept\_dash%')
     and view_key not in ('dept_dash_sales', 'dept_dash_inventory')
     and default_range is distinct from 'this_week_td';

  if bad is not null then
    raise exception
      'These dashboards are not on the week so far: %. Either a row is absent, a '
      'key was renamed, or something wrote over it after this migration.', bad;
  end if;

  /* The two exclusions must still be what this file claims they are. If somebody
     later moves them, that is a decision — but it must not happen silently under
     a migration whose comment says they were left alone. */
  if (select default_range from public.nav_registry where view_key = 'dept_dash_sales')
     is distinct from 'this_month_td' then
    raise exception
      'dept_dash_sales is no longer this_month_td. Finance was ruled to months '
      'separately; if that changed, this migration''s reasoning is out of date.';
  end if;

  if (select range_kind from public.nav_registry where view_key = 'dept_dash_inventory')
     is distinct from 'snapshot' then
    raise exception
      'dept_dash_inventory is no longer a snapshot. Stock on hand is a position, '
      'and a week window over a position is a different question, not a narrower one.';
  end if;

  /* Every frame named here has to be a preset the catalogue offers, or a page
     opens on a window f_date_presets cannot resolve. */
  select string_agg(n.view_key, ', ') into bad
    from public.nav_registry n
   where n.enabled
     and (n.view_key = 'tower' or n.view_key like 'dept\_dash%')
     and n.default_range is not null
     and not exists (select 1 from public.f_date_presets()
                      where preset_key = n.default_range);
  if bad is not null then
    raise exception 'These dashboards point at a preset f_date_presets does not offer: %', bad;
  end if;
end $$;
