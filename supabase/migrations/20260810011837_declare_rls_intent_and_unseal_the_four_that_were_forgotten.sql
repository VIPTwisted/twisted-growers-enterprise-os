-- PHASE 1 OF THE VIEW ACCESS-CONTROL WORK: fix the blocker, and stop the check crying wolf.
--
-- Seven tables have row-level security enabled and NO policy. The standing finding calls all
-- seven a defect. Three of them are the CORRECT terminal state and always were:
--
--   integration_secrets      -- connector credentials. Deny-by-default is the goal, not a bug.
--   security_anon_allowlist  -- the control list for anon exposure.
--   security_grant_snapshot  -- the audit trail of grants.
--
-- Sealing a secrets table is not debt. Reporting it as debt for days is how a register loses
-- its reader: if three of every seven alerts are wrong, the other four stop being believed.
-- The real defect was never "no policy" — it is that NOTHING DECLARED WHICH KIND OF ZERO IT
-- WAS, so a deliberately sealed table and a forgotten one looked identical. Same shape as the
-- 129 pages with no archetype and the empty registers that read as clean.
--
-- WHY THIS IS SAFE TO DO WHILE OTHER AGENTS WORK. All seven are fail-closed RIGHT NOW: nothing
-- can read them through the interface at all. Any policy added here can only WIDEN access, so
-- there is no page to blank and nothing to roll back. The risk is over-widening, so each of the
-- four takes the narrowest grant that is an improvement on today: admin read, nothing else.
-- Writes stay with the service role, which bypasses row-level security, so the crons that fill
-- these tables are unaffected.
--
-- f_caller_is_admin() already exists and is used across the estate. A second identity path is
-- how two answers to "who is this" get shipped, so it is reused rather than reinvented.

create table if not exists public.rls_intent (
  table_name   text primary key,
  intent       text not null check (intent in ('sealed', 'admin_only', 'staff_read')),
  reason       text not null,
  declared_on  date not null default current_date
);
alter table public.rls_intent enable row level security;

comment on table public.rls_intent is
  'Why a table has the policies it has — specifically, why a table with RLS and no policy is '
  'that way. sealed = deny-by-default is the intended terminal state (secrets, security '
  'controls). Without this, a sealed table and a forgotten one are indistinguishable, and the '
  'RLS-no-policy finding reported three false positives out of seven for days.';

insert into public.rls_intent (table_name, intent, reason) values
  ('integration_secrets',     'sealed',
   'Connector credentials. No user role may read this under any circumstance; the service role reaches it out of band. Deny-by-default is the goal.'),
  ('security_anon_allowlist', 'sealed',
   'The control list governing anon exposure. A readable control list is a map of the perimeter.'),
  ('security_grant_snapshot', 'sealed',
   'Forensic record of who held which grant when. Readable only to the service role that writes it.'),
  ('apex_raw',                'admin_only',
   'Raw connector payloads, unnormalised and unredacted. Admin read for debugging; no staff need.'),
  ('dashboard_snapshots',     'admin_only',
   'Cached dashboard figures. Admin read is strictly wider than today (nothing can read it now). Widen to staff_read deliberately if a dashboard is found to read it as a signed-in user.'),
  ('lab_result_values',       'admin_only',
   'Recorded as an orphan table on 8 Aug 2026 — nothing reads it. Admin read until it is either wired or dropped.'),
  ('sentinel_expectation',    'admin_only',
   'Configuration for the sentinel checks. Admin read; the checks themselves run as the service role.')
on conflict (table_name) do update set
  intent = excluded.intent, reason = excluded.reason;

-- rls_intent itself: readable by any signed-in user. It holds no secrets, only the reasons,
-- and a permission register nobody can read is a permission register nobody audits.
create policy rls_intent_staff_read on public.rls_intent
  for select to authenticated using (true);

-- The four that were forgotten. Narrowest improvement on today: admin read only.
create policy apex_raw_admin_read            on public.apex_raw            for select to authenticated using (f_caller_is_admin());
create policy dashboard_snapshots_admin_read on public.dashboard_snapshots for select to authenticated using (f_caller_is_admin());
create policy lab_result_values_admin_read   on public.lab_result_values   for select to authenticated using (f_caller_is_admin());
create policy sentinel_expectation_admin_read on public.sentinel_expectation for select to authenticated using (f_caller_is_admin());;
