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

## Deliberately NOT done — still open

**`abh_write` and `abj_bridge` remain in place.** Dropping them would break the
desktop bridge, which authenticates with the anon key (`bridge/server.mjs:162`,
role claim `anon`).

The correct fix is to scope them, not drop them. The bridge only ever
**selects** pending jobs and **updates** their status — it never inserts one.
Jobs are created by a signed-in user under the existing `abj_own` policy
(`with check (asked_by = auth.uid())`). So removing anon's INSERT right closes
the execution path while the bridge keeps working:

```sql
drop policy if exists abj_bridge on ai_bridge_jobs;
create policy abj_bridge_read  on ai_bridge_jobs
  for select to anon using  (status = 'pending');
create policy abj_bridge_claim on ai_bridge_jobs
  for update to anon using  (status in ('pending','running'))
                   with check (status in ('running','done','error'));
```

**This has not been applied and must not be applied blind.** Once a job flips
to `running` it is no longer selectable by anon, and PostgREST may require read
access to complete the update. That needs one test job with the bridge running
in front of you. Rollback is one line.

Longer term the bridge should hold its own credential rather than the shared
public key. That is a *new* credential for the bridge, not a rotation of any
existing key.

Note the job status values are **lowercase** (`pending`, `running`, `done`,
`error`). Any policy written against `'PENDING'` matches nothing and the bridge
silently sees zero jobs.

## Also open, not addressed here

- **161 `security_definer_view` advisories.** Views run with owner rights and
  bypass the caller's RLS, so role separation between `owner`/`executive`/
  `staff`/`readonly` may not hold where expected. Needs assessment, not a rush.
- **Weak owner passwords** from the build phase (`HANDOFF.md` §6). The owner's
  to change; an agent should not set another person's password.
