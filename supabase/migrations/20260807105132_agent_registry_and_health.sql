/* CHECKS AND BALANCES FOR EVERY AGENT
   -----------------------------------
   Agents run on this platform with nothing watching them. The sales sync has
   failed 237 times in a row without raising a single alert. The manufacturing
   licence fails 45% of its syncs. Nobody knew, because an agent that stops
   working looks exactly like an agent with nothing to report.

   Silence is the failure mode. This registry makes it impossible: every agent
   declares what it watches, how often it must run, and who owns it. Anything
   that misses its window is reported as OVERDUE - which reads completely
   differently from "no problems found".

   Excludes the report-mapping agent, which the other agent is covering.

   Additive: a registry table and a health view. No agent is altered. */

create table if not exists agent_registry (
  agent_key            text primary key,
  display_name         text not null,
  kind                 text not null,          -- sync | watcher | maintenance
  what_it_watches      text not null,
  why_it_matters       text not null,
  owner                text not null default 'Vincent',
  expected_every_mins  integer,                -- null = on demand only
  evidence_table       text,                   -- where its work shows up
  verified_by          text,                   -- how we prove it is right
  enabled              boolean not null default true,
  added_on             date not null default current_date
);
alter table agent_registry enable row level security;
drop policy if exists ar_read on agent_registry;
create policy ar_read on agent_registry for select to authenticated using (true);
drop policy if exists ar_write on agent_registry;
create policy ar_write on agent_registry for all to authenticated
  using (exists (select 1 from app_users u where u.user_id=auth.uid()
                 and u.role = any (array['owner'::app_role,'executive'::app_role])))
  with check (exists (select 1 from app_users u where u.user_id=auth.uid()
                 and u.role = any (array['owner'::app_role,'executive'::app_role])));
grant select on agent_registry to authenticated;
grant insert, update, delete on agent_registry to authenticated;

insert into agent_registry
 (agent_key, display_name, kind, what_it_watches, why_it_matters, expected_every_mins, evidence_table, verified_by)
values
 ('sync:transfers','Manifests sync','sync','Every incoming and outgoing manifest in Metrc',
  'Manifests are how product legally leaves and enters. A gap here means sales history with holes.',
  60,'metrc_transfers','count of manifests against Metrc facility metrics'),
 ('sync:packages','Packages sync','sync','Every package and its testing state',
  'Packages are the sellable unit. Stale package data means wrong stock on hand everywhere.',
  180,'metrc_packages','package count against Metrc facility metrics'),
 ('sync:cultivation','Cultivation sync','sync','Plants, harvests and plant batches',
  'Every yield, cycle and capacity figure starts here.',
  480,'metrc_harvests','harvest count and plant count against the Metrc export'),
 ('sync:deliveries','Customer names sync','sync','Who received each outgoing manifest',
  'Without recipients there is no customer history, no demand signal and no margin by customer.',
  480,'metrc_transfers','manifests with a recipient against manifests total'),
 ('sync:reference','Reference data sync','sync','Items, strains and locations',
  'The names everything else is grouped by. Wrong here and every report mislabels.',
  1440,'metrc_items','row counts against Metrc'),
 ('sync:sales','Sales sync','sync','Metrc sales receipts',
  'Currently disabled and has never succeeded - 237 consecutive authorisation failures.',
  1440,'metrc_sales','receipt count against Metrc'),
 ('watch:allocation','Allocation control','watcher','Material with no approved destination',
  'Unallocated material is product nobody has decided what to do with.',
  1440,'agent_findings','spot-check a sample against the packages table'),
 ('watch:cash','Cash velocity','watcher','Ageing stock and money sitting still',
  'Stock that does not move is cash that does not move.',
  1440,'agent_findings','ageing recomputed from package dates'),
 ('watch:compliance','Compliance watch','watcher','Metrc compliance flags',
  'These threaten the licence, which outranks every cash figure.',
  1440,'agent_findings','flag count against Metrc'),
 ('watch:room','Room turnaround','watcher','Room cycle time against the 56-day standard',
  'Every day over 56 costs roughly a fifth of a pull a year.',
  1440,'agent_findings','cycle length recomputed from harvest_start dates'),
 ('watch:schedule','Schedule discipline','watcher','Pulls against the harvest calendar',
  'Late pulls compound - every room is now 25 days behind.',
  1440,'agent_findings','actual cut dates against harvest_plan_2026'),
 ('watch:loss','Loss and yield','watcher','Waste, shrink and yield per plant',
  'The largest single dollar figure on the platform.',
  1440,'agent_findings','waste percentages recomputed from harvest weights'),
 ('watch:sales','Sales, Orders and Fulfilment','watcher','Orders and shipment follow-through',
  'Where revenue is either collected or quietly lost.',
  1440,'agent_findings','manifests against invoices'),
 ('watch:watchdog','Forensic watchdog','watcher','Narrative findings across the whole business',
  'The only agent that writes a full who/what/when/why finding.',
  720,'watchdog_findings','findings re-derived from source on demand'),
 ('watch:custody','Custody and chain of custody','watcher','Compliance flags straight from Metrc',
  '63 open flags that no page currently reads.',
  1440,'custody_alert_log','flag count against Metrc'),
 ('watch:inventory','Inventory alerts','watcher','Storage limits, ageing and testing position',
  'Carries real dollar and pound figures - one of only two agents that does.',
  1440,'inventory_alerts','limits recomputed from the storage limits page'),
 ('maint:canary','Page canary','maintenance','All 236 page data sources',
  'Tells a broken page from an empty one. Nothing else does.',
  20,'canary_runs','self-evident - it reports its own counts'),
 ('maint:dashboards','Dashboard refresh','maintenance','Materialised dashboard views',
  'A stale dashboard is a wrong dashboard.',
  10,null,'matview age against now()')
on conflict (agent_key) do nothing;

comment on table agent_registry is
  'Every agent on the platform, what it watches, how often it must run, and how we prove it is right. Excludes the report-mapping agent (covered separately).';;
