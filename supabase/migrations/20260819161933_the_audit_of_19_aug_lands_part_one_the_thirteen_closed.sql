/* PART ONE of the 19 Aug audit pass: the thirteen defects found AND closed
   today, each carrying its resolution. A finding with no record of what was
   done about it makes the next pass rediscover it. */
insert into agent_findings
  (agent, agent_key, severity, headline, detail, metric, units, scope, action, drill_to, fingerprint, resolved_at, resolution)
values
('Agent X - Challenger','lane:X','critical',
 'useNav resolved the owner to guest when its read failed',
 'App.jsx:428 discarded the app_users error, so any failed read silently became the lowest role and removed 151 of 665 menu entries including Command Center. Line 437 discarded the nav_role_visibility error in the OPPOSITE direction, emptying the hidden set and opening every page to whoever was looking. useRole was repaired for exactly this on 16 Aug; this second reader of the same fact was missed.',
 151,'menu entries lost','app/web/src/App.jsx','Bind both errors; never substitute a role','App.jsx:424','x-19aug-usenav-guest-downgrade', now(),
 'FIXED 19 Aug, commit c551155. Both reads bind their error, the menu is blanked rather than guessed, and navError surfaces in the rail.'),

('Agent X - Challenger','lane:X','critical',
 'Stop and save discarded the time_tracks insert, losing worked time in silence',
 'App.jsx:265 awaited the insert without binding error. A refused write cleared the running track and reset the panel to 0:00:00, indistinguishable from a save that worked. This is worked time that feeds payroll.',
 null,'hours','app/web/src/App.jsx','Bind the error, keep the clock running','App.jsx:265','x-19aug-stoptrack-silent-loss', now(),
 'FIXED 19 Aug, commit c551155. On failure the clock keeps running, nothing is cleared, and the elapsed time and the reason are shown.'),

('Agent V - Verifier','lane:V','critical',
 'Report subtotals added milligrams to pounds to Each',
 'rpSubtotal guarded weight_basis and nothing guarded uom. On metrc_packages, quantity and uom are columns 5 and 6, both inside the default fourteen shown, so the page opened printing a GREEN totals-are-the-sum-of-the-rows-shown chip over 9,451,735.6 of nothing: 6,076,749.6 Grams plus 1,147,117.8 g plus 108,801 Each plus 6,607.3 Milligrams plus lb and kg plus 2,085,765.9 with no unit recorded at all.',
 9451735.6,'meaningless sum','metrc_packages report','Refuse the total when units differ after normalisation','App.jsx rpSubtotal','v-19aug-uom-mixed-subtotal', now(),
 'FIXED 19 Aug, commit c551155. Units are normalised (Grams/g and Each/ea are one unit written twice) then compared; more than one surviving unit refuses the total and names each unit with its row count.'),

('Agent V - Verifier','lane:V','elevated',
 'Exports of over-ceiling objects carried no truncation warning',
 'withFullRows computed the truncation flag and handed it to the callback; all four export buttons dropped it, and exportMeta fell back to component state that only the on-screen read ever writes. Exporting metrc_import_backup at 255,193 rows without first pressing Load all produced a file headed Rows in this export 50000 with no WARNING row. Four registered objects exceed the ceiling today, and these files carry their own provenance into audits.',
 4,'objects over ceiling','report engine exports','Pass the flag from withFullRows into exportMeta','App.jsx withFullRows','v-19aug-export-truncation-silent', now(),
 'FIXED 19 Aug, commit c551155. exportMeta takes wasTruncated as a required argument and all four buttons pass it through.'),

('Agent V - Verifier','lane:V','elevated',
 'New column filters seeded an operator the column type does not have',
 'The add-filter button hard-coded the contains operator while the column-change handler twenty lines below correctly derived it from the column kind. First-column kinds across 592 registered objects: 501 text, 73 number, 17 date, 1 boolean. On those 91 the operator select held a value with no matching option, and one keystroke sent a text match at a bigint. Proven live: ERROR 42883 on metrc_packages. The engine then advised clearing and re-adding the filters, which reproduces it exactly.',
 91,'objects affected','report engine filters','Derive the default operator from the column kind','App.jsx filters','v-19aug-filter-op-seed', now(),
 'FIXED 19 Aug, commit c551155. The add button now uses the same kind-derived default that the change handler already used.'),

('Agent V - Verifier','lane:V','elevated',
 'A custom date range saved everywhere dropped both dates and said it saved',
 'The everywhere scope wrote only default_date_preset to user_settings, which had no column able to hold a custom range, while f_date_default read custom dates only from user_page_date_default. Saving a custom range for every page kept the word custom, discarded both dates, and reopened on ALL DATES while telling the user it had saved. Opening on all history is the owner explicit objection.',
 null,null,'user_settings and f_date_default','Add the columns and read them in precedence order','f_date_default','v-19aug-custom-range-dropped', now(),
 'FIXED 19 Aug, migration 20260819143232 and commit c551155. user_settings gained custom_from and custom_to, f_date_default coalesces page scope then user scope in the same order as preset_key, and the client writes all three fields in both scopes.'),

('Agent V - Verifier','lane:V','watch',
 'The date-defect chip branded empty objects as defective views',
 'dateCols is derived from the values the 200-row probe returned, so it is empty in three completely different situations and this branch called all three a defect in the view. It fired while the probe was still in flight, so the red chip flashed on every auto page on every navigation; it fired on top of the permission panel when the object could not be read at all; and it fired on at least 97 registered objects that hold a real date column and simply have no rows yet.',
 97,'objects falsely flagged','report engine toolbar','Separate loading, unreadable, empty and genuinely dateless','App.jsx dateCols','v-19aug-datepolicy-chip-overfire', now(),
 'FIXED 19 Aug, commit c551155. Four distinct states, each saying which one it is, and only the last is called a defect.'),

('Agent B - Front End','lane:B','elevated',
 'Sixteen enabled menu entries reached nothing at all',
 'Sixteen enabled nav_registry rows had neither a registered object nor a component in App.jsx, so every click was a dead end. Eight had a real readable object sitting behind them the whole time with nothing but the link missing. Eight have no object anywhere in this database. Measured against the database, all 630 rows that DO name a table_ref resolve, so registered-but-not-built was zero.',
 16,'dead menu entries','nav_registry','Wire what exists; disable what does not','nav_registry','b-19aug-dead-menu-entries', now(),
 'FIXED 19 Aug, migration 20260819142814. Eight wired to their real objects: v_owner_issue_queue, v_dept_dash_cfo, v_cfo_inventory_audit, app_users, v_tag_movement_forensic, v_goal_status, hr_incidents and v_harvest_lineage_summary. Eight disabled with the reason kept in each description. Dead ends now zero.'),

('Agent B - Front End','lane:B','elevated',
 'Two finished pages were reachable only by typing the address',
 'dash-schedule.jsx and dash-plants.jsx are built, routed in App.jsx and pass every gate, and carried ZERO nav_registry rows. Built and unreachable is the same as unbuilt to the person using it.',
 2,'orphaned pages','nav_registry','Add nav rows and inherit sibling visibility','nav_registry','b-19aug-orphaned-pages', now(),
 'FIXED 19 Aug, migrations 20260819142814 and 20260819144038. Both on the Cultivation menu, visibility inherited from dept_dash_cultivation rather than invented, plus page_permissions for six roles. The report-contract gate caught the first attempt and was right to: they had no visibility rows and so no role could open them.'),

('Agent B - Front End','lane:B','watch',
 'A raw null byte made fin-kit.jsx binary to git and grep',
 'fin-kit.jsx line 89 held a literal null byte inside a string used as a sentinel key for an unrecorded unit. Valid at runtime, but git and grep both classified the file as binary, so it was invisible to every content search and produced no readable diff.',
 1,'source file','app/web/src/fin-kit.jsx','Use the escape form instead of the raw byte','fin-kit.jsx:89','b-19aug-nul-byte-finkit', now(),
 'FIXED 19 Aug, commit c551155. Replaced with the unicode escape form: identical at runtime, and the file is text again.'),

('Agent W - Watchdog','lane:W','critical',
 'Three matviews had never refreshed once, and the healer logged success',
 'matview_heal_policy carried active rows for mv_stock_proof, mv_ownership_verdict and mv_tag_documents with refresh_fn NULL, and no function in this database refreshed any of them: the policies pointed at a refresher that was never built. f_heal_stale_matviews formats the function name as an SQL identifier and a NULL identifier throws. Over seven days: 282 of 282 failed, 171 of 171, 69 of 69. Not one success ever, while cron job heal-stale-matviews recorded 481 successes over the same window because it caught its own error and returned a success-shaped result.',
 522,'failed refreshes','matview_heal_policy','Build the refresher and make refresh_fn NOT NULL','matview_refresh_run','w-19aug-heal-policy-null-refreshfn', now(),
 'FIXED 19 Aug, migration 20260819144949. tg_refresh_proofs serves all three, logs one row per matview, lets a failure in one not stop the next two, and returns ok=false if ANY of them failed. refresh_fn is now NOT NULL so this cannot recur. First run all green: 22.4s, 36.1s, 2.3s.'),

('Data Reconciliation','review:reconciliation','critical',
 'Ninety pounds of active dried flower missing from the mass balance',
 'Six tags, three in Cure Vault and three in Pre Trim Storage, on hand and active in Metrc and absent from mv_stock_proof, the mass-balance source of record. 15.01 times three plus 14.99 times three is 90.00 lb.',
 90.00,'lb','mv_stock_proof','Establish the cause before treating it as a stock discrepancy','mv_stock_proof','r-19aug-90lb-missing-stock-proof', now(),
 'WITHDRAWN 19 Aug. It was STALENESS, not missing stock. mv_stock_proof had never once refreshed, see w-19aug-heal-policy-null-refreshfn. After the first successful refresh all six tags are present, active packages missing from the proof is ZERO, and the proof went from 1,369 to 1,397 rows. Root cause fixed and no stock was ever unaccounted for. Recorded as withdrawn rather than deleted: the symptom was real and the reasoning is what stops the next pass re-raising it.'),

('Agent W - Watchdog','lane:W','critical',
 'Six views granted select to anon, none of them on the allowlist',
 'v_cfo_spend_ageing, v_cfo_spend_by_supplier, v_cfo_spend_by_tag, v_cfo_spend_by_year, v_cfo_spend_coverage and v_goal_status carried SELECT to anon and appeared on no allowlist, so nothing in the platform knew they existed. The nightly self-check counts grants, so HANDOFF.md opened with SECURITY FAILING every morning, which is how a real failure gets read as background noise.',
 6,'relations','grants','Revoke from anon AND public','security_anon_allowlist','w-19aug-six-anon-select-grants', now(),
 'FIXED 19 Aug, migration 20260819153259. Tested before being called a breach: all six are security_invoker and the chain already denied at v_monthly_conversion_truth, so ZERO ROWS EVER LEAKED. Dead grants, not an open door. Revoked from anon AND public anyway, because revoking anon alone is a no-op while public holds the same grant and a dead grant stays dead only while the views underneath happen to deny. authenticated keeps v_goal_status because it now serves the Goals and Scorecards menu entry. Platform-wide anon and public SELECT is now zero and the handoff reads Security invariants hold.')

on conflict do nothing;