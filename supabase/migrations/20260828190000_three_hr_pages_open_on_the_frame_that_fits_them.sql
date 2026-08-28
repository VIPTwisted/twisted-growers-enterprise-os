/* Three HR pages open on the wrong frame — measured 28 Aug 2026.
 *
 * Putting these pages on the period bus made the governed defaults visible for the
 * first time, and three of them were wrong in a way that only shows once the frame
 * is actually applied. All three are policy rows, not JSX: f_date_default reads
 * nav_registry.default_range, and a user's own saved choice still outranks it.
 *
 * ─── people (the Roster) ───────────────────────────────────────────────────
 * Held this_month_td with range_kind 'activity'. The only dates an employee row
 * carries are hired_on and terminated_on, so applying that frame opens the roster
 * showing ONLY people hired this month — and calls itself the roster. Everybody
 * hired before the 1st simply is not there, with nothing on screen saying why.
 *
 * A roster is a position: who works here is a standing fact that does not happen on
 * a date. So 'all' with range_kind 'snapshot'. The control stays on the page and
 * still answers "who joined this quarter", which is a real question — it is just
 * never the opening one.
 *
 * ─── my_week ───────────────────────────────────────────────────────────────
 * Held NO default_range at all, so f_date_default fell past this row to the
 * snapshot fallback and resolved 'today'. A page called My Week opened on one day.
 * It is one of the 103 nav rows with a null default_range that
 * docs/TODO_EVERY_PAGE.md counts.
 *
 * ─── schedule_builder ──────────────────────────────────────────────────────
 * Held this_month_td. A schedule is painted a week at a time and posted a week at a
 * time by f_post_schedule; a month frame does not fit the grid it governs.
 *
 * WHY THESE TWO GET this_week AND NOT this_week_td, WHICH IS THE DASHBOARD RULE.
 * A dashboard reports what happened, so it stops at today and its denominator is
 * real. These two plan what has NOT happened: a scheduler builds Thursday and
 * Friday, and a person reads My Week to see what is coming. A to-date frame would
 * end the week at today and hide the part being planned — the same defect as
 * this_week on a dashboard, pointing the other way in time.
 */

update public.nav_registry
   set default_range = 'all',
       range_kind    = 'snapshot'
 where view_key = 'people'
   and (default_range is distinct from 'all' or range_kind is distinct from 'snapshot');

update public.nav_registry
   set default_range = 'this_week'
 where view_key in ('my_week', 'schedule_builder')
   and default_range is distinct from 'this_week';

/* Prove it, rather than trusting three UPDATEs that are silent about a view_key
   renamed out from under this file. */
do $$
declare bad text;
begin
  select string_agg(view_key || ' -> ' || coalesce(default_range, 'NULL'), ', ')
    into bad
    from public.nav_registry
   where (view_key = 'people' and (default_range is distinct from 'all'
                                or range_kind is distinct from 'snapshot'))
      or (view_key in ('my_week', 'schedule_builder')
          and default_range is distinct from 'this_week');
  if bad is not null then
    raise exception
      'HR frames did not take: %. Either the row is absent or the key was renamed; '
      'find it rather than assuming the default applied.', bad;
  end if;

  /* Every one of the three must resolve to a preset that exists, or the page opens
     on a frame the catalogue cannot price. */
  select string_agg(n.view_key, ', ') into bad
    from public.nav_registry n
   where n.view_key in ('people', 'my_week', 'schedule_builder')
     and not exists (select 1 from public.f_date_presets()
                      where preset_key = n.default_range);
  if bad is not null then
    raise exception 'These pages point at a preset f_date_presets does not offer: %', bad;
  end if;
end $$;
