# Approved backend and prior-work deployment review

Owner explicitly approved the permission RPCs, menu-write policy and realtime publication on September 12, 2026, and requested deployment of today's GPT work including prior chats.

Applied: 20260912195558_gpt_atomic_permission_matrix. Both RPCs remain SECURITY INVOKER; authenticated EXECUTE is granted, anonymous EXECUTE is refused. The menu-write policy now uses f_caller_is_admin. Realtime publication contains nav_registry, nav_role_visibility, page_permissions and app_users. No business records were modified by applying this migration. Follow-up 20260912205727 sets the save RPC's lock_timeout to 5 seconds, so contention has a bound on each call, not merely during migration application.

The saved-row frontend is retained in PR233. The secure review browser sign-in returned Invalid login credentials. Authenticated UI verification required by CLAUDE.md F2 has not passed; this infrastructure release contains no frontend changes.

PR219's PostgreSQL dependency-rebuild fixture is included from its reviewed head, with cleanup of fixture-created roles so subsequent isolated tests remain independent. It is an isolated structural regression test, not a production operation or dataset certificate.

Earlier releases confirmed merged: PR206 (Apex history evidence), PR217 (quantity precision repair), PR227 (HTTP protections), PR230 (deployment verification), PR231 (anonymous relation access). GitHub main ancestry is checked separately from source certification.

## Data certification limits

Production deployment_check records read on September 12 report: active and inactive population comparisons PASS against September 11 exports; 20 tile/drill disagreements; 14 defective verification checks; in-transit mismatch FAIL; three required Apex entities reported empty; and an unbound facility CERTIFIED label. The most recent sampled measurements are 20:07–20:09 UTC, with the label finding last measured September 11. These are recorded findings, not a fresh independent vendor reconciliation.

The package-freshness check uses row-change time (reported 21 hours); it does not independently prove that API reads have stopped. Earlier empty-history proofs are scoped evidence and do not by themselves settle the three-entity completeness finding. No full current-data certification is asserted, no failing check is relabeled, and no September 11 export is described as a September 12 source snapshot. Credentials were not rotated.
