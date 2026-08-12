-- Agent I, 12 Aug 2026. DBI-067.
--
-- OWNER, verbatim: "THESE MUST SYNC EFFECTIVE TODAY ... THIS IS THE CALCUATOR SAVE SO I DO NOT
-- HAVE TO KEEP SHARING THESE."
--
-- He has now handed over the three spreadsheets the company actually runs on. They were the
-- missing half of half a dozen findings: the finished-goods figures, the COA links, the
-- expiration dates Metrc returns empty, the vape and pre-roll costs, and the reorder thresholds.
-- All three are owned by Bert@twistedgrowers.com and all three were modified within two minutes
-- of each other on 12 Aug 2026 - they are live, maintained daily, and they are the SYSTEM OF
-- RECORD for what they hold.
--
-- THIS TABLE EXISTS SO HE NEVER SHARES THEM AGAIN. Any agent needing a sheet reads this registry
-- and gets the file id. Nobody asks the owner twice and nobody guesses a file id - the Drive tool
-- rejects invented ids, and a guessed id that happens to resolve would silently read the wrong
-- company's data.
--
-- DIRECTION IS READ-ONLY, ALWAYS. Owner's standing rule: "no manual edits allowed from OS must be
-- made only on spreadsheet this is for reporting and planning." These sheets are edited by people
-- in the building. The platform reads them and never writes back.
--
-- UNDO: drop table sheet_source.

create table if not exists sheet_source (
  sheet_key     text primary key,
  file_id       text not null unique,
  title         text not null,
  owner_email   text not null,
  what_it_holds text not null,
  why_it_matters text not null,
  tabs_known    text[],
  direction     text not null default 'read-only'
                check (direction in ('read-only')),
  parse_traps   text,
  registered_by text not null default 'Agent I',
  registered_at timestamptz not null default now()
);

alter table sheet_source enable row level security;
drop policy if exists ss_read  on sheet_source;
drop policy if exists ss_write on sheet_source;
create policy ss_read  on sheet_source for select to authenticated using (true);
create policy ss_write on sheet_source for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

comment on table sheet_source is
 'The owner''s three live spreadsheets, registered 12 Aug 2026 so he never has to share a link '
 'again — "SAVE SO I DO NOT HAVE TO KEEP SHARING THESE". Any agent needing one reads this table '
 'for the file id. Never guess a Drive file id. Direction is READ-ONLY without exception: these '
 'are edited by people in the building and the platform mirrors them, never the reverse.';

insert into sheet_source (sheet_key, file_id, title, owner_email, what_it_holds, why_it_matters, tabs_known, parse_traps) values

('manufacturing_product_inventory','1GBTlv8kfAQeaFacrKZXj9Sxm3mKjW-ncw5lOwEwGnR0',
 'Manufacturing Product Inventory','Bert@twistedgrowers.com',
 'Finished goods on hand for the sales team: status (Ready To Ship / Packaging / Production), '
 'three Metrc tags per row (Bulk, Pre-Fill Holding, Final Product), production batch, strain, '
 'size, bulk available, total filled, total packaged, cases available, creation and expiration '
 'dates, TAC%, total terpenes, total THC%, LINK TO COA, inventory check initials and date, '
 'days to expiration, expiry flag, reorder threshold and low-stock flag.',
 'Owner: "THIS IS INVENTORY ON HAND FINISHED GOODS THIS MUST MUST MUST BE ON OUR COMMAND CENTER '
 'FOR COO AND CEO AS THEY ARE VERY INVOLVED IN SALES." It also carries two things the platform '
 'was failing to find elsewhere: certificate links for finished goods, and real EXPIRATION DATES '
 'for tags where Metrc returns ExpirationDate, SellByDate and UseByDate empty on all 4,496 rows.',
 array['Solventless','Hydrocarbon'],
 'Column sets differ per tab (Bulk Available vs Total Bulk; Hydrocarbon adds Product '
 'Description). Any of the three tag columns can hold the literal N/A. Production rows are SHORT '
 'and carry IN CURE where a tag belongs — positional parsing will mis-assign. Dozens of trailing '
 'fill-down rows read 0.00,,,48,. Total Terpenes sometimes holds "Not Tested" and at least one '
 'row has a value shifted into the wrong column. Percentages arrive as "94.08%" strings. Dates '
 'are US M/D/YYYY. COA links are bit.ly redirects, not durable references.'),

('cultivation_inventory','1jQFo975JypMmmDemvm2t9PA2vqsKEyVQ95q1PI4IBZM',
 'Cultivation_Inventory_Sheet','Bert@twistedgrowers.com',
 'Packaged flower and bulk flower on hand: bulk and final-product Metrc tags, strain, batch id, '
 'bulk grams and pounds, projected and completed cases, case size, weight, THCA%, physical '
 'inventory check initials and date, and location for bulk smalls.',
 'It holds the four packages that account for 60.04 lb of the 68.5 lb COA blockage — tags '
 '...006115 Gush Mintz 31.35%, ...006117 Lemon Drop 30.48%, ...006119 Orange Cream 30.31%, '
 '...006121 Fuji Tart 29.80%, all batch 20260805 (A), all 6,810 g = 15.00 lb. A recorded THCA '
 'figure means a lab result exists, which corroborates Metrc''s TestPassed and confirms the '
 'owner''s position that the missing certificate is a retrieval defect, not missing material.',
 array['Packaged Flower (3.5g)','Bulk Flower (SMALLS)'],
 'COLUMNS ARE SHIFTED: the header begins "Projected Avail. Date" but data rows begin at the tag, '
 'and some rows carry two Metrc tags while others carry one. Match by value shape (a Metrc tag '
 'is 24 characters), never by position. WEIGHTS OVER 999 CARRY A THOUSANDS COMMA — "1,932.00" '
 'splits into two fields in any CSV read, and several rows are affected. Trailing 0.00 rows are '
 'fill-down, not data.'),

('manufacturing_production_calculator','1RowubvLaEQhfr26w6ZfDHxQ-DJE6rpul1xjvtgVrzhk',
 'manufacturing Production worksheet','Bert@twistedgrowers.com',
 'THE COST CALCULATOR. Per-gram production cost for every manufactured form, built from run '
 'sizes, yields and labour: liquid diamond vape 0.5g $6.93 and 1.0g $10.11; cured resin vape '
 '1.0g $6.68; hydrocarbon cured badder 1.0g $7.84 and 3.5g $20.15; rosin $14.00/g; bubble hash '
 '$11.31/g; crude $4.89/g; diamonds $5.30/g; liquid diamonds $6.12/g. Pre-rolls by formulation: '
 '50/50 flower:trim costs $2.25 to produce against $2.75 wholesale (profit $0.50), 30/70 costs '
 '$1.78. Plus a moisture-correction calculator: target dry flower $1,047/lb, target trim $300/lb, '
 'average trim yield 32.23%, cost-allocated dry price $806.24/lb, FRESH FROZEN $161.248/lb. '
 'A standard batch is 6,810 g = 15 lb; a fresh-frozen batch is 27,240 g = 60 lb.',
 'Owner ruled that vape and pre-roll costs MUST be pulled from here and never double-dipped '
 'against the concentrate material they consume: "VAPES USE A % OF CONCENTRATE MATERIAL THESE '
 'COSTS SHOULD BE IMPUTED BY US MANUALLY ... MUST BE PULLED FROM THAT SPREADHSEET" and "REGULAR '
 'PRE-ROLLS ... PULL FROM THE SPREADSHEET THE MIX OF FLOWER AND TRIM 50/50". This is also the '
 'only place the company states a fresh-frozen price, which bears on the unsettled wet-to-dry '
 'ratio (4.5 configured against 4.17 measured). It explains the four 15.01 lb packages too: '
 '15 lb is the designed batch size, not a coincidence.',
 array['Summary Sheet'],
 'It is a CALCULATOR, not a table: figures sit in a wide grid with several independent blocks '
 'side by side on one sheet, and labels share rows with values. Cells marked "can edit" are '
 'assumptions the owner tunes, NOT measurements — record which is which. Hardware pricing '
 'already includes a 22.5% tariff charge dated 2/8/2026. Do not reverse-engineer a wet-to-dry '
 'ratio from the prices here without ruling from the owner; price allocation is not moisture.')

on conflict (sheet_key) do update set
  file_id = excluded.file_id, title = excluded.title,
  what_it_holds = excluded.what_it_holds, why_it_matters = excluded.why_it_matters,
  tabs_known = excluded.tabs_known, parse_traps = excluded.parse_traps,
  registered_at = now();;
