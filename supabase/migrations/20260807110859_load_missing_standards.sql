/* THE STANDARDS THAT WERE NEVER ENTERED
   -------------------------------------
   The 380 lb monthly minimum - the single most important number in the
   business, written into the cultivators' contract - was not in the register
   at all. Zero rules referenced it. That is the direct reason nothing alerted
   while the business ran at 61% of contract for seven months. Not a bug: the
   platform was never told.

   Room capacity was held as 1,150, which is an average (4,380 divided by four)
   and a number no room has ever reached in fifty pulls. The two real sizes are
   1,140 and 1,050 and they are in the owner's own schedule.

   Fresh frozen allocation is deliberately NOT entered. The choice between 50
   and 100 plants a pull depends on what rosin actually needs, and nobody has
   asked manufacturing yet. Inventing it would be exactly the failure these
   rules exist to prevent. */

insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
values
('monthly_min_dried_flower_lb', 380, 'lb',
 'Minimum dried flower per month',
 'The contracted floor for finished dried flower each month. Fresh frozen does not count towards it.',
 'The cultivators'' contract, confirmed by the owner 6 Aug 2026: "THIS IS WHAT OUR CULTIVATORS ARE CONTRACTED TO GROW 380 ... WE NEED 380LBS DRIED FLOWER".',
 'owner, contractual', 'confirmed',
 'Measured against packaged dried flower only. Fresh frozen is packaged wet at field moisture and is a separate stream.'),

('room_capacity_f1', 1140, 'plants', 'F1 room capacity',
 'Plants F1 holds at a full pull. F1 and F3 are the two larger rooms.',
 'TG 2026 Harvest Calendar plans F1 at 1,140 on five of six pulls. Metrc confirms: eleven pulls since July 2024, highest ever 1,140, never exceeded.',
 'harvest calendar + 11 pulls of Metrc evidence', 'confirmed',
 'Owner confirmed two room sizes 7 Aug 2026.'),

('room_capacity_f2', 1050, 'plants', 'F2 room capacity',
 'Plants F2 holds at a full pull. F2 and F4 are the two smaller rooms.',
 'TG 2026 Harvest Calendar plans F2 at 1,050 on all six pulls, never varying. Metrc confirms: fifteen pulls, highest ever 1,050, never exceeded.',
 'harvest calendar + 15 pulls of Metrc evidence', 'confirmed', null),

('room_capacity_f3', 1140, 'plants', 'F3 room capacity',
 'Plants F3 holds at a full pull.',
 'Metrc: twelve pulls, highest ever 1,140. F3 hit exactly 1,140 three times running in 2026 against a plan asking only 950 - so 1,140 is demonstrably achievable, not aspirational.',
 'harvest calendar + 12 pulls of Metrc evidence', 'confirmed', null),

('room_capacity_f4', 1050, 'plants', 'F4 room capacity',
 'Plants F4 holds at a full pull.',
 'TG 2026 Harvest Calendar plans F4 at 1,050 on six of seven pulls. Metrc: twelve pulls, highest ever 1,050.',
 'harvest calendar + 12 pulls of Metrc evidence', 'confirmed', null),

('annual_plant_target', 28470, 'plants', 'Plants required per year',
 'Thirteen large pulls at 1,140 plus thirteen small at 1,050. Every harvest is expected at room capacity.',
 'Owner 7 Aug 2026: "this is required expection". The 2026 rotation falls exactly thirteen large and thirteen small, and 1,140 + 1,050 = 2,190 which matches the monthly totals Metrc reports for March, May and July.',
 'owner', 'confirmed', null),

('changeover_days_max', 2, 'days', 'Longest acceptable changeover',
 'Cut to the next crop being in the room. One day is the standard; two is the ceiling.',
 'Owner 7 Aug 2026: "we need 1-2 day change over". The TG 2026 Harvest Calendar already carries a Day 2 Replant Date on all 26 pulls, so the one-day turnaround was always the plan.',
 'owner + harvest calendar', 'confirmed',
 'Nothing currently measures this. Changeover is harvest date to replant date and needs the plant batch records to compute.'),

('weekend_pull_shift_days', 2, 'days', 'Weekend pull moves earlier by up to',
 'A scheduled pull landing on a weekend moves EARLIER by one or two days. Never later.',
 'Owner 7 Aug 2026: "if falls on weekend we cut it short a day or two; better to cut a little early than lose full harvest". The workbook has a Friday Harvest Flag column for exactly this and it reads No on all 26 rows - the mechanism exists and has never been used.',
 'owner', 'confirmed',
 'All six F1 pulls in 2026 fall on a Sunday. Every other pull in the year is a Monday. Shifting F1 by one day removes the problem permanently.'),

('grams_per_plant_for_contract', 72.6, 'grams per plant',
 'Yield per plant needed to meet the contract',
 'What each plant must produce for 28,470 plants to deliver 4,560 lb of dried flower a year. Rises if any plants go to fresh frozen.',
 'DERIVED, not measured: 4,560 lb x 453.592 g = 2,068,379 g, divided by 28,470 plants = 72.6 g. Only 2 g above the 70.6 the harvest plan is built on. At 50 plants per pull to the freezer the requirement becomes 76.1 g; at 100 it becomes 80.0 g.',
 'derived from the contract and the plant target', 'derived',
 'This is arithmetic, not a measurement. It moves whenever the plant target or the freezer allocation changes.')

on conflict (key) do nothing;

select key, value, unit, evidence_status from conversion_factors
where key in ('monthly_min_dried_flower_lb','room_capacity_f1','room_capacity_f2',
              'room_capacity_f3','room_capacity_f4','annual_plant_target',
              'changeover_days_max','weekend_pull_shift_days','grams_per_plant_for_contract')
order by key;;
