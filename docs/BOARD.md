# Forensic board — current only
As-of: 2026-09-05 10:14Z (06:14 EDT). Certified = 0. Re-derive every line from docs/BOARD_QUERIES.sql. A figure that cannot be re-derived is a claim.

| id | status | figure | as-of |
|---|---|---|---|
| LAW-CERTIFY | HOLD | CERTIFIED requires dual MATCH. Uncertified figures cannot grade staff. | 2026-09-04 |
| XQ1 | ISSUE | moisture 205 items · 5 need action · 17403.5 lb | 2026-09-05 10:14Z |
| XQ2 | ISSUE | never submitted 122 · 47 need action · 105.43 lb | 2026-09-05 10:14Z |
| XQ3 | ISSUE | failed no disposition 257 · 18 need action · 241.94 lb | 2026-09-05 10:14Z |
| XQ4 | ISSUE | harvest open past limit 13 · 6 need action · 221.1 lb | 2026-09-05 10:14Z |
| DEST-MC | PARTIAL | 3773 stored rows. destroyed_on NULL on all 3773. source_row "Destroyed Date" on 3772. The 1 without a date is not a plant — plant_tag='Destroyed Note', a header row ingested as data. | 2026-09-05 10:14Z |
| APEX-303 | ISSUE | Order grain: total_dollars 1710.00 AND apex_subtotal_usd 1800.00. Independent apex_raw: total_raw 171000, subtotal_raw 180000, divisor 100. Metrc manifest 0002892412 declared 1800.00 = subtotal, not total. foreign_manifests 13. link_status FALSE MATCH money reconciles. Do not rewrite. | 2026-09-05 10:14Z |
| APEX-BOOK | UNCERTIFIED | 1860 live invoices. Certificate 1739 is dead. Partition sums to 1860. Dual MATCH required. | 2026-09-05 10:14Z |
| APEX-MATCH | UNCERTIFIED | 680 live. Certificate 679 recanted. | 2026-09-05 10:14Z |
| APEX-VD | ISSUE | 198 live VALUE DIFFERS. Named exception. Do not blend. | 2026-09-05 10:14Z |
| PKGINV | ISSUE | Headers 33 (not 34 — DISAGREE with watcher 34; do not average). Live 2. Undone 31. Live A: 9cf5143d MP281909 446 stored vs 446 stated as-of 2026-08-06. Live B: 18807117 MC281714 62 stored vs 62 stated as-of 2026-08-06. 508 rows = 62+446 owned by those two. stated_total on both live headers is a ROW COUNT, not pounds. Quantity mixes g/lb/ea — totals refused. This report is current inventory by date filter, not a certified close. Do not bind 508 to a close. | 2026-09-05 10:14Z |
| WASTE-MC | ISSUE | 4407 keys MATCH. waste_qty mixed uom. Total only via v_waste_qty_truth. Ledger not rewritten. | 2026-09-04 |
| PR120 | IN_PROGRESS | 914 grok blanket policies dropped. leftover 0. public RLS 859. Dump not landed. Do not merge 114–121 until dump. | 2026-09-05 08:25Z |
| CERTIFIED | HOLD | 0 | 2026-09-05 10:14Z |
