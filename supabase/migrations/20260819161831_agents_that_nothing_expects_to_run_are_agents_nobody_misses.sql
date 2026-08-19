/* ═══════════════════════════════════════════════════════════════════════════
   WHY THE AGENTS DO NOT REPORT: NOTHING EXPECTS THEM TO.

   agent_registry holds five lane agents — B (front end), M (ledger), P
   (parser), S (sales), V (verifier), W (watchdog), X (challenger) — and every
   one of them has expected_every_mins = NULL. A NULL cadence means no health
   view can ever say "this agent has gone quiet", because nothing was ever
   promised. The watchers watch the data; nothing watched the watchers.

   The proof arrived today. Five agents audited this platform, found forty
   defects, and wrote ZERO rows to agent_findings — a table that already holds
   1,526 findings from ten other agents. The findings existed only as prose in
   a chat window. Nothing was broken; nothing was expected either.

   This is the same shape as every silent failure on this platform: the healer
   that logged 481 successes while failing 522 times, the freshness view that
   reports max() so one success in twenty reads as fresh, the export that
   printed a row count and not the truncation. Something happened, and the
   system that should have known did not.

   Two changes, both small. Every lane agent gets a cadence and an evidence
   table, so v_agent_health can name one that has gone quiet. And the
   reconciliation agent — which produced the largest finding of the day and had
   no registry row at all — gets registered.
   ═══════════════════════════════════════════════════════════════════════════ */

insert into agent_registry
  (agent_key, display_name, kind, what_it_watches, why_it_matters, owner,
   expected_every_mins, evidence_table, verified_by, enabled, added_on)
values
('review:reconciliation','Data Reconciliation','review',
 'Metrc against Apex against the spreadsheets against Supabase. Freshness per pipeline, package counts under the canonical dedup, the manifest-to-invoice join, mass balance against mv_stock_proof, and the gap ledger by cause.',
 'It produced the largest finding of 19 Aug 2026 and had no registry row, so it could not file it. Two money columns fan out 11x and 16x at line grain — a sum() on either publishes up to $51.2M that does not exist — and NO Apex line matches a Metrc transfer by identity: manifest_number is null on all 1,739 Apex orders, so 100% of "matched" is a 14-day proximity guess and 35.6% of it chose between 2 and 9 candidates arbitrarily. Nothing else on this platform compares the three systems.',
 'Agent I', 1440, 'agent_findings',
 'select count(*) from agent_findings where agent_key = ''review:reconciliation'' and detected_at > now() - interval ''48 hours''; -- zero means it has gone quiet. Then: select hours_stale from v_source_freshness where source = ''apex''; -- 230.4 on 19 Aug 2026 and it has NEVER been scheduled.',
 true, '2026-08-19')
on conflict (agent_key) do nothing;

/* A cadence each, so silence becomes measurable. These are review lanes rather
   than cron jobs, so the number is the interval after which going quiet is
   itself the finding — not a promise that a job fires on a timer. */
update agent_registry set expected_every_mins = 1440
 where agent_key in ('lane:V','lane:W','lane:X') and expected_every_mins is null;
update agent_registry set expected_every_mins = 10080
 where agent_key in ('lane:B','lane:M','lane:P','lane:S') and expected_every_mins is null;

/* Three of them pointed at evidence tables that do not exist, which their own
   verified_by text admits — "table does not exist yet; that IS the finding".
   Those tables exist now, so the pointer is corrected to something readable. */
update agent_registry set evidence_table = 'agent_findings'
 where agent_key in ('lane:V','lane:W','lane:X','lane:B');