-- ============================================================================
-- SOMETHING MUST WATCH. Nothing did.
--
-- Before this: no cron job anywhere mentioned staffing, coverage or zones. The
-- requirement model, the per-day view and the live floor view all existed and NOTHING
-- read any of them. A short-staffed week would have been visible to anyone who thought
-- to open the page, and invisible otherwise.
--
-- Writes into conformance_ledger so short-staffing appears beside every other verdict,
-- and so the Auditor's laws apply to it:
--
--   LAW 1  no verdict without a denominator. "COVERED" alone is unfalsifiable;
--          "6 of 8 departments covered" is falsifiable, and if the denominator drops
--          to 3 because someone deleted requirements, that becomes visible.
--   LAW 2  freshness is part of the verdict — data_as_of carries the week examined.
--   LAW 3  UNCHECKED is a verdict. With zero requirements set, coverage is
--          UNMEASURABLE, and that must never render as "nobody is short-staffed".
--          This is the single most important line in the whole function.
-- ============================================================================

create or replace function public.tg_coverage_check()
returns table(week text, verdict text, detail text)
language plpgsql security definer set search_path = public, pg_temp
as $function$
#variable_conflict use_column
declare v_run uuid := gen_random_uuid(); v_reqs int;
begin
  select count(*) into v_reqs from zone_staffing_requirements
   where effective_to is null or effective_to >= current_date - 7;

  -- LAW 3. No requirement means unmeasurable, not satisfied.
  if v_reqs = 0 then
    insert into conformance_ledger (run_id, checker_key, policy_key, subject_kind, subject_ref,
           verdict, numerator, denominator, the_arithmetic, drill, data_as_of)
    values (v_run, 'detect.coverage', 'A5', 'metric', 'departments_with_a_coverage_requirement',
            'UNCHECKED', 0, null,
            'No coverage requirement is set for any department, so short-staffing CANNOT be '
            || 'detected. ' || (select count(*) from departments) || ' departments exist. This is '
            || 'NOT the same as being fully staffed, and must never be presented as such.',
            'zone_staffing_requirements', now());
    return query
      select null::text, 'UNCHECKED'::text,
             'No coverage requirement set. ' || (select count(*)::text from departments)
             || ' departments exist and none can be judged.';
    return;
  end if;

  -- One row per week, so a bad week is not averaged away by a good one.
  insert into conformance_ledger (run_id, checker_key, policy_key, subject_kind, subject_ref,
         verdict, numerator, denominator, the_arithmetic, drill, data_as_of)
  select v_run, 'detect.coverage', 'A5', 'metric',
         'department_coverage_week_' || to_char(w.week_start, 'IYYY_IW'),
         case when w.short = 0 then 'PASS' else 'FAIL' end,
         w.total - w.short, w.total,
         (w.total - w.short) || ' of ' || w.total || ' departments covered in the week of '
         || w.week_start || '. ' ||
         case when w.short = 0 then 'None short.'
              else w.short || ' short: ' || w.who || '. Rota gap ' || w.head_days
                   || ' head-days.' end,
         'v_department_coverage_week', w.week_start::timestamptz
  from (
    select week_start,
           count(*)                                                   as total,
           count(*) filter (where verdict <> 'COVERED'
                              and verdict <> 'NO REQUIREMENT SET')     as short,
           coalesce(string_agg(department, ', ')
             filter (where verdict <> 'COVERED'
                       and verdict <> 'NO REQUIREMENT SET'), '')       as who,
           coalesce(sum(head_days_short_on_the_rota)
             filter (where head_days_short_on_the_rota > 0), 0)        as head_days
    from v_department_coverage_week
    group by week_start
  ) w;

  return query
    select cl.subject_ref, cl.verdict, cl.the_arithmetic
      from conformance_ledger cl
     where cl.run_id = v_run
     order by cl.subject_ref desc;
end $function$;

revoke all on function public.tg_coverage_check() from public, anon;
grant execute on function public.tg_coverage_check() to authenticated;

comment on function public.tg_coverage_check() is
'Writes a per-week, per-department coverage verdict into conformance_ledger. With zero requirements set it records UNCHECKED, never PASS -- an unmeasurable department must not read as a covered one.';

insert into checker_registry
  (checker_key, title, tier, runs_where, expected_interval, fixture_proves_it_fails,
   policy_keys, subject_kind, note)
values
  ('detect.coverage', 'Department short-staffed, per week', 'detect',
   'cron coverage-watch', interval '1 day', false, '{A5}', 'metric',
   'Owner requirement 8 Aug 2026. Nothing watched coverage before this -- no cron job mentioned staffing, zones or coverage at all, while three views sat unread.')
on conflict (checker_key) do update
  set title = excluded.title, runs_where = excluded.runs_where,
      expected_interval = excluded.expected_interval, note = excluded.note;

-- Daily, so a short week is caught while it can still be fixed rather than reported after.
-- :38 avoids every slot already taken. Reads only our own tables; no Metrc call.
select cron.schedule('coverage-watch', '38 6 * * *', $$select public.tg_coverage_check()$$);;
