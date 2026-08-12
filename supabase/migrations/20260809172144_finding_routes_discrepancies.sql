alter table finding_route drop constraint if exists finding_route_applies_to_check;
alter table finding_route add constraint finding_route_applies_to_check
  check (applies_to in ('agent','watchdog','custody','inventory','discrepancy','*'));

insert into finding_route
  (route_key, applies_to, match_department, match_pattern, owning_agent,
   hours_critical, hours_elevated, hours_watch, priority, why)
values
  ('disc.strain','discrepancy','strain',null,'watch:compliance',
    8,72,336,20,'A strain disagreement with Metrc is a mirror fault against the legal record under rule D1.'),
  ('disc.ownership','discrepancy','ownership',null,'watch:custody',
    8,48,168,20,'Ownership disagreements are chain-of-custody questions and belong with custody.'),
  ('disc.missing_contents','discrepancy','missing_contents',null,'watch:custody',
    8,48,168,20,'A package whose contents cannot be accounted for is a custody matter first.')
on conflict (route_key) do update
  set owning_agent = excluded.owning_agent, why = excluded.why;;
