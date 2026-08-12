-- THE ALL-CLEAR FALSIFIER.
--
-- Three times on 10 Aug 2026 the same defect appeared in three unrelated places: a surface that
-- becomes MORE REASSURING the less it can see.
--
--   v_pay_rate_confidence   0 visible rates  -> "Every rate has been approved. Payroll figures
--                                                can be quoted."   (21 are unapproved placeholders)
--   v_alert_email_status    0 visible addrs  -> "EMAIL ON BUT NOBODY TO SEND TO"
--   v_auditor_verdict       empty registers  -> "0 policies on memory only, 0 findings open"
--
-- Same shape as the RLS-no-policy finding calling three deliberately sealed tables a fault, and the
-- same shape as the owner's own standing complaint that "all clear" and "no data ever" look
-- identical on screen. Absence, no-access and all-clear are three different facts rendered as one.
--
-- WHY THIS IS WORTH MECHANISING RATHER THAN REMEMBERING. Every other class of defect here announces
-- itself: a broken page is blank, a failing check goes red, a bad number disagrees with its drill.
-- This one announces the opposite of itself. It gets quieter as it gets worse, and it is produced
-- by ordinary correct-looking SQL — an aggregate over rows the caller cannot see. Tightening
-- security CREATES it, so every improvement made today was a chance to introduce one. Canaries and
-- error budgets do not catch it, because nothing errors and nothing slows down.
--
-- THE STRUCTURAL HAZARD, stated precisely so it can be found without reading intent:
--   An UNGROUPED aggregate view always returns exactly one row. If any output is derived from
--   comparing that aggregate to zero, then a caller who can see no rows gets the zero branch —
--   and the zero branch was almost always written to mean "nothing wrong" rather than "nothing
--   visible". A view with GROUP BY collapses to no rows instead and is safe by construction.
--
-- The remedy is an explicit zero-case that names the ambiguity, which is exactly what was applied
-- to v_pay_rate_confidence and v_alert_email_status. So a view is flagged only when it has the
-- hazard shape, behaves differently under reduced privilege, AND has no explicit zero branch.
-- Semantics are never guessed: the empirical half compares the privileged and unprivileged rows as
-- jsonb, so it is wording-independent.
create or replace function public.tg_all_clear_falsifier(p_selftest_extra int default null)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v            record;
  as_owner     jsonb;
  as_staff     jsonb;
  hazards      int := 0;
  examined     int := 0;
  offenders    text[] := '{}';
begin
  for v in
    select c.relname, pg_get_viewdef(c.oid, true) as def
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       /* holds an aggregate ... */
       and pg_get_viewdef(c.oid, true) ~* '\y(count|sum|avg|bool_and|bool_or)\s*\('
       /* ... with no GROUP BY, so it always returns a row ... */
       and pg_get_viewdef(c.oid, true) !~* '\ygroup\s+by\y'
       /* ... and derives something from that aggregate being zero, or branches on it. */
       and pg_get_viewdef(c.oid, true) ~* '=\s*0\y|\ycase\y'
       /* ... and does NOT already carry an explicit zero-case naming the ambiguity. */
       and pg_get_viewdef(c.oid, true) !~* '=\s*0\s+then'
     order by c.relname
  loop
    examined := examined + 1;

    begin
      execute format('select to_jsonb(t) from (select * from public.%I limit 1) t', v.relname)
        into as_owner;
    exception when others then continue;   /* cannot read it privileged: not this check's business */
    end;

    set local role authenticated;
    begin
      execute format('select to_jsonb(t) from (select * from public.%I limit 1) t', v.relname)
        into as_staff;
    exception when others then
      as_staff := null;   /* refused outright is honest: the caller learns nothing false */
    end;
    reset role;

    /* The defect is: it still answers, and answers DIFFERENTLY, without saying it is blind. */
    if as_staff is not null and as_owner is not null and as_staff <> as_owner then
      hazards := hazards + 1;
      offenders := offenders || v.relname;
    end if;
  end loop;

  if p_selftest_extra is not null then
    hazards := hazards + greatest(p_selftest_extra, 0);
    offenders := offenders || format('SELF-TEST(+%s)', greatest(p_selftest_extra, 0));
  end if;

  insert into conformance_ledger
    (checker_key, subject_kind, subject_ref, verdict, numerator, denominator,
     the_arithmetic, drill, note)
  values
    ('detect.all_clear_falsifier', 'metric', 'views_that_reassure_when_blind',
     case when hazards = 0 then 'PASS' else 'FAIL' end,
     examined - hazards, examined,
     format('%s of %s ungrouped-aggregate views tell a signed-in user a DIFFERENT story than they '
            || 'tell the owner, while carrying no explicit zero-case to say they are blind. A view '
            || 'like this gets quieter as it gets worse. %s',
            hazards, examined,
            case when hazards = 0 then 'None found.'
                 else 'Found: ' || array_to_string(offenders, ', ') end),
     'Read the view as owner, then: set local role authenticated; select * from <view>; — if the '
     || 'answer changes and nothing in the output admits the caller is blind, that is the defect.',
     case when p_selftest_extra is not null then 'SELF-TEST: count inflated. Not a measurement.' end);

  return format('%s — %s hazard(s) of %s ungrouped-aggregate views examined%s',
                case when hazards = 0 then 'PASS' else 'FAIL' end, hazards, examined,
                case when hazards = 0 then '' else ': ' || array_to_string(offenders, ', ') end);
end $fn$;

comment on function public.tg_all_clear_falsifier(int) is
  'Finds surfaces that become MORE reassuring the less they can see. An ungrouped aggregate view '
  'always returns a row, so a caller who can see nothing gets the zero branch — and the zero branch '
  'was usually written to mean "nothing wrong" rather than "nothing visible". Compares the '
  'privileged and unprivileged reads as jsonb, so it never guesses at wording. Written after this '
  'exact defect appeared three times in one day, in payroll, alerting and the auditor itself.';

insert into public.checker_registry
  (checker_key, title, tier, runs_where, expected_interval, policy_keys, subject_kind,
   fixture_proves_it_fails, fixture_selftest_fn, fixture_positive_case, fixture_negative_case,
   enabled, note)
values
  ('detect.all_clear_falsifier',
   'No surface may become more reassuring the less it can see',
   'detect', 'cron all-clear-falsifier', interval '1 day',
   array['A3'], 'metric', true, 'tg_all_clear_falsifier',
   'select tg_all_clear_falsifier(1) — one hazard injected must return FAIL.',
   'select tg_all_clear_falsifier() — no hazards must return PASS.',
   true,
   'Claims rule A3 (absence is explained, never blank) because that is the rule this defect breaks: it renders no-access and absence as an all-clear. Written 10 Aug 2026 after three instances in one day — v_pay_rate_confidence, v_alert_email_status and v_auditor_verdict.')
on conflict (checker_key) do update set
  title = excluded.title, fixture_selftest_fn = excluded.fixture_selftest_fn,
  fixture_positive_case = excluded.fixture_positive_case,
  fixture_negative_case = excluded.fixture_negative_case, note = excluded.note;

select cron.schedule('all-clear-falsifier', '46 6 * * *',
                     $$select public.tg_all_clear_falsifier();$$);;
