# Forensic board — current only
As-of: 2026-09-05 10:57Z (06:57 EDT). Certified = 0. Re-derive from docs/BOARD_QUERIES.sql.

| id | status | figure | as-of |
|---|---|---|---|
| LAW-CERTIFY | HOLD | CERTIFIED requires dual MATCH | 2026-09-04 |
| XQ1 | ISSUE | moisture 205 · 5 need action · 17403.5 lb | 2026-09-05 10:14Z |
| XQ2 | ISSUE | never submitted 122 · 47 need action · 105.43 lb | 2026-09-05 10:14Z |
| XQ3 | ISSUE | failed 257 · 18 need action · 241.94 lb | 2026-09-05 10:14Z |
| XQ4 | ISSUE | open harvest 13 · 6 need action · 221.1 lb | 2026-09-05 10:14Z |
| DEST-MC | PARTIAL | 3773 stored. destroyed_on NULL. 3772 dated from source_row. 1 is plant_tag='Destroyed Note' (header ingested as data) | 2026-09-05 10:14Z |
| APEX-303 | ISSUE | total_dollars 1710.00 from total_raw 171000/100. apex_subtotal_usd 1800.00 from subtotal_raw 180000/100. Metrc 0002892412 = 1800 (subtotal). foreign_manifests 13. Do not rewrite | 2026-09-05 10:14Z |
| APEX-BOOK | UNCERTIFIED | 1860 live. Certificate 1739 dead | 2026-09-05 10:14Z |
| PKGINV | ISSUE | Headers 33 not 34. Live 2: 9cf5143d MP 446/446, 18807117 MC 62/62 as-of 2026-08-06. stated_total is row count not pounds. Do not bind 508 as a close. Totals refused | 2026-09-05 10:14Z |
| HELP-OS | IN_PROGRESS | os_help enabled. default_range null (was today — fake period). PR #117. This pane: /users /permissions /help · 14 guides | 2026-09-05 10:57Z |
| PR120 | IN_PROGRESS | leftover grok policies 0. public RLS 859. Dump not landed. Do not merge 114–122 until dump | 2026-09-05 10:57Z |
| CERTIFIED | HOLD | 0 | 2026-09-05 10:57Z |
