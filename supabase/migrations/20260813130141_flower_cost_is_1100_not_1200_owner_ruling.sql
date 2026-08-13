-- Agent I, 13 Aug 2026. DBI-111. OWNER RULING: "MAKE IT 1100 NOT 1200".
--
-- inventory_cost_rate held global/flower at $1,200/lb, taken from the cost spreadsheet ("Summary
-- Q6, Flower @ $1200/lb — the cost basis for 1 g raw pre-roll"), against the $1,100 the owner
-- gave as the average cost to manufacture. I surfaced the 9% difference rather than picking, and
-- he has ruled: $1,100 everywhere.
--
-- CLOSED AND SUPERSEDED, NOT EDITED. The $1,200 row is given an effective_to of yesterday and a
-- new row starts today at $1,100. That is the rule I wrote into this table's own comment three
-- migrations ago and it matters here: any figure published while $1,200 was in force must still
-- reproduce at $1,200. Editing the amount in place would silently restate every historical
-- pre-roll cost and nobody would be able to tell why last month's number moved.
--
-- BLAST RADIUS, measured rather than assumed. Two objects read inventory_cost_rate:
-- v_provisional_standards and v_schedule_cost_detail. The schedule-cost view reads
-- material = 'manufacture_average' and is untouched by this. So the change reaches the
-- provisional standards surface and the raw pre-roll cost basis that the spreadsheet built on
-- $1,200 — a raw pre-roll's flower content now costs 8.3% less, which flows into pre-roll margin.
--
-- WORTH SAYING PLAINLY: this makes the flower cost basis and the average manufacture cost the
-- SAME NUMBER. That is now the owner's stated position and it is one definition rather than two,
-- which is the direction this platform is meant to move in. But they were originally different
-- ideas — a full cost basis for costing a product, and an average for measuring lost production —
-- and if the P&L later separates them, they separate as two dated rows, not by editing one.
--
-- UNDO: reopen the $1,200 row (effective_to = null) and close the $1,100 one.

update inventory_cost_rate
   set effective_to = current_date - 1,
       note = note || ' | SUPERSEDED 13 Aug 2026 by owner ruling "MAKE IT 1100 NOT 1200". Kept '
              'open-ended until yesterday so any figure published while it was in force still '
              'reproduces at $1,200.',
       updated_at = now()
 where scope = 'global' and material = 'flower' and effective_to is null;

insert into inventory_cost_rate
  (scope, scope_key, material, cost_per_lb, currency, effective_from, set_by, note, evidence_status)
values
('global', null, 'flower', 1100, 'USD', current_date, 'Owner (Vinny)',
 'Owner ruling 13 Aug 2026: "MAKE IT 1100 NOT 1200". Replaces the $1,200 taken from the cost '
 'spreadsheet (Summary Q6), aligning the flower cost basis with the $1,100 average cost to '
 'manufacture he gave the same day — one number instead of two. '
 'IT MOVES PRE-ROLL COSTING: the flower content of a raw pre-roll now costs 8.3% less, which '
 'flows into pre-roll margin wherever that is computed. '
 'THE $1,100 ITSELF IS PROVISIONAL: "THIS NUMBER FLEXUATES PER P&L EACH MONTH FOR NOW USE 1100.00 '
 'UNTIL WE GET P&L THEN WE WILL CORRECT IF NEEDED". To change it, close this row and insert a new '
 'one — never edit the amount, or every historical figure restates silently.',
 'owner_set');;
