# The Critical Board — must-do today, ranked by consequence

**Computed live 7 August 2026, ~18:40 UTC.** This is the department's P0 from
the owner's own go-live tracker: *"Brain must be operations-critical, not a
search box. Critical Board — the must-do-today list computed live, ranked by
consequence."*

**Ranking is by CONSEQUENCE, not severity flag.** The order comes from the
owner's own words in `agent_registry`: *"These threaten the licence, which
outranks every cash figure."*

> 1 · Licence · 2 · Cash trapped · 3 · Capacity lost · 4 · Decisions blocking
> · 5 · System integrity

---

## ✅ TO DO — TODAY, 8 AUGUST 2026 (owner-set)

Set by Vinny on 8 Aug 2026 during the session-connection work. These are **his
rulings**, not an agent's ranking — they sit above the computed board below.

| # | To do today | Why it is here | State |
|---|---|---|---|
| **T1** | **Settle the moisture band (defect D1).** | It sits underneath every conversion, yield, inventory and valuation figure, and blocks 6,796 lb of Metrc correction work. **The arithmetic is impossible as it stands:** 18,476.7 lb wet in, less 14,319.4 lb evaporated at the 75–80% band, leaves **4,157.1 lb** dry available — but **5,199.1 lb was actually packaged.** That is **1,042 lb that cannot exist.** Either the band is too aggressive, wet weights are under-recorded at the takedown scale, or packaged weights include material from elsewhere. | **Owner deferred 8 Aug — on the list, not started.** No agent may guess the band. Fix: weigh 2–3 harvests end to end, then set the true band on Settings → Business Rules. |
| **T2** | **Parse the 11 certificates missing their client licence.** | `coa_extract` holds **983** certificates and **11 have `client_license` null**. That field is the *only independent* answer to "is this ours?" — rule C0 says ownership stops at the COA, and an internal field cannot disconfirm another internal field. 972 of 983 are fine; these 11 are blind spots. | **Open — to do today.** The PDFs are already on disk in `metrc_documents.storage_path`. Open them and read `Client Info`. |

### Deferred by the owner on 8 Aug 2026 — decisions, not oversights
Recorded so no future session re-raises them as new findings (rule H1: ignoring
is a decision, not a deletion).

- **47 unanswered owner questions** (was 44 on 7 Aug) — *"leave this alone for later."*
- **Owner accounts still on build-phase passwords** — *"leave alone for now."*
  Still true, still flagged in `HANDOFF.md` §6, and still matters before real
  staff onboarding.

### Closed on 8 Aug 2026
- **Credentials in a cloud-synced config.** 23 permission entries with live keys
  baked in — 10 edge-function admin keys, 5 Supabase JWTs, 4 Netlify proxy
  tokens, 4 signed storage URLs — were sitting in
  `Desktop\Twisted Growers\.claude\settings.local.json`, which syncs to OneDrive.
  Removed; file verified clean. **No key was rotated** at the owner's direction,
  so every credential remains valid — it is simply no longer stored there.
- **The nightly self-check miscounted cron in both directions.** See
  [LESSONS.md](LESSONS.md). Fix written but **BLOCKED** — see below.
- **`brain/INDEX.md` described less than half the brain.** 24 files existed and
  none were listed. All 24 now indexed.
- **Sessions opened on the Desktop stub started with no rules and no guards.**
  The stub now injects the full rule set by hook and carries the agents, skills
  and SQL guards by junction. Verified 8/8.

### ⛔ BLOCKED, needs an owner ruling
**The SQL guard cannot be edited because the SQL guard blocks the edit.**
`tools/hooks/guard-sql.mjs` matches `grant … to … anon` across *any* string in a
tool call, including English prose. The finding text inside
`tg_nightly_platform_check()` contains *"…holds the grant. Then run
… to confirm zero"* followed by *"anon relations"* — no `GRANT` statement
anywhere, but the pattern matches. **Any future edit to that function is
blocked, permanently.** The guard's own message says to tell the owner rather
than work around it, so nothing was worked around. Ruling needed: tighten the
pattern to real SQL statements, or reword the finding text.

---

## 1 · LICENCE RISK — outranks every dollar below

**$163,130 of product cannot legally be sold. None of it was ever submitted
for testing.**

| What | Packages | Weight | Oldest | Value |
|---|---|---|---|---|
| Concentrate, never submitted | 76 | 89.6 lb | **892 days** | $98,560 |
| Dried flower, never submitted | 2 | 52.4 lb | 200 days | $57,640 |
| Shake and trim, never submitted | 2 | 6.3 lb | 200 days | $6,930 |

**892 days is two and a half years.** Seventy-six packages of concentrate have
sat untested since roughly February 2024.

**Failed testing with NO DISPOSITION RECORDED — 75.5 lb.** 75.4 lb of our own
dried flower (5 packages, oldest 105 days) and 0.1 lb of concentrate (oldest
**883 days**).

> **This is not $83,050 of loss.** Per the owner, 7 Aug: failed material can be
> **remediated in-house, sold on for remediation, or destroyed** — and the
> business already *buys* failed material at a discount (93.5 of 211.3 lb of
> bought-in flower on hand failed testing). **The finding is that no
> disposition has been recorded**, not that the material failed. Rule H1: an
> issue does not clear itself. **⚠ The watchdog's own advice omits the sell
> option** — it reads *"remediate or destroy"* and should read *"remediate,
> sell for remediation, or destroy."*

**Also open: 68 custody flags · 8 Metrc corrections outstanding · 22 harvests
open past the 28-day limit.**

## 2 · CASH TRAPPED — $2,679,160 over age limits, flagged since 6 Aug, unresolved

| Stream | On hand | Oldest | Limit | Value |
|---|---|---|---|---|
| Dried flower | 1,007.2 lb | **647 days** | 90 | $1,107,920 |
| Fresh frozen | 603.9 lb | 94 days | 60 | $664,290 |
| Shake and trim | 602.3 lb | 200 days | 120 | $662,530 |
| Concentrate | 222.2 lb | **892 days** | 120 | $244,420 |

**Total flagged across all open alerts: $2,925,340.** Every one carries the
same recommended action: *"Move it, sell it, process it, or raise the limit
deliberately."* Raised 6 Aug. Seen five times. Still open.

## 3 · CAPACITY

**22 harvests open past the 28-day limit.** Room occupancy is fine — 86.5%
total in 2026, 11 of 15 pulls at full capacity — so the dry-flower shortfall
is **fresh-frozen diversion, not empty rooms** (see
[CAPACITY_TRUTH.md](CAPACITY_TRUTH.md)).

*Live flowering counts could not be read in this pass — the growth-phase filter
returned nothing. Not reported rather than guessed (A1).*

## 4 · DECISIONS BLOCKING WORK — only the owner can clear these

- **4 storage limits have no `max_lb`** — every row reads *"awaiting Vincent"*.
  **Until they are set the platform can flag material as OLD but never as TOO
  MUCH.** Four numbers, one minute, and the alerts above become complete.
- **44 open questions unanswered.** Each is a business fact the data cannot
  infer, and each blocks a number.
- **179 go-live items open.**
- Plus the arbitration queue in [CONTRADICTIONS.md](CONTRADICTIONS.md).

## 5 · SYSTEM INTEGRITY — and one number is moving in the wrong direction

- **`ddl_guard_log` unresolved: 13.** It was **5 this morning.** Eight new
  violations today — objects created without RLS or reachable by PUBLIC while
  agents were shipping. **This is security debt accumulating in real time**,
  and it is the clearest argument for the attribution fix: the log says
  `actor = postgres` for all of them, so nobody knows which agent.
- **7 of 18 agents unhealthy.**
- **17 sync runs stuck in `running`**, oldest 5 August — never errored, so no
  failure check sees them.

---

## How to build this as a live page (Agent B)

One view, `v_critical_board`, with a `consequence_rank` column (1–5 above) and
a `consequence_note` in plain English. Sources, all existing: `inventory_alerts`
(unresolved), `watchdog_findings` (open, with dollars), `custody_alert_log`,
`metrc_corrections`, `open_questions`, `storage_limits` (null `max_lb`),
`ddl_guard_log` (unresolved), `v_agent_health` (status ≠ ok), and
`metrc_sync_runs` (status = running).

**Rules it must obey:** every row drills to its items (C1) · totals reconcile
to the rows (C2) · absence explained, never blank (A3) · the accountable party
named on the row · **and it must rank by consequence, not by severity flag** —
a $110 finding tagged critical must not outrank $1.1M of ageing stock.

**Then it belongs on the Command Center dashboard as the first thing anyone
sees.** A must-do list nobody opens is a list nobody does.
