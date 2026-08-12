-- 24/7, hourly. Reads ONLY our own mirror and the Postgres catalogue -- it makes no
-- Metrc API calls whatsoever, so the owner's hard rule against flooding the API is
-- untouched. Metrc comparison happens at the existing sync cadence, never here.
--
-- :52 is chosen because :00 :05 :07 :10 :15 :20 :23 :25 :30 :35 :40 :45 and :50 are
-- already taken by other jobs, and a checker that competes with the things it is
-- checking will blame them for its own contention.
select cron.schedule('forensic-auditor', '52 * * * *', $$select public.tg_auditor_pass()$$);

-- The Auditor must appear in its own heartbeat. A watchman nobody watches is the
-- failure this whole design exists to prevent -- verification-suite proved that.
insert into checker_registry
  (checker_key, title, tier, runs_where, expected_interval, fixture_proves_it_fails, policy_keys, note)
values
  ('detect.auditor_self', 'The Forensic Auditor itself', 'detect', 'cron forensic-auditor',
   interval '1 hour', false, '{A3}',
   'Registered so its own silence is visible. It reads only the mirror and pg_catalog; it never calls Metrc.')
on conflict (checker_key) do update
  set expected_interval = excluded.expected_interval, note = excluded.note;;
