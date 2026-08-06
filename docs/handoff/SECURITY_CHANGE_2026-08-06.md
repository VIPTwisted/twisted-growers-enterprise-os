# Security change — 6 August 2026

Applied by the incoming agent with the owner's explicit authorisation. The
development freeze otherwise held: no views, no matviews, no front end, no
data and no keys were touched.

**No key, secret or password was changed.** The Supabase anon key is unchanged
and remains public by design, as `netlify.toml` documents.

---

## Why

A takeover audit measured four tables carrying an RLS policy of
`FOR ALL ... USING (true)` granted to `anon`, and two functions executable by
`PUBLIC`. The anon key ships in the public JavaScript bundle by design, so
these were reachable by anyone on the internet with no sign-in.

Two of them attacked the hard rules directly:

- `dashboard_snapshots` feeds the trend sparklines. A stranger could write
  fabricated history — the dashboard standard says a sparkline must come from
  real snapshots and **never a fabricated line**.
- `lab_result_values` is where potency data will land when the Metrc Lab
  Results report is finally imported (defect D5). Writable by strangers before
  a single real value had arrived.

### The most serious finding — `ai_bridge_jobs`

`bridge/server.mjs` polls `ai_bridge_jobs` for `status = 'pending'` and passes
the row's `question` field to Claude Code running on the owner's workstation,
in the project directory, with the owner's environment.

Combined with the `abj_bridge` policy (`anon`, `ALL`, `USING (true)`), any
holder of the public key could insert a row and have an AI agent execute it on
that machine. **Unauthenticated remote code execution.**

This was contained by stopping the bridge, not by a policy change — the policy
fix requires observing the bridge while it runs, and is deferred (see below).

---

## What was done

**Contained** — desktop bridge stopped (PID 9548, port 8765 closed). It was
already failing to reach Supabase (`poll error TypeError: fetch failed`), so
nothing was lost.

**Applied**, as one transaction:

```sql
begin;
drop policy if exists ds_all  on dashboard_snapshots;
drop policy if exists lrv_all on lab_result_values;
revoke execute on function public.tg_set_secret(text,text)  from public, anon;
revoke execute on function public.tg_set_my_key(text,text)  from public, anon;
commit;
```

Note `from public, anon` — **not `from anon` alone**. Both functions carried a
PUBLIC grant (`=X/postgres`) as well as an explicit anon grant. Revoking only
from `anon` would have left the PUBLIC grant standing and the hole open, while
a naive `proacl NOT LIKE '%anon%'` check reported success. Verification uses
`has_function_privilege()`, which accounts for PUBLIC and role inheritance.

`authenticated` and `service_role` keep their explicit grants. Nothing
signed-in lost access.

---

## Before state (rollback record)

| Object | Name | Granted to | Cmd | Using | With check |
|---|---|---|---|---|---|
| `dashboard_snapshots` | `ds_all` | anon, authenticated | ALL | true | true |
| `lab_result_values` | `lrv_all` | anon, authenticated | ALL | true | true |
| `ai_bridge_heartbeat` | `abh_write` | anon, authenticated | ALL | true | true |
| `ai_bridge_jobs` | `abj_bridge` | anon | ALL | true | true |

Function ACL, both functions, before:
`{=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}`

## Rollback

```sql
create policy ds_all  on dashboard_snapshots
  for all to anon, authenticated using (true) with check (true);
create policy lrv_all on lab_result_values
  for all to anon, authenticated using (true) with check (true);
grant execute on function public.tg_set_secret(text,text) to public, anon;
grant execute on function public.tg_set_my_key(text,text) to public, anon;
```

---

## Verification — measured after the change

| Check | Expected | Result |
|---|---|---|
| `ds_all` / `lrv_all` remaining | 0 | **0** |
| anon can execute `tg_set_secret` | false | **false** |
| anon can execute `tg_set_my_key` | false | **false** |
| PUBLIC can execute `tg_set_secret` | false | **false** |
| `authenticated` retains `tg_set_my_key` | true | **true** |
| bridge policies still intact | 4 | **4** |
| RLS still enabled on both tables | 2 | **2** |
| views / matviews / cron jobs | 177 / 7 / 19 | **177 / 7 / 19** |
| `mv_department_dashboard` rows | non-zero | **43** |
| `dashboard_snapshots` rows (data preserved) | 63 | **63** |

End-to-end, against the live API with the public key:

- `auth/v1/settings` → **200** (login flow intact)
- read `dashboard_snapshots` → **200 `[]`** (request succeeds, RLS denies rows)
- **write** `lab_result_values` → **`42501: new row violates row-level security
  policy`** (the hole, proven closed)

The site returns HTTP 200.

---

## Phase 3 — `ai_bridge_jobs` scoped (applied and tested the same day)

`abj_bridge` (`anon`, `ALL`, `USING (true)`) was replaced with two scoped
policies. **anon lost INSERT and DELETE**, which is the control that matters:
a stranger can no longer create a job for the bridge to execute.

```sql
drop policy if exists abj_bridge on ai_bridge_jobs;

create policy abj_bridge_read on ai_bridge_jobs
  for select to anon using (true);

create policy abj_bridge_claim on ai_bridge_jobs
  for update to anon
  using      (status = any (array['pending','running']))
  with check (status = any (array['running','done','error']));
```

### The read policy had to stay wide — why

The first attempt scoped SELECT to `status in ('pending','running')`. The
bridge's *claim* worked (`pending → running`, HTTP 204) but *completion* failed
(`running → done`, `42501`). PostgREST needs the updated row to remain readable
to complete the statement, and `done` fell outside the read policy.

Read was therefore widened back to `using (true)`. This is **not a regression**:
`abj_bridge` was previously `ALL` with `USING (true)`, so anon could already
read every row. The gain — no INSERT, no DELETE — is kept.

It does mean anon can still *read* job questions and answers, which may carry
business content. That is the remaining exposure on this table and the reason
the bridge should eventually hold its own credential rather than the shared
public key. That would be a *new* credential for the bridge, not a rotation of
any existing key.

### Test results — replayed against the live API with the public anon key

| Bridge operation | Expected | Result |
|---|---|---|
| Poll `?status=eq.pending` (server.mjs:192) | row returned | **row returned** |
| Claim `pending → running` (server.mjs:198) | success | **204** |
| Complete `running → done` (server.mjs:208) | success | **204** |
| **INSERT a job** (attacker path) | denied | **42501 denied** |
| **DELETE a job** | denied | **204 no-op, 14/14 rows intact** |
| **Reopen `done → pending`** (re-trigger) | denied | **204 no-op, still `done`** |

Test fixture (job id 14) was removed afterwards; 13 real jobs remain untouched.

Bridge restarted and confirmed live: heartbeat from machine `Management_Co`
written 22 seconds after start. The `poll error TypeError: fetch failed` lines
in `bridge.log` predate this work and are not caused by it.

### Note for anyone writing bridge policies later

Job status values are **lowercase** — `pending`, `running`, `done`, `error`. A
policy written against `'PENDING'` matches nothing and the bridge silently sees
zero jobs. There is also **no `owner_device_id` column** on `ai_bridge_jobs`;
the columns are `id, asked_by, question, context, status, answer, error,
seconds, claimed_at, answered_at, created_at`.

## Still open

**`abh_write` on `ai_bridge_heartbeat`** is unchanged — still `anon`,
`ALL`, `USING (true)`. Severity is low: the worst case is a falsified bridge
status chip, not code execution. Scoping it to INSERT/UPDATE without DELETE is
straightforward but was not attempted here, to avoid a second change to a
running bridge in one session.

## Also open, not addressed here

- **161 `security_definer_view` advisories.** Views run with owner rights and
  bypass the caller's RLS, so role separation between `owner`/`executive`/
  `staff`/`readonly` may not hold where expected. Needs assessment, not a rush.
- **Weak owner passwords** from the build phase (`HANDOFF.md` §6). The owner's
  to change; an agent should not set another person's password.
