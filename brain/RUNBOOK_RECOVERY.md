# Recovery runbook — what to do when it breaks

**Written 7 August 2026 by Agent D.** Adopted from the one practice every
serious engineering organisation has and this platform did not: **a rehearsed
recovery path.** Until now the honest answer to *"the site is broken, what do
we do"* was: nobody knows.

**Read the symptom. Follow the steps. Do not improvise — Rule Zero.**

---

## FIRST, ALWAYS: is it broken, or is it empty?

**This platform's most common false alarm.** 43 of 236 pages are legitimately
empty because their business module has no data yet. **An empty page is not a
broken page.**

```sql
select * from canary_runs order by ran_at desc limit 1;
```
It classifies every page as OK / EMPTY / SLOW / ERRORED / MISSING, every 20
minutes. **If the page is EMPTY there and always has been, nothing is broken.**

⚠ And know the trap: **129 read sites swallow errors as `?? []`, so a failed
query looks identical to no data.** The canary is more trustworthy than the
page.

---

## SYMPTOM 1 — Every dashboard is blank at once
**Cause, three times over: a materialised view was destroyed by
`drop view … cascade`.** It fails silently because the front end swallows the
error.

```sql
select matviewname, ispopulated from pg_matviews where schemaname='public';
select count(*) from mv_department_dashboard;   -- expect ~43 tiles, 11 departments
```
**Recover:** rebuild the matview from `_mv_dept_backup` (its definition is kept
there for exactly this). Restore the unique index `mv_dept_dash_uq (department,
kpi, ord)` — **without it the cron's `REFRESH … CONCURRENTLY` fails** — and
re-grant to `authenticated`, not `anon`.
**Verify:** 43 tiles, 11 departments, and the content fingerprint on record.
**Never `drop … cascade` to fix it.** That is what caused it.

## SYMPTOM 2 — The site is down, white, or shows a stray `)}`
Front end only. The database is unaffected.

**Recover:** Netlify builds from GitHub `main`, so **revert the commit and push
— that redeploys automatically.** For a faster manual path, the CLI is
authenticated (TwistedG, team TG, project `b565a8cc-c82b-41b9-b9ec-4dae875af078`):

```bash
netlify deploy --prod --dir=dist
```
from a known-good `dist`.
**Verify:** load the live site signed in, not just the URL. A white screen
still returns HTTP 200 — **there are zero error boundaries**, so one render
exception takes the whole app down.

## SYMPTOM 3 — An import wrote wrong data
**This one is solved and proven.** Every import takes an automatic backup, in
both modes.

```sql
select * from metrc_report_imports order by imported_at desc limit 5;
select tg_import_undo('<import id>', 'reason');
```
**Proven live:** a real harvest was deliberately corrupted (wet 0.77 → 220.46
lb) and restored byte-for-byte. **Use this rather than hand-editing rows.**

## SYMPTOM 4 — Metrc sync has stopped
```sql
select jobname, schedule, active from cron.job;
select * from v_agent_health where status <> 'ok';
select endpoint, licence, status, count(*) from metrc_sync_runs
 where started_at > now() - interval '24 hours' group by 1,2,3 order by 4 desc;
```
**Read the errors correctly:** a 401 on plants/harvests/plantbatches against
**MP281909** is structural — a manufacturing licence holds no plants and no
credential fixes it. A 401 on **packages or transfers** is real.
⚠ **"ok, records: 0" every run is a fault, not a quiet day** — that pattern hid
60% of harvests and 41% of manifests.
⚠ **A run stuck in `running` never errors**, so no failure check sees it. 17
were open on 7 Aug, oldest two days.

## SYMPTOM 5 — A number looks wrong
**Do not "fix" the number.** Run `/verify` — derive it two independent ways.
**If the two disagree, the disagreement is the finding**, and the fix is
upstream. Check `brain/DATA_TRAPS_REGISTER.md` before concluding anything: a
wrong-looking number is usually a right number on the wrong basis (wet vs dry,
cost vs price, own vs resale, plants started vs harvested).

## SYMPTOM 6 — A schema change went wrong
**⚠ This is the weakest recovery path in the platform. There is no staging and
no per-table restore.**
The only true recovery is a **full database restore** from Supabase → Database
→ Backups, which is **destructive to everything since that backup.**

**So the rule is prevention:** `create or replace`, never drop. Additive
columns only. RLS on at creation. **Check `ddl_guard_log` after any schema
change — 13 unresolved violations were open on 7 Aug, up from 5 that morning.**

---

## Data freshness — declared, so "stale" stops being an opinion

Every page shows data without saying how old it is. **Declared thresholds,
from each job's actual cadence:**

| Data | Refresh | STALE after | Why it matters |
|---|---|---|---|
| Manifests | hourly, 8am–5pm | **3 hours** | A delivery you cannot see cannot be received |
| Packages | 9am, 12pm, 5pm | **8 hours** | Drives every stock and money tile |
| Cultivation | 10am, 6pm | **16 hours** | Yield, capacity, room occupancy |
| Reference (items/strains) | daily | **48 hours** | Only changes when you add one |
| Dashboards (matviews) | every 10 min | **1 hour** | A stale dashboard is a wrong dashboard |
| Page canary | every 20 min | **1 hour** | It is the broken-vs-empty test |

**The consequence must be visible on the page**, not buried in a log: *"Package
data last synced 11 hours ago — older than the 8-hour limit."* Honest and
stale beats silent and wrong.

---

## What has NO recovery path — say so rather than pretend
- **No staging.** Every change is tested in production. This is the single
  biggest gap and it is Phase 0 of [PROJECT_PLAN.md](PROJECT_PLAN.md).
- **No per-table or point-in-time restore.** Full database restore only.
- **No practised rollback.** This document is the first version; **it has not
  been rehearsed.** A runbook nobody has run is a hypothesis.
- **Alerts cannot leave the building.** `alert_outbox` nags correctly and no
  email provider is configured — and 127 of 127 customers have no email
  address. **The nagging machine has no mouth.**

**Next step to make this real: walk symptoms 1 through 4 on a quiet day and
time them.** A runbook is worth what it has been tested at.
