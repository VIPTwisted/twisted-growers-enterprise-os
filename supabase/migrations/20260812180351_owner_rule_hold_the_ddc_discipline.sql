-- Agent I, 12 Aug 2026. DBI-075.
-- OWNER, 12 Aug 2026: "PLEASE STAY ON THE ORANIZATION AND THE DISCIPLINE GPT HAS! THAT IS MOST
-- IMPORTANT." Standing instruction, above feature work.

insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status)
values
('hold_the_ddc_discipline','1','rule',
 'ONE definition of each thing. The discipline is the deliverable — above any feature.',

 'The owner''s DDC platform beat ours on SYSTEM DISCIPLINE, not on features: one status-chip '
 'vocabulary, one date pattern, honest empty states everywhere, a rule banner on every admin '
 'page, a diagnostic footer carrying real data age. Ours accreted page by page and that is the '
 'whole gap. THE TEST IS COUNTABLE, NOT AESTHETIC — for any primitive, count the definitions. '
 'More than one is the defect, and it is a defect even when both copies look fine. '
 'MEASURED VIOLATIONS, 12 Aug 2026, all still open: TWO chrome systems live at once (Command '
 'Center KPI 22px, every other dashboard 30px — the same figure, two sizes, two pages). SIX '
 'status-chip variants, two of them BYTE-IDENTICAL duplicate definitions. THREE collapse '
 'affordances, and 2 of 13 sections cannot collapse at all. SIX primitives defined twice '
 '(CcTag/DkTag, CcErr/DkErr, ccAge/dkAge, CcReports/DkReports, CcTasks/DkTasks, CpPanel/Widget) '
 'and in every case the local copy is the POORER one — CcReports lost the escape action DkReports '
 'has. ELEVEN empty states, ONE with an escape action, while the shared DkEmpty accepts an action '
 'prop and is used zero times. TWO "qualified room" formats on one page. '
 'THE RULES THAT FOLLOW: share primitives, NEVER layouts — one ReportScreen behind 522 pages was '
 'the CAUSE of the bugs, so a roster is not a ledger is not a punch log. Every empty state says '
 'WHY it is empty, WHAT fills it, and offers a way out. Every claim of freshness reflects DATA '
 'age, never computation age. Plain English beside professional language. Name the gate and the '
 'number — "looks good" is banned. And when a second definition appears, DELETE ONE; do not '
 'improve both.',

 'Owner 12 Aug 2026: "PLEASE STAY ON THE ORANIZATION AND THE DISCIPLINE GPT HAS! THAT IS MOST '
 'IMPORTANT." Following his 11 Aug ruling that DDC is the design bar ("THIS IS THE WORK I DID '
 'WITH GPT! FAR SUPERIOR THAT CLAUDE. THAT IS MY HONEST TAKE") and the final formula he confirmed: '
 'DDC''s discipline wearing TG''s skin. Patterns cross between the two companies; DATA NEVER does.',
 'Owner (Vinny)', 'owner_set')
on conflict (key) do update set
  label = excluded.label, what_it_means = excluded.what_it_means,
  where_it_came_from = excluded.where_it_came_from, updated_at = now();;
