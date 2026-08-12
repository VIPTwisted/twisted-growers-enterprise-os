/* Urgency on the Metrc to-do list, and the two urgent items.
   The owner's standing rule: a Metrc task is not cleared until it is fixed IN
   METRC. fixed_in_metrc already enforces that. Urgency was missing. */

alter table metrc_corrections
  add column if not exists urgency text not null default 'normal',
  add column if not exists evidence_sql text,
  add column if not exists first_seen date,
  add column if not exists last_verified date;

comment on column metrc_corrections.evidence_sql is
  'The query that produced the figures. If a task cannot be re-run from source it is a memory, not a fact.';

insert into metrc_corrections
  (title, urgency, what_is_wrong, why_it_matters, how_to_fix_in_metrc,
   packages_affected, pounds, assigned_to, raised_by, first_seen, last_verified, evidence_sql)
values
(
 'Phantom weight on 271 closed harvests — 24,896.9 lb Metrc believes still exists',
 'urgent',
 'Metrc shows 24,896.9 lb of plant material still sitting inside 271 harvests that are '
 || 'already marked finished, from 11 July 2024 to 4 August 2026. A finished harvest should '
 || 'hold nothing - everything should have been packaged or recorded as waste. The weight is '
 || 'there because moisture loss was never recorded. Metrc simply subtracts packaged and waste '
 || 'from wet weight, so whatever evaporated is still counted as product on hand. '
 || 'NOTE: an earlier figure of 6,796 lb across 88 harvests was carried in the handoff. That '
 || 'figure is wrong. Measured 7 August 2026 it is 271 harvests and 24,896.9 lb.',
 'Metrc is the legal record and it currently says we hold nearly 25,000 lb we do not have. '
 || 'That is an inventory overstatement on a state compliance system. It also corrupts every '
 || 'conversion and yield figure that starts from harvest weight, because the water has never '
 || 'been separated from genuine unaccounted product.',
 E'FOR VINCENT — how to fix in Metrc:\n'
 || E'1. A finished harvest cannot be edited. It must be UNFINISHED first.\n'
 || E'   Plants area > Harvested tab > tick the harvest > Unfinish.\n'
 || E'2. With the harvest open, record the missing weight as moisture loss / waste so the '
 || E'harvest balances to zero remaining.\n'
 || E'3. Re-finish the harvest.\n'
 || E'4. Work oldest first and do a handful as a trial before doing all 271.\n'
 || E'CONFIRM WITH METRC SUPPORT before starting: whether Massachusetts allows unfinishing a '
 || E'harvest this old, and whether moisture is recorded as waste or as a separate adjustment '
 || E'reason. Do not guess on a compliance system.\n'
 || E'DO NOT clear this task until Metrc itself shows zero remaining on these harvests.',
 '271 harvests', 24896.9, 'Vincent', 'verification agent, 7 Aug 2026',
 '2024-07-11', current_date,
 $q$select count(*) filter (where (raw->>'FinishedDate') is not null and (raw->>'CurrentWeight')::numeric > 0) as harvests,
   round(sum((raw->>'CurrentWeight')::numeric/453.592) filter (where (raw->>'FinishedDate') is not null and (raw->>'CurrentWeight')::numeric > 0),1) as phantom_lb
from metrc_harvests$q$
),
(
 'Dry cured weight has not been recorded since March 2026',
 'urgent',
 'The Harvest Yield sheet in the Cultivation Inventory workbook records A bud, B bud, bud rot, '
 || 'trim and dry cured weight per pull. It is populated through March 2026. The two April rows '
 || 'are blank and there is nothing after. Metrc has never held a true dry weight - its '
 || '"Moisture Loss" column is wet minus waste minus packaged on all 273 harvests, an arithmetic '
 || 'remainder rather than a measurement. So since March there is no dry weight recorded '
 || 'anywhere, in Metrc or on paper.',
 'Dry weight is the number the 380 lb monthly contract is measured against. Without it we cannot '
 || 'tell genuine evaporation from product that was dried and never recorded - and those two look '
 || 'identical in the data. It is also why the 82.3 g per plant figure cannot currently be trusted, '
 || 'and that figure decides whether 380 lb a month is achievable at all.',
 E'FOR VINCENT — this one is a process fix, not a Metrc edit:\n'
 || E'1. Ask cultivation why the Harvest Yield sheet stopped after March. Get the answer before '
 || E'assuming anything - the recording may have moved somewhere we have not been shown.\n'
 || E'2. Restart it immediately for every pull: A bud, B bud, bud rot, trim, dry cured weight.\n'
 || E'3. Weigh the dried flower on a scale AFTER drying and BEFORE packaging. That single number '
 || E'does not exist anywhere in Metrc and no report will ever produce it.\n'
 || E'4. Backfill April to August from whatever the drying crew has on paper, if anything.\n'
 || E'DO NOT clear this task until dry weight is being recorded every pull and the gap since '
 || E'April is either filled or formally written off as unrecoverable.',
 'every pull since April 2026', null, 'Vincent', 'verification agent, 7 Aug 2026',
 '2026-04-01', current_date, null
);

select id, urgency, title, pounds, fixed_in_metrc from metrc_corrections order by urgency, raised_on desc;;
