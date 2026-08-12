-- Register it, with the fixture fields filled in honestly rather than left blank.
-- 42 registered checkers have nothing proving they can fail. This one does, and the proof is
-- runnable rather than described: tg_view_rls_ratchet(1) returns FAIL at one view worse, and
-- verified not to move the baseline while doing so.
--
-- policy_keys is deliberately EMPTY, and that is the finding rather than an omission. None of
-- the 51 owner rules covers access control on views. E6 is about anon grants specifically and
-- anon is clean — 214 REFERENCES and 214 TRIGGER grants, zero SELECT, zero write. Tagging this
-- to E6 anyway is what detect.security_posture does today, and it is why 305 leaking views
-- have gone days without anyone treating them as a breach: they breached nothing written down.
-- A wrong label costs more than no label, so this carries no label until the owner writes the
-- rule.
insert into public.checker_registry
  (checker_key, title, tier, runs_where, expected_interval, policy_keys, subject_kind,
   fixture_proves_it_fails, fixture_selftest_fn, fixture_positive_case, fixture_negative_case,
   enabled, note)
values
  ('detect.view_rls_ratchet',
   'Views bypassing row-level security may only decrease',
   'detect',
   'cron view-rls-ratchet',
   interval '1 day',
   '{}'::text[],
   'metric',
   true,
   'tg_view_rls_ratchet',
   'select tg_view_rls_ratchet(1) — one view worse than baseline must return FAIL, and must NOT lower the baseline.',
   'select tg_view_rls_ratchet() — a measurement at or below baseline must return PASS.',
   true,
   'Carries no policy_key because no owner rule covers access control on views. That gap is the reason this went unenforced: nothing was breaking a written rule. Raised with the owner 10 Aug 2026.')
on conflict (checker_key) do update set
  title = excluded.title, runs_where = excluded.runs_where,
  expected_interval = excluded.expected_interval,
  fixture_proves_it_fails = excluded.fixture_proves_it_fails,
  fixture_selftest_fn = excluded.fixture_selftest_fn,
  fixture_positive_case = excluded.fixture_positive_case,
  fixture_negative_case = excluded.fixture_negative_case,
  note = excluded.note;

-- 06:34, in the gap between fixture-ratchet at 06:30 and coverage-watch at 06:38, so the three
-- ratchets do not contend. No external call is made, so this touches no API budget.
select cron.schedule('view-rls-ratchet', '34 6 * * *',
                     $$select public.tg_view_rls_ratchet();$$);;
