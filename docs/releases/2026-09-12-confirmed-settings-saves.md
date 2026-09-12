# Confirmed settings saves and atomic permissions — awaiting approval

Status: proposed code, not deployed. Production migration was rejected by automatic approval review on 12 September 2026. No retry or indirect application is authorized by that rejection. Do not merge or deploy until the production authorization changes are approved, the migration is applied and stamped to its actual version, and authenticated UI verification satisfies CLAUDE.md F2.

## Changes

Preference, profile, user and menu saves validate the row returned by PostgreSQL, including its identity and requested values. A zero-row write or a mismatched response is an error. Preference requests from one hook are serialized and stale account responses are ignored. Failed saves remain visible.

Permissions uses one transactional RPC for page actions and menu visibility. The revision read when editing is compared under table locks with the current revision; stale edits are rejected. Both writes roll back together and returned values are checked by both the server and client. The matrix RPC aggregates the complete role configuration, avoiding API row limits.

Configuration subscriptions refresh signed-in navigation and page gates. Focus, reconnection and a 60-second poll recover missed notifications. Subscription cleanup and response cancellation prevent stale account reads. Background refresh retains the existing UI while the read completes. This does not certify all platform tables or workflows as realtime.

## Exact production approval requested

- Create `f_permission_matrix(text)` and `f_save_permission_matrix(text,text,jsonb)` as SECURITY INVOKER functions; grant EXECUTE to `authenticated`, revoke it from PUBLIC and `anon`. Existing table RLS still applies. The write RPC additionally requires `f_caller_is_admin()` to return true.
- Align `nav_role_visibility.nrv_write` with the existing governed `f_caller_is_admin()` capability already used by page_permissions. This changes which authenticated roles can write menu visibility and requires explicit approval.
- Add exactly `nav_registry`, `nav_role_visibility`, `page_permissions` and `app_users` to `supabase_realtime`. Subscribers remain subject to SELECT policies. App-users subscriptions filter to the current account, but the filter is not a security boundary: the table's existing RLS controls accessible rows.
- Permission saves take SHARE ROW EXCLUSIVE locks on the two permission tables, with a 5-second lock timeout and 30-second statement timeout. Contending edits can fail visibly and require retry. No business records or credentials are changed by migration application.

All four production tables were verified to have primary keys. The migration file currently carries its CLI-generated proposal timestamp. After authorized application, rename it and the fixture reference to the actual Supabase migration version and recompute the migration-tree pin before merging.

## Validation and limits

The isolated PostgreSQL fixture verifies authenticated reads, admin-only writes, stale-revision rejection, malformed input rejection, rollback when the second table refuses its write, anonymous denial, and the four publication memberships. It passes using PGlite; CI runs the same fixture against PostgreSQL 17. Unit tests validate complete and mismatched receipts, one-RPC saves, serialized writes, subscription filters, debounce, recovery and cleanup.

Signed-in browser verification is still outstanding because the available site tab is at Sign in. Use the secure browser authentication flow; do not request credentials in chat. The authenticated UI and realtime behavior must be inspected before deployment. The proposed RPCs have not been called or applied in production.

Previously deployed separately: PR230 repaired deployment evidence checks; PR231 removed anonymous SELECT access from the five identified relations. Three existing public relations without RLS and broader platform work remain outside this proposed change. This report is not whole-platform completion certification.
