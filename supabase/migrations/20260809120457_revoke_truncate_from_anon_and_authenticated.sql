/* TRUNCATE WALKS PAST EVERY PROTECTION THIS DATABASE HAS.

   Raised by Agent A as "anon holding TRUNCATE on 35 tables - the largest open
   exposure I'm aware of". Measured before acting, and it is larger:

     anon           146 tables
     authenticated  592 tables

   WHY IT MATTERS MORE THAN A DELETE. watchdog_findings, issue_decisions,
   verification_runs, ai_action_log and brain_correction are append-only forensic
   records protected by a trigger that refuses DELETE. TRUNCATE DOES NOT FIRE ROW
   TRIGGERS. It empties the table without the trigger ever running, so the guard
   that makes those records evidence had a door beside it standing open. On
   7 August watchdog_findings lost 57 rows with no recorded reason - exactly the
   loss this shape of hole produces.

   The SQL guard hook blocked my own DELETE against watchdog_findings tonight,
   correctly. It could not have blocked a TRUNCATE, because nothing was stopping
   one.

   WHY THIS IS SAFE. Nothing in this platform truncates. PostgREST - how the
   browser and every signed-in user reach this database - does not expose
   TRUNCATE at all, so no application path can be using it. Edge functions run as
   service_role, which KEEPS it, as does postgres. What is removed is only a
   browser-facing role's ability to empty a table.

   authenticated is included deliberately, beyond what was reported. anon is the
   loud version because that key ships inside the published JavaScript bundle -
   but a logged-in employee able to empty 592 tables is the same hole with a
   login on it, and no legitimate flow needs it. */
revoke truncate on all tables in schema public from anon;
revoke truncate on all tables in schema public from authenticated;
revoke truncate on all tables in schema public from public;

/* MAKING IT STAY FIXED. Revoking today only fixes today: a table created
   tomorrow would inherit the grant again from default privileges and the hole
   would reopen quietly, one table at a time, with nobody watching.

   Only the postgres path is set here. The same statement for supabase_admin is
   REFUSED - "permission denied to change default privileges" - because this
   connection is not that role. Tables created through the Supabase dashboard
   rather than a migration therefore CAN still reinherit TRUNCATE. Recorded
   rather than left silent; it needs a superuser session to close. */
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;

comment on schema public is
  'TRUNCATE is revoked from anon, authenticated and PUBLIC, and removed from postgres default privileges so migrated tables do not reinherit it. It bypasses row triggers, which is how it walked past the append-only guard on watchdog_findings, issue_decisions and verification_runs. service_role and postgres keep it; nothing browser-facing does. OPEN: default privileges for supabase_admin could not be changed from this connection, so a table created via the dashboard can still reinherit TRUNCATE - needs a superuser session.';;
