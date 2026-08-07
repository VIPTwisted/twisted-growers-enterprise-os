# Hot cache — live platform pulse

**Measured 7 August 2026, ~15:10 UTC, by direct SQL against the live database
(`fxetuqjryttnypgepsru`).** Every figure here carries its measurement method.
Do not trust this file if it is more than a day old — regenerate (queries at
the bottom).

---

## 1 · Security — needs eyes first

- **The platform's own watchdog raised finding #347 today (14:34 UTC),
  severity critical: "Anonymous access has reopened — 1 function reachable
  without signing in."** The DDL guard then logged two more functions created
  at 14:58–14:59 executable by anon via PUBLIC: `f_check_reason(...)` and
  `tg_block_forensic_delete()` (ddl_guard_log #4, #5 — both unresolved).
  The fix per the guard itself: revoke from **PUBLIC as well as anon** —
  revoking anon alone is a no-op while PUBLIC holds the grant. This belongs
  to the grants owner (watchdog lane), per finding #280's note.
- **CORRECTED 15:45 UTC by the Inspector — the "57 anon grants" alarm was
  wrong and anon can read NOTHING.** The 57 rows are 19 relations × 3
  privilege types (REFERENCES, TRIGGER, TRUNCATE) — **zero SELECT**. ACL is
  uniformly `anon=Dxtm/postgres`. `has_table_privilege` is authoritative for
  effective access; the customer directory, manifests, wholesale money and
  strain performance are **not** exposed. The 31 "routine grants" are all
  owned by `supabase_admin` and correctly excluded by the check's own filter.
- **But two real exposures the platform's own checks cannot see:**
  1. **anon holds TRUNCATE on 11 tables** including `ddl_guard_log`,
     `platform_state`, `alert_outbox`, `item_flag_decision`. **RLS does not
     apply to TRUNCATE**, and of 61 non-internal triggers in `public`, **none
     is a TRUNCATE trigger** — `trg_h2_no_delete` is BEFORE DELETE only. So
     rule H2 is enforced against `delete` and unenforced against `truncate`.
     Exploitability is low (PostgREST issues no TRUNCATE), the grant is real,
     and nothing checks it.
  2. **anon holds read + update on 8 sequences.** The read check's
     `relkind in ('r','v','m')` filter excludes sequences by construction, so
     "no anonymous visitor can read anything in public" is false as written.
  Fix (watchdog lane, not executed): `revoke truncate, references, trigger on
  all tables in schema public from anon`, plus TRUNCATE triggers on the seven
  forensic tables.
- **`anon-cannot-execute` now FAILS: 2 functions** — `tg_block_forensic_delete`
  and `tg_ddl_guard`, reachable via a **PUBLIC** grant (`=X/postgres`), which
  is invisible to any query filtered on `grantee='anon'`. Confirms the
  standing lesson: revoke from PUBLIC as well as anon.
- `current_app_role()` is **SECURITY DEFINER with no search_path and backs
  6 RLS policies** (watchdog #280, critical, open). Same for `audit_row()`
  and `audit_secret_touch()`. Standard privilege-escalation shape.
- Good news, verified live: **0 tables without RLS** (my pull and the
  platform's agree), 518 policies, `security_anon_allowlist` intentionally
  near-empty (3 rows).

### Added 7 Aug (edge-function recovery) — one shared key bypasses auth on 16 live functions
Recovering all 20 edge functions exposed a **single static `x-admin-key`
literal that bypasses executive JWT auth on 16 deployed functions**, including
ones holding the service-role key and live Metrc credentials. `metrc-probe`
and `manifest-parse` accept **only** that key — no JWT path at all — and probe
can call arbitrary Metrc paths with production credentials.

**Exposure sized, 7 Aug:** the GitHub repo is **private** (unauthenticated API
returns 404), and `tools/pushreports.py` — the other file carrying the literal
— is **not tracked by git** (`git ls-files` returns nothing). The front end
authenticates to these functions with the user's JWT, not this key, so it is
not in the browser bundle. **Current exposure is low; blast radius is severe.**
One leak (screenshot, paste, contractor, future commit) yields arbitrary Metrc
probing, table wipes via `sheet-push`, and customer writes via `manifest-parse`.

**Fix (watchdog / Agent B lane, not executed):** move the shared key into a
Supabase function secret — the recovered copies are redacted, so this is
required before any redeploy anyway — and give `metrc-probe` and
`manifest-parse` a JWT path. Related, from the same read: `sheet-sync` and
`sheet-push` delete-and-replace whole tables on every run; `metrc-sync`
brute-forces 8 auth arrangements against the live Metrc API when unsure.
Confirmed good: **no function writes to Metrc** — every Metrc call is a GET
(rule D1 holds architecturally).

## 2 · Platform vitals (nightly self-check 14:34 UTC, cross-checked live)

231 base tables · 227–228 views · 9 matviews · 25 cron jobs (**1 failing —
identify which**) · 270 nav entries enabled, 0 broken · 2 app users ·
17 active employees · **179 go-live items open** · **44 open questions
unanswered** · **36 of 43 KPI tiles have no owner-set target** (the tile
standard requires one on every tile).

## 3 · Money sitting in open watchdog findings (all critical, all with drills)

- **$82,940** — 75.4 lb of our own dried flower FAILED testing (5 packages,
  oldest 105 days). Root-cause then remediate-or-destroy decision needed.
- **$8,250** — 7.5 lb infused (edible) never submitted for testing (7
  packages, oldest 86 days). Cannot legally be sold as-is.
- **$6,930** — 6.3 lb shake and trim never submitted (2 packages, oldest 200
  days).
- Lab turnaround outliers: worst 27 days (bulk concentrate) and 43 days
  (shake/trim by strain) against an average around 1 day.

## 4 · Page health (canary, 236 pages, five runs on record)

- **~43 pages render EMPTY** — the views exist but their base tables have no
  rows yet: sales orders, invoices, shipping, work orders, time & attendance,
  SKUs, labor budgets, demand forecasts, and the rest of the unbuilt business
  modules. Honest empty states required (never fabricated data).
- **Pages that will hang:** `v_remediation_yield` takes **24–79 seconds** for
  one row; `v_third_party_downstream` 12–24 s; `v_leadership_accountability`
  31 s once. Anything over 2 s makes its page unusable. These need query
  work or materialization.
- 0 missing sources, 0 erroring sources — the failures are emptiness and
  speed, not breakage.

## 5 · The self-checking machinery (who watches the watchmen)

- **8 verification checks** defined 7 Aug (owner: Vincent), each deriving one
  fact two independent ways — revenue across two Metrc reports, plants vs
  plan, room capacity never exceeded, anon-cannot-read/execute, double-count
  guards. 55 verification runs on record (results not yet digested here).
- 25 cron jobs run the platform: watchdog twice daily, canary every 20 min,
  intelligence sweep every 15, weekly forensic audit (Mondays 06:00),
  nightly platform self-check 06:40.
- `platform_state` is append-only and its own comment says **HANDOFF.md
  should be generated from it, not hand-written** — it caught the handoff
  being materially wrong on 7 Aug.

## How to regenerate this file

Run against the live DB and rewrite every section with fresh figures and a
new timestamp:
1. `select * from platform_state order by id desc limit 1;`
2. `select * from ddl_guard_log where resolved_at is null;`
3. Latest `canary_runs` row — list EMPTY and SLOW details.
4. Open `watchdog_findings` with dollars/pounds, severity critical first.
5. The two anon measurements (has_table_privilege AND role_table_grants) —
   record both, flag disagreement.
6. `select jobname, schedule, active from cron.job;`
