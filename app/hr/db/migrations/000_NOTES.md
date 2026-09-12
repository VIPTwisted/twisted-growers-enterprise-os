# DATABASE FUNCTIONS — already applied live to Supabase project zsmdejhgdyyaakqsjhmk

These four RPCs are ALREADY CREATED on the live database (applied via migration during the build
session). They are included here as source-of-truth so the repo matches the live DB.

- 001_pin_login.sql   — PIN auth, returns person + reachable nodes (bcrypt verified server-side)
- 002_scope_data.sql  — roster + shift counts for in-scope nodes (reachability re-verified)
- 003_scope_shifts.sql— live shifts for in-scope nodes

VERIFIED LIVE:
- pin_login rejects wrong PIN / unknown user correctly
- scope_data returns 30 people across all 5 locations for the CEO (ok:true)
- scope_shifts returns all 42 shifts
- CEO reachability = 7 nodes (portfolio → all 5 locations + company), the "1 node" bug is fixed

ALSO DONE LIVE (foundation, separate from these RPCs):
- 32 auth.users created, each linked to its person row with the SAME uuid (auth_user_id = id)
- RLS enabled + 3 policies each on shift_swap_requests, shift_claims, time_off_requests
