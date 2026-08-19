# Durable Crash and Preference Receipts — 19 August 2026

## Outcome

The browser no longer promises that a crash was recorded until Supabase returns
the durable `watchdog_findings.id`. Failed incident writes are shown as failures
with a retry. Account, Settings, TG Brain, and Budz preference writes no longer
discard database errors or claim success after a rejected write.

## Files and behavior

### `supabase/migrations/20260819191528_client_crashes_need_a_durable_receipt.sql`

**Problem before:** `tg_log_client_error` returned void. The fingerprint trigger
also swallows a repeated insert and updates the existing finding, so a basic
`INSERT ... RETURNING` solution would return no row for a repeated crash.

**Change:** `tg_log_client_error_receipt` returns `finding_id`, `run_id`, and
`recorded_at`. If the trigger handles a duplicate, the function re-selects the
existing finding by its exact fingerprint and refuses success without an ID.
The old function remains as a compatibility wrapper. Both functions are
security-definer with a fixed search path, denied to `anon`, and executable by
`authenticated`.

**Behavior now:** the first crash and a repeated crash both receive the durable
finding ID. A rollback-only live test proved the repeated path returns the same
finding ID and left no test finding behind.

### `app/web/src/App.jsx`

**Problem before:** both error boundaries stated that reporting succeeded while
the RPC deliberately discarded success and failure. Global theme/sidebar saves,
Settings canvas saves, Settings avatar-row saves, and TG Brain role/memory saves
also ignored one or more write errors.

**Change:** crash reporting now shares one capped promise per fingerprint and
renders pending, saved-with-ID, or failed-with-retry states. Preference errors
raise a visible shell alert without changing the top menu. Settings reverts a
canvas change when its account write fails; avatar and TG Brain success copy is
shown only after a successful write.

**Behavior now:** an RPC failure says “The incident was not recorded” and offers
retry. A successful crash says, for example, “Recorded as finding #1234.” A
theme that applies locally but fails remotely is labelled device-only, not saved
to the account.

### `app/web/src/budz.jsx`

**Problem before:** pet placement, enablement, and notification writes swallowed
errors. `UPDATE` could also affect zero rows for a user with no settings row.

**Change:** Budz preferences upsert the user row, surface authentication and
database errors through the shell, and roll back a notification toggle when its
write is rejected.

**Behavior now:** Budz can remain responsive while dragging, but a failed
cross-device save is visibly disclosed. Notification controls return to their
previous state instead of displaying an unsaved choice.

### `tools/checks/error-boundaries.mjs`

**Change:** the existing guard now requires the receipt RPC, the finding ID,
duplicate-trigger handling, authenticated-only grants, explicit failure UI, and
the absence of unconditional “recorded” copy.

### `tools/checks/preference-integrity.mjs`, `package.json`, `.github/workflows/ci.yml`

**Change:** a new deploy guard protects error handling for account preferences,
Settings, TG Brain, and Budz. It runs in both GitHub Actions and Netlify.

## Scope protection

The top-menu markup and behavior are unchanged. `tgworkspace.jsx`, the ClickUp
clone, navigation registry, report registry, schedules, business figures, and
source-system data are unchanged.

## Still open

- This release protects the preference paths named above. The broader forensic
  audit still contains unrelated read sites and writes that need their own
  small releases.
- Existing Supabase security and performance advisor backlogs predate this
  migration and remain open; they were not silently bundled into this slice.
