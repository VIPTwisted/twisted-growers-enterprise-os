/* An employee file and an onboarding console are positions, not periods.
 * Owner ruling of 28 Aug 2026, docs/TODO_EVERY_PAGE.md.
 *
 * Both pages held NO default_range at all, so f_date_default fell past
 * nav_registry to the snapshot fallback and resolved 'today'. Wiring them to the
 * bus is what made that visible, and it would have been visible to a user as an
 * empty page rather than as a setting:
 *
 *   employee_file  A career, shown one day wide. Every rate, occurrence and
 *                  document filed before this morning simply absent, with
 *                  nothing on screen explaining why. The page exists to answer
 *                  "what has happened to this person", which is the whole file.
 *
 *   onboard        A work queue. The person the console exists to surface is the
 *                  one stuck since June — and a frame ending today, or a month
 *                  frame, hides exactly them. Who is still mid-onboarding is a
 *                  standing fact, not something that happened on a date.
 *
 * Both become 'all' with range_kind 'snapshot'. The control stays on both pages
 * and still narrows when somebody asks a period question of it — "who joined
 * this quarter", "what happened to this person in March" — it is simply never
 * the opening question, because the opening question on both pages is "who and
 * what is outstanding", and that has no period.
 *
 * THE THREE FORM PAGES ARE DELIBERATELY NOT TOUCHED. my_callout, my_timeoff and
 * my_incident also hold a null default_range, and they keep it: staffforms.jsx
 * is a form that inserts a row and browses nothing, so it declares itself
 * undated on its face instead of taking a frame. Giving them a governed default
 * would be governing a control that does not exist and should not.
 */

update public.nav_registry
   set default_range = 'all',
       range_kind    = 'snapshot'
 where view_key in ('employee_file', 'onboard')
   and (default_range is distinct from 'all' or range_kind is distinct from 'snapshot');

do $$
declare bad text;
begin
  select string_agg(view_key || ' -> ' || coalesce(default_range, 'NULL')
                    || '/' || coalesce(range_kind, 'NULL'), ', ')
    into bad
    from public.nav_registry
   where view_key in ('employee_file', 'onboard')
     and (default_range is distinct from 'all' or range_kind is distinct from 'snapshot');
  if bad is not null then
    raise exception
      'These frames did not take: %. Either the row is absent or the key was '
      'renamed; find it rather than assuming the default applied.', bad;
  end if;

  /* 'all' must be a preset the catalogue actually offers, or both pages open on
     a frame f_date_presets cannot resolve and the control renders empty. */
  if not exists (select 1 from public.f_date_presets() where preset_key = 'all') then
    raise exception 'f_date_presets does not offer the preset ''all''.';
  end if;
end $$;
