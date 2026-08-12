-- Removing two throwaway views created minutes ago to prove the extended DDL guard works:
--   zz_guard_probe_secure  over company_licenses, which has policies   -> auto-secured
--   zz_guard_probe_debt    over dashboard_snapshots, RLS but no policy -> left alone, logged
-- Both behaved exactly as designed, so the view guard is proven in both directions.
--
-- E1 blocked the first attempt at this cleanup, and it blocked ME, three times. Following the
-- guard's own prescribed path rather than routing around it: dependents proven to be zero for
-- both views via pg_depend joined through pg_rewrite, then the declared escape below.
-- Justification: test fixtures minutes old, nothing reads them, and debris left in a
-- production schema becomes an object nobody later dares touch.
set local tg.allow_drop = 'yes';
drop view public.zz_guard_probe_secure;
drop view public.zz_guard_probe_debt;;
