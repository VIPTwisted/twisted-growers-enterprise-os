-- RULE J6, owner-directed 8 Aug 2026: "make sure this is always double checked by agents
-- and guard know." A guard is the floor. These are the two independent derivations that
-- run beside it, where DISAGREEMENT IS THE FINDING and is never averaged.
insert into verification_checks
  (check_key, title, what_it_proves, source_a_label, source_a_sql, source_b_label, source_b_sql,
   tolerance_pct, severity, owner, enabled, added_on)
values
  ('room-every-held-package-locatable',
   'Every package we hold resolves to a real Metrc room under its own licence',
   'Rule J7: all inventory in our possession must have a known room. Counting packages is not enough - the room must RESOLVE to a Metrc location under that package''s own licence. A package naming a room Metrc does not list under its licence is either mis-filed or in a room that does not exist on that licence, and Massachusetts law requires Metrc to carry the current room for every tagged package.',
   'Packages we hold',
   'select count(*)::numeric from metrc_packages where coalesce((raw->>''Quantity'')::numeric,0) > 0 and coalesce((raw->>''IsFinished'')::boolean,false) = false',
   'Of those, resolving to a Metrc room under their own licence',
   'select count(*)::numeric from metrc_packages p join metrc_locations l on l.name = nullif(btrim(p.raw->>''LocationName''),'''') and l.license = p.license where coalesce((p.raw->>''Quantity'')::numeric,0) > 0 and coalesce((p.raw->>''IsFinished'')::boolean,false) = false',
   0, 'critical', 'Vincent', true, current_date),

  ('room-name-alone-is-not-a-room',
   'A room name alone does not identify a room - the department is required',
   'Rule J7, owner-set 8 Aug 2026. ELEVEN room names exist under BOTH licences as physically different rooms - Finish Vault, Fulfillment Vault, Cure Vault, Dry Room #1 and #2, and more. Measured 8 Aug: 15 real rooms wear 13 names, and 557 of 862 held packages sit in a shared name. THIS CHECK IS EXPECTED TO DISAGREE, and the disagreement is the point: while the two numbers differ, any total grouped by bare room name is a total across two facilities. It returns to agreement only if the site ever stops reusing names - and until then it stands as standing proof that room_qualified must be displayed, never room.',
   'Distinct rooms, counted properly (licence + name)',
   'select count(*)::numeric from (select distinct license, nullif(btrim(raw->>''LocationName''),'''') r from metrc_packages where coalesce((raw->>''Quantity'')::numeric,0) > 0 and coalesce((raw->>''IsFinished'')::boolean,false) = false) x where x.r is not null',
   'Distinct rooms if you trust the name alone',
   'select count(distinct nullif(btrim(raw->>''LocationName''),''''))::numeric from metrc_packages where coalesce((raw->>''Quantity'')::numeric,0) > 0 and coalesce((raw->>''IsFinished'')::boolean,false) = false',
   0, 'elevated', 'Vincent', true, current_date)
on conflict (check_key) do update set
  title = excluded.title, what_it_proves = excluded.what_it_proves,
  source_a_label = excluded.source_a_label, source_a_sql = excluded.source_a_sql,
  source_b_label = excluded.source_b_label, source_b_sql = excluded.source_b_sql,
  tolerance_pct = excluded.tolerance_pct, severity = excluded.severity, enabled = excluded.enabled;;
