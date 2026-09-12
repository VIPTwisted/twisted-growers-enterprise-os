# Anonymous relation access repair

At 15:46 UTC, five public relations had SELECT privileges for anon. Two tables also had unconditional PUBLIC select policies, so their row-level security did not prevent anonymous reads. The other three grants were unnecessary even where policies or dependent-table permissions limited access.

Migration 20260912155139 removes all anon privileges from those five named relations. It does not change data, authenticated grants, service-role grants, row policies or credentials. Its postcondition rejects a transaction that leaves anonymous SELECT on a target.

The isolated PostgreSQL fixture proves the original privileges exist, removes them, attempts a real anonymous read and observes permission denial, confirms signed-in reads still work and proves reapplication is safe. The fixture runs in GitHub Gates before other database fixtures. A local PGlite PostgreSQL execution also passed.

Production verification at 15:51:58 UTC returned zero public relations with anonymous SELECT, down from five. SELECT grants for authenticated and service_role remained present on all five targets. No SECURITY DEFINER functions were executable by anon in the separate catalog review. This is not a statement that every invoker function or authenticated policy has been reviewed.

Three public tables still lack RLS. Their existing anon SELECT grants were already absent; authenticated write authorization needs a separate reviewed policy change. The Supabase security advisor was run after the repair. No credential rotation occurred.

Restoration must replay this migration after the earlier baseline snapshot. It deliberately closes access that baseline still records as present at its earlier capture time.
