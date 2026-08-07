---
name: pulse
description: Regenerate brain/hot.md from the live database — security posture, platform vitals, open money findings, page health — and report what changed since the last pulse. Use at session start when hot.md is older than a day, or whenever the owner asks how the platform is doing.
---

# Pulse — refresh the brain's hot cache

Measure the live system (Supabase project `fxetuqjryttnypgepsru`), rewrite
`brain/hot.md`, and tell the owner what moved. Never trust a document where
a query is possible — counts here go stale within hours.

## Measure (read-only SQL via the Supabase MCP tools)
1. `select * from platform_state order by id desc limit 1;` — the nightly
   self-check row (append-only; this is the figure of record for vitals).
2. `select * from ddl_guard_log where resolved_at is null;` — live security
   debt. Any row here is a finding.
3. Latest `canary_runs` row — extract EMPTY pages, SLOW pages (>2s = a page
   that hangs), errored, missing.
4. Open `watchdog_findings` ordered severity, criticals first — include the
   dollars/pounds arithmetic exactly as recorded.
5. Both anon measurements, and flag any disagreement as a finding in itself:
   - the platform's method (`has_table_privilege`, per `verification_checks`
     rows anon-cannot-read / anon-cannot-execute)
   - the catalog method (`information_schema.role_table_grants` /
     `role_routine_grants` where grantee='anon')
6. `select jobname, schedule, active from cron.job;` — and if
   `platform_state.cron_failing > 0`, identify which job.

## Write
Rewrite `brain/hot.md` in its existing section structure with a fresh
timestamp and per-figure provenance. Keep the "How to regenerate" footer.

## Report to the owner
Lead with deltas since the previous hot.md: new criticals, resolved items,
figures that moved. Plain English, dollars first, no jargon. If nothing
changed, say so in one line.

## Hard limits
- Read-only. Never fix what you find during a pulse — findings go to the
  owner and the accountable lane (`docs/AGENT_WORK_DIVISION_AND_WATCHDOG.md`).
- Never quote a stale hot.md figure as current. The pulse IS the measurement.
