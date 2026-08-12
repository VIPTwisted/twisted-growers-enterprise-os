-- Human owners are taken from finding_owners where a real name exists. Where none
-- does, human_owner stays null rather than being invented (rule A1/A5). The guard
-- queue reports unowned routes so the gap is visible instead of papered over.
insert into finding_route
  (route_key, applies_to, match_department, match_pattern, owning_agent, human_owner,
   hours_critical, hours_elevated, hours_watch, priority, why)
select v.route_key, v.applies_to, v.match_department, v.match_pattern, v.owning_agent,
       o.owner_name, v.hc, v.he, v.hw, v.prio, v.why
from (values
  -- Compliance and custody carry the legal record, so their clock is the shortest.
  ('custody.compliance','custody','Compliance',null,'watch:custody',
    8,48,168,10,'Chain of custody is the legal record; a critical here is a same-day matter under rule D1.'),
  ('agent.compliance','agent','Compliance watch',null,'watch:compliance',
    8,48,168,10,'Compliance findings bear on the licence and cannot wait a working week.'),
  ('agent.metrc','agent','Metrc & Compliance',null,'watch:compliance',
    8,48,168,10,'Metrc is the legal record; a mirror disagreement is a compliance matter, not a data chore.'),
  -- Operational watchers.
  ('agent.allocation','agent','Allocation control',null,'watch:allocation',
    24,72,336,50,'Allocation errors move real product between commitments and compound if left.'),
  ('agent.cash','agent','Cash velocity',null,'watch:cash',
    24,72,336,50,'Ageing receivables lose value with every day they are not chased.'),
  ('agent.room','agent','Room turnaround',null,'watch:room',
    24,72,336,50,'Room turnaround drives the whole cultivation calendar downstream.'),
  ('agent.loss','agent','Loss and yield',null,'watch:loss',
    24,72,336,50,'Yield loss is either a real loss or a recording error, and both need the grower.'),
  ('agent.schedule','agent','Schedule discipline',null,'watch:schedule',
    24,72,336,50,'Schedule slip is the earliest visible signal that a later harvest will miss.'),
  ('agent.sales','agent','Sales, Orders & Fulfillment',null,'watch:sales',
    24,72,336,50,'Order and fulfilment gaps reach the customer before they reach a report.'),
  ('agent.qa','agent','QA & Independent Verification',null,'watch:watchdog',
    24,72,336,50,'Verification failures are reviewed by the forensic watcher, not by the agent that failed.'),
  ('inventory.quality','inventory','Quality',null,'watch:inventory',
    24,72,336,50,'Quality holds block product from sale and must be cleared or acted on.'),
  ('inventory.control','inventory','Inventory control',null,'watch:inventory',
    24,72,336,50,'Inventory control findings mean the counted position and the recorded one differ.'),
  ('inventory.lab','inventory','Laboratory',null,'documents:parse',
    24,72,336,50,'Laboratory findings trace back to a certificate, which is the parser''s evidence base.'),
  -- Catch-all. Deliberately LAST and deliberately visible: anything landing here has
  -- no real route yet, and v_guard_queue reports it as a routing gap to be fixed.
  ('catchall','*',null,null,'watch:watchdog',
    24,72,336,999,'No specific route matched. This is a routing gap, reported as such, not a home.')
) as v(route_key, applies_to, match_department, match_pattern, owning_agent,
       hc, he, hw, prio, why)
left join finding_owners o on o.department = v.match_department
on conflict (route_key) do update
  set owning_agent = excluded.owning_agent,
      hours_critical = excluded.hours_critical,
      hours_elevated = excluded.hours_elevated,
      hours_watch    = excluded.hours_watch,
      priority       = excluded.priority,
      why            = excluded.why;;
