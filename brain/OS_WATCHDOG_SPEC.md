# The OS Watchdog — oversight that lives inside the platform

**Directed by the owner, 7 August 2026: "We need the OS watchdog within the
OS. I count these as external on my desktop."**

Agents A, B, C and D are **external build crew** on the owner's desktop. They
finish. The OS Watchdog **runs for the company, permanently, inside the
product** — on cron, registered in `agent_registry` like every other run-time
agent, accountable on the same terms.

---

## What already exists
`watch:watchdog` — "Forensic watchdog", every 720 minutes, evidence in
`watchdog_findings`, described in the registry as *"the only agent that writes
a full who/what/when/why finding."* Measured 7 Aug: **healthy, last wrote
15:25.** The narrative-findings half works.

## What today proved is missing

Every gap below was found by an *external* review that had to be run by hand.
**Nothing inside the OS was watching any of it.**

| Gap | Evidence, 7 Aug 2026 |
|---|---|
| **Nobody runs the verification checks** | 8 checks defined; last run 12:32; they run when a human remembers. No `agent_registry` row names `verification_runs` as evidence. |
| **Nobody reads the results** | 55 runs recorded, **never once digested** until an external agent did it today — and two checks had been failing every single run. |
| **Check definitions can be silently rewritten** | Run #33 recorded `value_b = 2` where that check's source B is literally `select 0::numeric`. **A constant cannot return 2** — the SQL was changed afterwards and the history still reads continuous. `verification_checks` has no `updated_at` and no version. |
| **Nobody checks agent heartbeats** | 5 of 18 agents past their interval, including the two that would have caught ~$399K of missing pulls. Discovered by hand. |
| **The security checks have structural blind spots** | The read check filters `relkind in ('r','v','m')` — **sequences are invisible**, and anon holds read+update on 8. Only SELECT is tested, so **anon's TRUNCATE on 11 tables** is invisible. Queries filtered on `grantee='anon'` **cannot see PUBLIC grants** — which is how two functions became anon-executable. |
| **H2 is enforced against DELETE and not TRUNCATE** | 61 non-internal triggers checked; **none is a TRUNCATE trigger.** RLS does not apply to TRUNCATE. |
| **The roster does not match who is writing** | Three agent names in `agent_findings` do not exist in `agent_registry` as written; two agents work under no roster entry and no owner. Joins are on free-text display names. |

## The charter

**The OS Watchdog verifies. It never builds and never fixes.** It raises
findings with the arithmetic, the accountable party, and what would settle it
— exactly the shape `watchdog_findings` already uses.

### Its six standing duties
1. **Run the verification checks on a schedule** and record every run — the
   platform's own philosophy is *derive one fact two ways, disagreement is
   the finding*, and it currently depends on someone remembering.
2. **Digest the results.** A disagreement that nobody reads is not a check.
   Any check outside tolerance becomes a `watchdog_findings` row with both
   numbers, both methods, and the gap in plain English. **Never average.**
3. **Muster the fleet.** Compare every `agent_registry` row's
   `expected_every_mins` against the newest row in its `evidence_table`.
   Late, no-evidence-ever, and unprovable (null evidence table) are three
   different findings — say which.
4. **Sweep security, including the blind spots.** Both methods, always:
   `has_table_privilege` / `has_function_privilege` for *effective access*
   (catches PUBLIC and inheritance) **and** `information_schema` for *where a
   grant came from*. Cover **all** relkinds including sequences, and **all**
   privileges including TRUNCATE, REFERENCES and TRIGGER.
5. **Guard the forensic tables by row count, not just by verb.** H2 was
   breached by a migration that took `watchdog_findings` from 100 rows to 43
   — no `delete` statement involved. A falling row count on any append-only
   table is a critical finding.
6. **Escalate until resolved**, through `alert_outbox`, which is already
   append-only and already nags. Per the owner: no issue goes unresolved.

### Three properties it must have
- **Registered like everyone else** — its own `agent_registry` row, with an
  `evidence_table` and a `verified_by`. An overseer exempt from oversight is
  not an overseer.
- **Its own history must be tamper-evident** — add `updated_at` and a
  definition hash to `verification_checks`, so every run binds to the SQL
  that produced it. Without this, the record can be rewritten and still read
  clean. *(Same reason the shadow log seals entries — see
  [SHADOW_LOG_SPEC.md](SHADOW_LOG_SPEC.md).)*
- **It is reviewed from outside.** The external Inspector reviews the OS
  Watchdog. **Never compare a source to itself** — the rule the platform
  already lives by, applied to its own overseer.

### What it must NOT hold
**No grant-changing power. No schema power. No write access to business
data.** Detection and escalation only; a human — or an approved build agent —
executes the fix. An in-OS agent that can rewrite its own permissions is the
single most dangerous object that could exist in this platform, and Rule Zero
forbids building it.

---

## Build note
This is a design, not a change. Creating its table/cron and adding columns to
`verification_checks` is schema work in the build lane, and the RLS-at-
creation rule applies (the DDL guard will trip otherwise). **Agent D owns the
spec and the reviews; a build agent applies it under the owner's approval.**

Open and still needed from the owner: **who owns grants and RLS today?** Every
security finding raised on 7 Aug is addressed to a lane that may have no
occupant.
