/* Register, schedule and ratchet the six assertions. Agent W, 13 Aug 2026.

   Two cron jobs, not one, and the split is the point:
     assert-run   runs the assertions against production, hourly.
     assert-prove re-proves both fixture halves, daily.
   The runner refuses to report PASS for an assertion whose fixture has not been
   proved in 7 days, so if assert-prove ever dies the assertions go to ERROR
   rather than quietly reporting green. A check whose own test has stopped
   running is exactly the state this platform keeps discovering after the fact. */

insert into ratchet_baseline (metric_key, baseline, set_by, what_it_counts, note)
values (
  'primitive_redefinitions', 6, 'agent-w 13 Aug 2026',
  'Objects in public that decide a registered primitive themselves instead of calling its one '
  'canonical definition, counted by data_assertion schema.one_definition_per_registered_primitive.',
  'All six are re-derivations of fresh_frozen. mv_harvest_dry_stats and v_dry_time_discipline '
  'use the regex \mFF\M; v_moisture_accounting, v_production_tracker, v_real_loss_v2 and '
  'v_strain_performance use ilike ''%FF%'', which wrongly classifies 18 dried harvests as fresh '
  'frozen because Souffle and Muffin contain the letters ff. Two further copies existed in '
  'v_harvest_takedown and v_moisture_loss_register and were collapsed on 13 Aug, so this began '
  'at 8. flower_room is already at zero. The count may fall and may never rise.')
on conflict (metric_key) do nothing;

insert into checker_registry
  (checker_key, title, tier, runs_where, expected_interval, subject_kind,
   fixture_proves_it_fails, enabled, fixture_selftest_fn,
   fixture_positive_case, fixture_negative_case, note)
values
('assert.harvest.flower_room_column_matches_its_generator',
 'metrc_harvests.flower_room still equals what its generator returns',
 'detect', 'cron assert-run', '1 hour', 'data',
 true, true, 'f_prove_data_assertion(''harvest.flower_room_column_matches_its_generator'')',
 'A row whose name says F2 while the stored column says F1 — what CREATE OR REPLACE on the '
 'generator leaves behind, since Postgres never recomputes existing rows.',
 'The eight 2024 harvests with no room in the name: function NULL, column NULL, and the '
 'lower-case and spaced spellings the parse legitimately accepts.',
 'Proved on production 13 Aug 2026: replacing the generator inside a rolled-back transaction '
 'took the violation count from 0 to 372 while the 8 room-less rows correctly stayed quiet.'),

('assert.harvest.ordinal_match_in_step',
 'The nth-pull-to-nth-takedown match has not slipped',
 'detect', 'cron assert-run', '1 hour', 'data',
 true, true, 'f_prove_data_assertion(''harvest.ordinal_match_in_step'')',
 'A room with three takedowns against two past-due pulls, and a matched pair 60 days apart.',
 'Divergences of 8, 20 and 26 days — 26 is the largest that exists in production — and a room '
 'with four pulls of which two are still in the future.',
 'Bound of 45 days is measured, not chosen: largest real divergence 26 days, shortest observed '
 'room cycle 59 days, so nothing legitimate lands between.'),

('assert.harvest.no_unmatched_takedown',
 'Every recorded takedown belongs to a planned pull',
 'detect', 'cron assert-run', '1 hour', 'data',
 true, true, 'f_prove_data_assertion(''harvest.no_unmatched_takedown'')',
 'A room with one planned pull and two takedowns; the second matches no ordinal and a plain '
 'inner join would drop it from every surface.',
 'A room with four pulls, two still in the future, against two takedowns — more pulls than '
 'takedowns is the normal state of a plan year and must never fire.',
 null),

('assert.harvest.no_room_stands_past_its_pull',
 'No flower room is past its scheduled pull with no takedown',
 'detect', 'cron assert-run', '1 hour', 'data',
 true, true, 'f_prove_data_assertion(''harvest.no_room_stands_past_its_pull'')',
 'A room 31 days past its scheduled pull with no takedown — F4''s exact position on 13 Aug '
 '2026, which the old view published as "3 days early".',
 'A pull still in the future; a pull one day past and inside the owner''s two-day tolerance; '
 'and a pull a hundred days back that DID come down, 26 days late.',
 'Failing on production from the first run: F1 18 days, F2 3 days, F4 31 days. That is the '
 'check working, not the check being wrong.'),

('assert.harvest.compliance_surfaces_agree',
 'v_schedule_compliance and v_harvest_plan_vs_actual agree pull for pull',
 'detect', 'cron assert-run', '1 hour', 'data',
 true, true, 'f_prove_data_assertion(''harvest.compliance_surfaces_agree'')',
 'One pull whose actual date differs by six days between the surfaces, and one pull present '
 'on only one of them.',
 'Two pulls agreeing exactly with NULL actual_date on both sides, plus the Dry rows whose '
 'pull_no is always NULL — dropping the event_type filter would report a wall of phantoms.',
 null),

('assert.schema.one_definition_per_registered_primitive',
 'Each registered primitive has exactly one definition in the schema',
 'detect', 'cron assert-run', '1 hour', 'schema',
 true, true, 'f_prove_data_assertion(''schema.one_definition_per_registered_primitive'')',
 'A view writing the fresh-frozen test out by hand instead of calling the canonical function '
 '— what v_harvest_takedown did on the day that function was created to prevent it.',
 'The canonical definition itself; a recorded exemption; a view that correctly CALLS the '
 'function; and the live strings ''%Affiliated%'' and ''VALUE DIFFERS%'' plus a help message '
 'quoting "F2 FF" in prose — every one of which an earlier draft of the marker flagged.',
 'Ratcheted at 6 in ratchet_baseline.primitive_redefinitions. The seventh fails immediately.'),

('assert.engine',
 'The data_assertion engine: every enabled assertion re-proves both fixture halves',
 'prevent', 'cron assert-prove', '1 day', 'checker',
 true, true, 'f_prove_all_data_assertions()',
 'An assertion whose fixture schema is missing a shadowed relation, or whose positive half '
 'returns zero rows — both mean the fixture silently read production and proved nothing.',
 'An assertion whose planted defect fires and whose legitimate case stays quiet is passed '
 'through untouched; the gate must not obstruct a correctly evidenced assertion.',
 'trg_require_assertion_fixture refuses to enable an assertion without both halves named, '
 'and tg_run_data_assertions refuses to report PASS on a fixture unproved for 7 days.')
on conflict (checker_key) do update set
  title = excluded.title, runs_where = excluded.runs_where,
  fixture_selftest_fn = excluded.fixture_selftest_fn,
  fixture_positive_case = excluded.fixture_positive_case,
  fixture_negative_case = excluded.fixture_negative_case,
  fixture_proves_it_fails = excluded.fixture_proves_it_fails,
  note = excluded.note;

select cron.schedule('assert-run',   '25 * * * *',
                     $$select count(*) from tg_run_data_assertions(null,'cron:assert-run')$$);
select cron.schedule('assert-prove', '40 6 * * *',
                     $$select count(*) from f_prove_all_data_assertions('cron:assert-prove')$$);
;
