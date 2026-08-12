-- Routes written from the ACTUAL headlines in the register, not from imagined ones.
-- Priority matters: a brain-staleness item often mentions certificates, so it must be
-- claimed by the brain rule before the documents rule sees it.
insert into finding_route
  (route_key, applies_to, match_department, match_pattern, owning_agent,
   hours_critical, hours_elevated, hours_watch, priority, why)
values
  ('wd.security','watchdog',null,
    '(anonymous|security definer|visible to a role|search_path|reachable without signing in)',
    'watch:watchdog', 4,24,168, 5,
    'Access-control findings are Watchdog''s own lane and the shortest clock in the system.'),
  ('wd.brain_stale','watchdog',null,'brain states a figure',
    'watch:watchdog', 24,168,336, 8,
    'A stale brain figure misleads every agent that reads it, but it is documentation not product.'),
  ('wd.sync_failing','watchdog',null,'sync ".*" is failing',
    'watch:compliance', 8,48,168, 10,
    'A failing Metrc sync means the mirror is drifting from the legal record under rule D1.'),
  ('wd.agent_silent','watchdog',null,
    '(never ran|overdue|stopped speaking|silent|scheduled job)',
    'watch:watchdog', 8,48,168, 12,
    'An agent that is not running cannot find anything, so its silence hides every finding beneath it.'),
  ('wd.agreement','watchdog',null,'two different values in two independent sources',
    'watch:watchdog', 8,48,168, 12,
    'Two sources disagreeing on one fact is the house verification failure and Watchdog adjudicates it.'),
  ('wd.tiles','watchdog',null,'(countable tile|email alerts are queued)',
    'watch:watchdog', 24,72,336, 18,
    'A tile that does not equal its own drill is the false-green pattern and breaks trust in every number.'),
  ('wd.documents','watchdog',null,
    '(certificate of analysis|\bcoa\b|total thc|manifest document|potency|could not be parsed)',
    'documents:parse', 24,72,336, 15,
    'Document-parsing gaps are the parser agent''s evidence base and it is the only thing that can close them.'),
  ('wd.metrc_mirror','watchdog',null,
    '(metrc|manifest|package|shipped|transferred|received)',
    'watch:compliance', 8,48,168, 20,
    'Mirror disagreements against Metrc are compliance matters because Metrc is the legal record.')
on conflict (route_key) do update
  set match_pattern = excluded.match_pattern,
      owning_agent  = excluded.owning_agent,
      priority      = excluded.priority,
      why           = excluded.why;;
