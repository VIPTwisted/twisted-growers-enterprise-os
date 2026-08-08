# THE SENTINEL — the watcher that cannot go quiet

**Commissioned by the owner, 7 August 2026, after the Metrc sync was dead for
7 hours 16 minutes while every dashboard reported success.**

---

## Why everything before this failed

| Mechanism | Why it went quiet |
|---|---|
| `tg_sync_review` | Reads `metrc_sync_runs`. A dispatch that produced **no row** does not exist to it. |
| The watchdog | Runs on **Supabase cron** — the same infrastructure as the jobs it watches. `watchdog-am` has **never successfully run**. |
| `alert_outbox` | Correct and append-only — **and no email provider is configured.** It records into a room with no door. |
| Every health function | Reads the same database it is judging. |

**They all share a failure mode with the thing they watch. That is the defect —
not any one of them individually.**

## The one rule the Sentinel obeys

> **It must share NOTHING with the system it watches — not the infrastructure,
> not the code path, not the notification channel — and SILENCE MUST BE
> IMPOSSIBLE.**

If it cannot reach the database, that is a **failure**, not a quiet night. A
dead process cannot report its own death, so the Sentinel is built so that
**not reporting is itself the alarm.**

## Where it runs: GitHub Actions

Not a new service, no new subscription, no new dependency to rot:

- **Different infrastructure.** GitHub, not Supabase. Supabase cron dying does
  not touch it.
- **Different code path.** Plain SQL over the connection string — none of the
  edge functions, RPCs, views or hooks it is judging.
- **Delivery is already solved and free.** **GitHub emails watchers when a
  workflow fails.** No email provider, no `alert_outbox`, no SMTP — the one
  thing that has never worked is the one thing this does not need.
- **Version controlled.** The assertions live in the repo, reviewable, with
  history.

## The assertions — every one a yes/no, every failure loud

**Any single failure fails the whole run and sends the email.**

### 1 · Dispatched but nothing came back — *the gap that hid today's outage*
Every `metrc_scan_schedule` job dispatched in the last 3 hours must have
produced a `metrc_sync_runs` row within 5 minutes of dispatch.
**Today: 13 dispatches, 1 run. This assertion alone catches it in 20 minutes.**

### 2 · Agent heartbeats
Every enabled `agent_registry` row must have a row in its `evidence_table`
inside `expected_every_mins × 2`. Null evidence table = report as unprovable,
never as healthy.

### 3 · Cron itself is alive
Every active `cron.job` with a schedule due in the window must appear in
`cron.job_run_details` with `succeeded = true`.
**Today: `watchdog-am` 2 of 2 failed; `refresh-tower-inventory` 9 of 18.**

### 4 · Data freshness against declared limits
Manifests 3h · packages 8h · cultivation 16h · reference 48h · dashboards 1h ·
canary 1h. *(From [RUNBOOK_RECOVERY.md](RUNBOOK_RECOVERY.md).)*
**Today: plants 50.6h, harvests 22.7h.**

### 5 · Security has not reopened
`anon` readable relations = 0 · anon-executable writing functions = 0 ·
tables without RLS = 0 · `ddl_guard_log` unresolved older than 24h = 0.
**Today: 13 unresolved, up from 5 that morning.**

### 6 · Append-only tables never shrink
Row counts for the seven forensic tables must be **≥** the previous run's,
stored as an artifact. **`watchdog_findings` once went 100 → 43 via a
migration, with no DELETE.**

### 7 · The verification checks actually ran
`verification_runs` must have a row in the last 24h.
**Today: last run 12:32, and nobody has ever read the results.**

### 8 · The Sentinel itself is honest
Record its own run. **If the previous run is older than 2× its interval, that
is a failure** — the switch checking the switch.

## The dead man's clause — what makes it nuclear

**Any of these fails the workflow:** an assertion returns false · the database
is unreachable · the query times out · the credential is rejected · the
workflow errors for any reason at all.

**There is no path where the Sentinel runs and says nothing.** It either passes
every assertion or it emails. **And if GitHub itself stops running it, the
absence of the daily green run is the signal** — which is why it also posts a
heartbeat row the platform can display: *"Sentinel last passed 14 minutes ago."*

## Security — read-only, and say so plainly

It needs a database credential in GitHub secrets. **Create a dedicated
read-only role** — `SELECT` on the tables it asserts against, nothing else. Not
the service key, not the postgres user.
⚠ **Do not reuse the shared admin key** that currently sits in
`tools/pushreports.py` and bypasses the executive check on every Metrc
function. That is a separate finding and it must not be extended.

## Implementation — one workflow, one SQL file

`.github/workflows/sentinel.yml` — `schedule: cron: "*/20 * * * *"`, plus
`workflow_dispatch`. Steps: checkout · install `psql` · run
`supabase/checks/sentinel.sql` against `${{ secrets.SENTINEL_DB_URL }}` · the
SQL raises an exception naming the first failed assertion, which exits non-zero
and fires the email.

**Rules it obeys:** read-only, `SELECT` only · never writes except its own
heartbeat row · **never fixes anything** — it wakes a human, and that is the
whole job.

## Lane

**CI and `.github/**` belong to the watchdog lane.** Agent D wrote this spec and
the assertions; **placing the workflow and issuing the read-only credential is
the watchdog's call.** Agent D has already crossed one lane boundary today and
is not crossing another.

## What it would have caught today, in order
1. Metrc sync dead 7h16m — **assertion 1, within 20 minutes**
2. `watchdog-am` never once successful — **assertion 3, on the first run**
3. Plants 50.6 hours stale — **assertion 4**
4. `ddl_guard` unresolved 5 → 13 — **assertion 5**
5. Verification checks unread since 12:32 — **assertion 7**

**Five of today's findings, none of which needed a human to ask.**
