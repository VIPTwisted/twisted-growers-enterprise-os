-- Agent: W (Watchdog), 11 Aug 2026.
--
-- WHY. tools/checks/migration-drift.mjs asserts that every version in
-- supabase_migrations.schema_migrations has a matching file in supabase/migrations/.
-- The read-only role the gates connect with (tg_desktop_reader) is refused that schema
-- outright:
--
--     permission denied for schema supabase_migrations
--
-- A gate that cannot read its subject answers DEGRADED forever, and a permanently
-- degraded gate is not a gate. This exposes the two columns the gate needs -- the
-- version and the name -- and nothing else. The statements column is deliberately NOT
-- exposed: migration bodies carry table and column names, seeded values and the
-- occasional literal, and the gate has no use for any of it.
--
-- Same shape as v_cron_health, which exists for the same reason: a schema the reader
-- cannot reach, surfaced read-only through one view in public.
--
-- applied_at is DERIVED from the version, which is a UTC yyyymmddhhmmss stamp. It is a
-- convenience for reading the output, never an authority: if a version were ever not a
-- 14-digit stamp it comes back null rather than guessing.

create or replace view public.v_migration_history as
select m.version,
       m.name,
       case when m.version ~ '^\d{14}$'
            then to_timestamp(m.version, 'YYYYMMDDHH24MISS') at time zone 'UTC'
       end as applied_at
  from supabase_migrations.schema_migrations m;

comment on view public.v_migration_history is
  'Every migration Supabase has recorded as applied, version and name only. Read by '
  'tools/checks/migration-drift.mjs, which fails when production runs a migration the '
  'repository has no file for (standard rule 6). The reader role cannot see the '
  'supabase_migrations schema directly. Owner: Agent W.';

-- Least privilege. The gate runs as tg_desktop_reader; service_role is the platform's own
-- automation. NOT authenticated, NOT anon -- no screen shows this and rule E6 stands.
grant select on public.v_migration_history to tg_desktop_reader;
grant select on public.v_migration_history to service_role;

-- The view runs as its owner ON PURPOSE: that is the whole mechanism, and running as the
-- invoker would restore the permission error it exists to solve. Declared in rls_intent so
-- tg_view_rls_ratchet counts it as a registered exemption rather than new debt. Silently
-- pushing the net count up would be weakening a guard to make room for my own work.
--
-- Intent is 'sealed', on the integration_secrets precedent rather than the
-- v_alert_email_recipients one: admin_only means a signed-in admin can read it, and no
-- signed-in role can read this at all. Only the out-of-band reporting role and the service
-- role hold SELECT. Claiming a wider intent than the grants give would misdescribe the
-- perimeter in the one table that documents it.
--
-- FIRST ATTEMPT WAS REFUSED, and correctly. I wrote intent = 'owner_rights_required',
-- reading `intent` as a free-text justification. rls_intent_intent_check is an enum of
-- three ACCESS LEVELS and threw 23514. The guard was right, my statement was wrong, and
-- nothing about the guard needed loosening -- recorded here because a refusal that gets
-- silently worked around teaches nobody.
insert into public.rls_intent (table_name, intent, reason, declared_on)
values (
  'v_migration_history',
  'sealed',
  'Runs as owner ON PURPOSE: the reader role is refused the supabase_migrations schema, '
  'which is the only place this data exists, so an invoker-rights view would restore the '
  'permission error it was created to solve. No user role holds SELECT -- only '
  'tg_desktop_reader, which the repository gates connect with, and service_role. Carries '
  'no business data and no row-level subject: the version and name of applied migrations, '
  'the same facts a git log shows. There is no policy on the base table to bypass.',
  current_date
)
on conflict (table_name) do nothing;
