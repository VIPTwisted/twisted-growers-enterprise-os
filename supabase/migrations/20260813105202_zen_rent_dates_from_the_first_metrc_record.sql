-- Agent I, 13 Aug 2026. DBI-104.
-- OWNER: "for now add to whatever you see first entry or mention of zen date is in metrc; we will
-- update later".
--
-- MEASURED, and it is materially earlier than my assumption. I had set effective_from to
-- 2026-08-01 because that was the start of the current month and I had nothing better. The first
-- Zen record in Metrc is 2025-07-09 — THIRTEEN MONTHS EARLIER.
--     earliest packaged   2025-07-09      (earliest lab-testing date 2025-07-10, one day later)
--     latest packaged     2026-08-10
--     Zen packages ever   147             (120 held today, 27 already finished)
-- Matched with a word boundary: 'zen' as a bare substring also matches "fresh froZEN" and
-- attributed all 418.3 lb of fresh frozen to Zen on my first attempt today.
--
-- WHY THE DATE MATTERS AND WHY I AM NOT DERIVING MONEY FROM IT. months_elapsed goes from 0 to 13.
-- At $6,500 a month that is a large number, and I am deliberately NOT stating it as owed. NOTHING
-- IN THIS PLATFORM KNOWS WHAT ZEN HAS PAID. Elapsed time is not a receivable, and turning one
-- into the other is exactly the invented figure rule A1 forbids. When the owner has the
-- agreement, the real start date and the payment history go in and the arithmetic follows.
--
-- THE DATE IS A PROXY AND IS LABELLED ONE. The first product Metrc saw is not necessarily the day
-- rent began — an agreement usually predates the first run, and a fit-out period may not be
-- chargeable. It is the best evidence we hold and it is flagged for replacement, not presented as
-- fact.
--
-- UNDO: set effective_from back to 2026-08-01.

update client_fee
   set effective_from = date '2025-07-09',
       note = 'Owner, 13 Aug 2026: "I believe it is rent not license fix zen at 6500 a month" and '
              '"for now add to whatever you see first entry or mention of zen date is in metrc; '
              'we will update later". '
              'DATE IS A PROXY, NOT THE AGREEMENT. 2025-07-09 is the earliest Zen package in '
              'Metrc (earliest lab-testing date 2025-07-10; 147 Zen packages ever, 27 now '
              'finished, 120 still held). The real start date is in the rental agreement and will '
              'usually PREDATE the first product — an agreement is signed and a space fitted out '
              'before anything is packaged, and a fit-out period may not be chargeable. Replace '
              'this the moment the agreement is to hand. '
              'NO MONEY IS DERIVED FROM THIS. months_elapsed is elapsed time only; nothing here '
              'knows what Zen has paid, and treating elapsed months as owed would be an invented '
              'figure.',
       set_by = 'Agent I on the owner''s instruction, from Metrc — to be confirmed against the agreement'
 where client_key = 'zen' and fee_type = 'rent';;
