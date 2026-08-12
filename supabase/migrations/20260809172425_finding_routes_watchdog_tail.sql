insert into finding_route
  (route_key, applies_to, match_department, match_pattern, owning_agent,
   hours_critical, hours_elevated, hours_watch, priority, why)
values
  -- Silence read as health. Twelve of these are open right now.
  ('wd.sync_silent_success','watchdog',null,'reports success but returns no records',
    'watch:compliance', 8,48,168, 9,
    'A sync reporting success while returning nothing is the false-green pattern and hides a broken mirror.'),
  ('wd.config_unevidenced','watchdog',null,'(provisional and has no evidence|no evidence behind it)',
    'watch:watchdog', 24,72,336, 22,
    'A threshold nobody can evidence is a number we invented, which rule A1 forbids relying on.'),
  -- Everything else phrased as a verification failure, once the specific rules above
  -- have taken theirs. Watchdog adjudicates the house two-source check.
  ('wd.verification','watchdog',null,'the two sources disagree',
    'watch:watchdog', 8,48,168, 25,
    'A two-source disagreement is the house verification failure and Watchdog is the adjudicator of it.'),
  -- PROVISIONAL. Laboratory turnaround has no owning agent anywhere in the registry.
  -- Compliance takes it because untested product cannot be sold, but this is the
  -- closest fit rather than the right one, and it is reported to the owner as a gap.
  ('wd.lab_turnaround','watchdog',null,'laboratory turnaround',
    'watch:compliance', 24,168,336, 30,
    'PROVISIONAL OWNER: no laboratory agent exists. Compliance holds it because untested product cannot be sold.')
on conflict (route_key) do update
  set match_pattern = excluded.match_pattern,
      owning_agent  = excluded.owning_agent,
      priority      = excluded.priority,
      why           = excluded.why;;
