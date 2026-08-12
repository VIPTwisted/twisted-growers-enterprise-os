-- Every finding gets an owning agent and a deadline, decided by ROWS not code (rule G1).
-- Built because 1,330 of 1,330 open discrepancies and 947 of 947 open agent findings
-- had no owner and no state record. The machinery existed; nothing was connected to it.

create table if not exists finding_route (
  route_key        text primary key,
  applies_to       text not null check (applies_to in ('agent','watchdog','custody','inventory','*')),
  match_department text,                       -- null = any
  match_pattern    text,                       -- regex against the headline; null = any
  owning_agent     text not null references agent_registry(agent_key),
  human_owner      text,                       -- who the agent escalates to
  hours_critical   integer not null check (hours_critical  > 0),
  hours_elevated   integer not null check (hours_elevated  > 0),
  hours_watch      integer not null check (hours_watch     > 0),
  priority         integer not null default 100,   -- lower wins; ties broken by route_key
  why              text not null check (length(btrim(why)) >= 20),
  enabled          boolean not null default true,
  added_on         date not null default current_date
);
alter table finding_route enable row level security;

create policy finding_route_read on finding_route for select to authenticated using (true);
create policy finding_route_write on finding_route for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

-- finding_state exists and already enforces a reason on closure and an expiry on
-- suppression. What it cannot do is name an owner, run a clock, or say which pile
-- the key came from.
alter table finding_state add column if not exists source        text;
alter table finding_state add column if not exists owning_agent  text references agent_registry(agent_key);
alter table finding_state add column if not exists due_by        timestamptz;
alter table finding_state add column if not exists routed_by     text;
alter table finding_state add column if not exists routed_at     timestamptz;
alter table finding_state add column if not exists route_key     text references finding_route(route_key);

comment on column finding_state.due_by is
  'When this must be worked by. Set from finding_route at routing time using the '
  'severity as it stood then. A finding past due_by appears in v_guard_queue and '
  'cannot be quietly ignored.';;
