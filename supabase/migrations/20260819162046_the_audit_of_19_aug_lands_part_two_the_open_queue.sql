/* PART TWO of the 19 Aug audit pass: what is still OPEN. Each carries the exact
   measurement that closes it, so the next pass re-tests instead of
   re-discovering. Ordered roughly by what I intend to take first. */
insert into agent_findings
  (agent, agent_key, severity, headline, detail, metric, units, scope, action, drill_to, fingerprint)
values
('Agent W - Watchdog','lane:W','critical',
 'site-deploy-watch has failed 128 of 143 runs, dying on its own alarm',
 'ERROR: No finding with id NULL, raised inside f_alert_all_admins line 13. The deploy watcher raises a finding, gets a NULL id back, and dies alarming about it. Migration 20260819120657 was applied specifically to fix this and the job is still dying, so the applied fix did not take. 89.5 percent failure rate. The watcher that tells us the site is behind main is the thing that is broken.',
 89.5,'percent failing','cron job site-deploy-watch','Re-open the null-id path; verify the fix by watching a run succeed, not by reading the migration','cron.job_run_details','w-19aug-deploy-watch-null-finding-id'),

('Agent W - Watchdog','lane:W','critical',
 'refresh-reports has not succeeded once in twenty-four hours',
 '48 failed, 0 succeeded. Statement timeout on refresh materialized view concurrently mv_harvest_yields. mv_harvest_yields, mv_seed_to_sale and mv_strain_census are all fed by this job and none of them carries a computed_at, so every figure they serve is of unknown age and nothing on the platform can say so.',
 100,'percent failing','cron job refresh-reports','Raise the timeout for this job or split the refresh; then give all three a clock','cron.job_run_details','w-19aug-refresh-reports-100pct-fail'),

('Agent W - Watchdog','lane:W','critical',
 'The verification suite that proves tiles match their drills is down 92 percent of the time',
 '22 failed, 2 ok. Statement timeout on a sum of pounds from v_stock_proof. tg_verify runs the tile-drill contracts, so for 92 percent of runs nothing is checking that a tile agrees with the records behind it. This is the enforcement layer for rule C1.',
 91.7,'percent failing','cron job verification-suite','Fix the timeout; this is the contract enforcer and it is offline','cron.job_run_details','w-19aug-verification-suite-down'),

('Data Reconciliation','review:reconciliation','critical',
 'Apex has never been scheduled and is 230 hours stale',
 'Last fetch 2026-08-10 00:04:47Z, confirmed two independent ways that agree to the second: apex_raw.fetched_at and apex_sync_run.finished_at. apex-sync-daily, jobid 84, shows ZERO runs in a fourteen-day cron log holding 51,758 rows. The 10 Aug run was manual. sheet-sync-daily, jobid 85, has likewise never fired. Both rows are active=true, and v_source_freshness already advertises them as the refresher. A decision recorded is not a decision implemented.',
 230.4,'hours stale','apex_raw','Watch the 20 Aug 06:15 fire actually happen; do not accept the row as proof it runs','v_source_freshness','r-19aug-apex-never-scheduled'),

('Data Reconciliation','review:reconciliation','critical',
 'Two money columns fan out eleven and sixteen times at line grain',
 'total_usd is manifest grain: correct total 3,877,714.94 dollars, line-level sum 43,850,865.77, a factor of 11.31. apex_invoice_usd is invoice grain: correct 3,311,199.25, line-level sum 54,550,032.59, a factor of 16.47. Proven single-valued rather than assumed: of 798 manifests and 672 invoices, ZERO carry more than one distinct value across their lines. Any report summing either publishes up to 51.2 million dollars that does not exist. Separately, total_raw is stored in CENTS while total is in dollars, a 100x trap for anything reading the wrong one.',
 51238833.34,'dollars overstated','v_forensic_sold_by_tag','Rename to manifest_total_usd and invoice_total_usd, or remove them from line grain entirely','v_forensic_sold_by_tag','r-19aug-money-fanout-11x-16x'),

('Data Reconciliation','review:reconciliation','critical',
 'No Apex line matches a Metrc transfer by identity: all 7,757 matches are proximity',
 'manifest_number is NULL on all 1,739 Apex orders, so the identity branch of the join never fires and the ORDER BY tiebreak collapses to earliest order_date. 0 of 16,086 transfer lines match on manifest. Of the 7,757 called matched, 2,761 (35.6 percent) chose between 2 and 9 candidates arbitrarily. invoice_match=matched means this buyer had some order within fourteen days, not this is the same transaction. A real key IS available: invoice_number is populated on 100 percent of Apex orders and already exists on the Metrc side inside the delivery JSON.',
 35.6,'percent arbitrary','v_forensic_sold_by_tag','Join on invoice_number, which exists on both sides today','v_forensic_sold_by_tag','r-19aug-apex-metrc-no-identity-key'),

('Data Reconciliation','review:reconciliation','critical',
 'The lab results pipeline has been dark 310 hours with twelve of thirteen runs failed',
 '92 percent failure rate, no delta successor, 12.9 days silent. This pipeline has died silently once before. Alongside it, clickup_workspace has 8 runs and 8 failures and has never once succeeded in its life.',
 309.7,'hours dark','metrc_sync_runs','Repair or retire; a 92 percent failure rate is not a pipeline','metrc_sync_runs','r-19aug-lab-results-pipeline-dark'),

('Agent W - Watchdog','lane:W','critical',
 'Two compliance matviews are seven and eight days stale with no job to refresh them',
 'mv_dept_dash_third_party is 7 days 17 hours old, mv_dept_dash_audit_tiles 8 days 10 hours. Both now carry computed_at so the age is finally measurable, and neither has any scheduled refresh. The third-party compliance-tile breach has been open since 11 Aug.',
 8.4,'days stale','mv_dept_dash_third_party','Schedule a refresh for both','v_matview_freshness','w-19aug-two-compliance-matviews-stale'),

('Agent W - Watchdog','lane:W','elevated',
 'Twenty-one of twenty-eight matviews cannot report their own data age',
 'Six have neither a clock nor a refresh, thirteen more are scheduled but carry no computed_at. You cannot breach a freshness limit you have no clock for. The list includes mv_forensic_sales, mv_tag_documents, mv_tag_coa_lineage and mv_document_search, all of which are quoted in reports.',
 21,'matviews','matviews','Add computed_at to every matview, then a freshness assertion per view','v_matview_freshness','w-19aug-matviews-no-clock'),

('Agent W - Watchdog','lane:W','elevated',
 'Nine migrations have never been applied, four of them the missed-sync detection',
 'Verified by name rather than by version: none of these names appears anywhere in schema_migrations. 20260812184500, 185500, 190500 and 191500 are the missed-sync detection work, so code written to catch silent failures is itself sitting unapplied. Two further files are literal duplicates of applied migrations under different timestamps and would apply the same body twice on a replay.',
 9,'migrations','supabase/migrations','Apply or delete each one; resolve the two duplicate pairs','supabase_migrations.schema_migrations','w-19aug-nine-migrations-never-applied'),

('Agent W - Watchdog','lane:W','elevated',
 'The cron stagger did not hold: four jobs at 06:40 and three every hour at :25',
 'Minute zero was cleared on 19 Aug, but 40 6 now carries assert-prove, backfill-sweep, nightly-platform-check and tag-reconciliation-watch, and 25 past every hour carries assert-run, refresh-tag-evidence and sync-review, including a fifteen-minute matview refresh colliding with the data-assertion runner. The herd moved rather than dispersed, and the statement timeouts above are the likely consequence.',
 4,'jobs colliding','cron.job','Re-stagger 06:40 and the hourly :25','cron.job','w-19aug-cron-stagger-did-not-hold'),

('Data Reconciliation','review:reconciliation','elevated',
 'v_forensic_inventory double-counts eleven packages',
 'It reads metrc_packages with no distinct on tag and no dedup ordering, so eleven physical packages visible under both our licences at once are counted twice: it publishes 1,434 against a real 1,423. Independently confirmed by the platform own check held-package-counted-once, which reports the same eleven.',
 11,'packages','v_forensic_inventory','Apply the canonical dedup ordering','v_forensic_inventory','r-19aug-forensic-inventory-double-count'),

('Data Reconciliation','review:reconciliation','elevated',
 'Seven hundred and fifteen duplicated tags in metrc_packages, not the seven on record',
 'Every one is exactly two copies. 698 are a metrc api row plus a metrc report row for the same tag across licences, which is two ingest pipelines with no shared key. 17 are two metrc api rows across MC281714 and MP281909, the originally documented case, now 17 rather than 7. The briefing figure is stale by three orders of magnitude.',
 715,'duplicated tags','metrc_packages','Give the two ingest paths a shared key','metrc_packages','r-19aug-715-duplicate-tags'),

('Data Reconciliation','review:reconciliation','elevated',
 'Two thousand rows of v_forensic_sold_by_tag contradict themselves on whether an invoice exists',
 '1,939 rows say NO APEX INVOICE while carrying an invoice number, and 115 say matched while carrying none. apex_invoice_no comes from mv_tag_documents, which has no clock and no refresh, while invoice_match is computed live: two vintages of one fact in a single row.',
 2054,'self-contradicting rows','v_forensic_sold_by_tag','Reconcile to one definition or drop one of the two','v_forensic_sold_by_tag','r-19aug-invoice-match-contradiction'),

('Data Reconciliation','review:reconciliation','elevated',
 'Sheet sync claims 156 records and lands 116',
 'Forty rows unaccounted on the 19 Aug run. Nine runs all time, every one status ok, and ZERO failures ever recorded: a pipeline with no error channel that silently drops rows is a pipeline with no evidence.',
 40,'rows unaccounted','product_inventory','Record rejects; a path that cannot fail cannot be trusted','metrc_sync_runs','r-19aug-sheet-sync-156-vs-116'),

('Data Reconciliation','review:reconciliation','elevated',
 'The second spreadsheet path is 164 hours stale and hidden by a GREATEST',
 'v_source_freshness computes spreadsheets as GREATEST of google_sheet_fg and import_run, so the dead path renders fresh because the live one is. import_run last succeeded 12 Aug and covers three tabs product_inventory does not carry at all: Solventless, 3rd Party Material and Infused PreRolls. In that path 130 of 158 Solventless rows and 106 of 106 Infused PreRolls rows were REJECTED, not accepted.',
 164,'hours stale','import_run','Split the view: one row per pipeline, never a GREATEST across independent feeds','v_source_freshness','r-19aug-import-run-masked-by-greatest'),

('Data Reconciliation','review:reconciliation','elevated',
 'Live Metrc feeds fail 38 to 46 percent of the time and the freshness view cannot see it',
 'harvests delta 45.3 percent, plantbatches delta 46, packages full sweep 39.3, plants delta 38.4. v_source_freshness reports a max of finished_at, so one success in twenty renders as Fresh. Separately the metrc report provenance is 107.5 hours old and is 75 percent of the package mirror while the view reports the source as 0.5 hours fresh.',
 46,'percent failing','metrc_sync_runs','Freshness must read the success RATE, not the last success','v_source_freshness','r-19aug-feed-failure-rate-invisible'),

('Agent W - Watchdog','lane:W','elevated',
 'The RLS probe harness missed v_migration_history',
 'Invoker off, SELECT granted to authenticated, and absent from view_rls_flip_log, so it escaped the 201-view probe entirely. The data is low sensitivity; the finding is that the harness which measured 201 views missed one, so the closure is one view short of complete. Fix the population the probe walks, not just this view.',
 1,'view unmeasured','view_rls_flip_log','Widen the probe population and re-run it','view_rls_flip_log','w-19aug-rls-probe-missed-a-view'),

('Agent W - Watchdog','lane:W','elevated',
 'Seven tables have RLS on, zero policies, and no declared intent',
 'alert_deferral, kpi_freshness_policy, metrc_backfill_window, metric_alias, metric_definition, metric_synonym and metric_usage. Each also carries eight grant rows to anon or authenticated that RLS then silently voids. Nobody can tell whether these are sealed on purpose or an oversight, and an application reading them gets zero rows with no error at all.',
 7,'tables','rls_intent','Declare the intent in rls_intent or write the policy','rls_intent','w-19aug-seven-undeclared-denyall'),

('Agent W - Watchdog','lane:W','elevated',
 'Two hundred and thirty of three hundred and three foreign keys have no supporting index',
 '75.9 percent. Each one turns a parent delete or update into a sequential scan of the child. Concentrated in the newest code: employees 5, open_shifts 7, schedule_draft_lines 5, commission_ledger 5, pay_run_lines 5, shift_swaps 5, hr_incidents 4, pto_ledger 4. Given the statement timeouts on four separate cron jobs this is a plausible contributor rather than only hygiene.',
 230,'unindexed foreign keys','schema','Index the foreign key columns, HR and payroll first','pg_constraint','w-19aug-230-unindexed-fks'),

('Agent B - Front End','lane:B','elevated',
 'Eleven of seventeen pages have no date window at all',
 'dash-plants, cult-genetics, cult-grading, cult-harvest-detail, cult-loss-analysis, cult-moisture-register, cult-room-turn-audit, fin-sales-history, fin-orders, fin-customer-manifests and fin-customers each declare VIEW_KEY and have no setRange, no DateRangeSelect, no p_from or p_to and no date bounds on any query. They do not default to the wrong window, they offer none. A sales HISTORY ledger that reads all time is precisely the owner objection. This is page work, not a one-line hook: each needs range state, the selector and the query parameters.',
 11,'pages','app/web/src','Add range state, selector and query parameters to each','nav_registry','b-19aug-eleven-pages-no-date-range'),

('Agent V - Verifier','lane:V','elevated',
 'One hundred and fourteen registered reports have no role that can open them',
 'v_page_wiring.roles_who_can_see counts nav_role_visibility rows where visible is true, and 114 pages have none, so they render for nobody while still counting as delivered work. Every cultivation dashboard and register is inside that number. Pre-existing debt, deliberately left visible in the ratchet rather than blessed away.',
 114,'reports','nav_role_visibility','Give each an explicit visibility row','v_report_standard','v-19aug-114-reports-nobody-can-open'),

('Data Reconciliation','review:reconciliation','elevated',
 'One gap rule expanded fourteenfold in a single run and now drowns the ledger',
 'gap_alert holds 16,830 rows, of which timestamp_gap is 11,676 or 69.4 percent: 11,456 byte-identical descriptions, exactly one alert per tag, and 0.0 lb at stake on every single one. It went from 746 to 11,676 in the 14:22 run. Fingerprints are unique so these are genuinely new tags rather than re-detections, meaning the detector input population changed. With missing_invoice at 4,818, itself one systemic cause, two causes account for 98.0 percent of the ledger, leaving 336 genuinely distinct rows which is where the weight actually sits: 1,490 lb of harvest shortfall and 323 lb of missing COA.',
 11676,'alerts from one rule','gap_alert','Investigate the population change before the signal becomes unreadable','v_gap_system','r-19aug-timestamp-gap-drowns-ledger'),

('Agent W - Watchdog','lane:W','watch',
 'The table _mv_dept_backup has no primary key',
 'The only one of 448 tables without one. Leftover scaffolding from the dashboard refactor: underscore-prefixed, no owner, no declared intent.',
 1,'table','_mv_dept_backup','Drop it or adopt and name it','_mv_dept_backup','w-19aug-mv-dept-backup-no-pk')

on conflict do nothing;