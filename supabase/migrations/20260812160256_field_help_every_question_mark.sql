-- Agent I (Database COO), 12 Aug 2026. DBI-050 (reviewers V, X, W). Owner: GO.
-- "Each section will require a very small question mark. Once the user hits it, it explains how
-- to read each field, the drop down and data for each field."
--
-- RULE 12: page_help (6 rows) and page_explainers (3 rows) already exist and are PAGE-level -
-- what_this_shows, how_to_read, watch_for, metrc_terms. They stay. This is the FIELD level
-- beneath them, which is where the owner's actual confusion lived today: he read "Last pack
-- 2026-08-12" on an April harvest and concluded something was broken. Nothing was broken - the
-- FIELD means something other than what its name suggests, and no page-level paragraph would
-- have told him.
--
-- THE FIELD IS WHERE MEANING HIDES. "Really left" is a model, not a count. "Last pack" is the
-- most recent package CITING this harvest in its lineage, and blends cite many harvests at once
-- (owner ruling D4). "Old wet-minus-dry figure" is Metrc's own legal record, not a deprecated
-- number. Each of those cost real time today.
--
-- WRITTEN FOR A NEW MANAGER, NOT A DEVELOPER (rule I3): plain English first, the trap named
-- explicitly, and where a figure is derived the arithmetic and its assumption stated - because
-- a modelled number presented as counted is the failure this whole platform exists to prevent.
--
-- UNDO: drop view v_field_help_lookup; drop table field_help.

create table if not exists field_help (
  id            bigserial primary key,
  page          text not null,
  section       text not null,
  field         text not null,
  plain_english text not null check (length(btrim(plain_english)) >= 20),
  how_to_read   text,
  where_it_comes_from text,
  the_arithmetic text,
  watch_out_for text,
  is_derived    boolean not null default false,
  written_by    text not null default 'Agent I',
  updated_at    timestamptz not null default now(),
  unique (page, section, field)
);

alter table field_help enable row level security;
drop policy if exists fh_read  on field_help;
drop policy if exists fh_write on field_help;
create policy fh_read  on field_help for select to authenticated using (true);
create policy fh_write on field_help for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

comment on table field_help is
 'What every "?" on the platform reads. One row per page/section/FIELD - the level beneath '
 'page_help, and the level where meaning actually hides. Written for a new manager, not a '
 'developer (rule I3). is_derived = true means the figure is calculated or modelled rather than '
 'counted, and the_arithmetic must then state the formula AND its assumption. The owner lost '
 'time today to three fields whose names implied something other than what they held.';

comment on column field_help.watch_out_for is
 'The trap. Not a caveat for politeness - the specific wrong conclusion a reasonable person '
 'draws from this field. Every entry here was earned by somebody drawing it.';

insert into field_help (page, section, field, plain_english, how_to_read, where_it_comes_from, the_arithmetic, watch_out_for, is_derived) values
('cultivation','Harvest moisture','Cut on',
 'The day the plants were cut down and the harvest was opened in Metrc.',
 'A date. Everything else on this row is measured from here.',
 'metrc_harvests.harvest_start - Metrc''s own record.',
 null,
 'This is NOT when the material was dried, packaged or finished. A harvest can sit open for months after this date.', false),
('cultivation','Harvest moisture','Days open',
 'How many days this harvest has been open in Metrc, from the cut date to today.',
 'Anything past 14 is outside the dry window the owner set. Past 30 means the harvest record has been left open, not that the material is still drying.',
 'Calculated: today minus the cut date.',
 'today - cut_on',
 'A high number does not mean the material dried for that long. It means nobody closed the harvest. Two April harvests currently read 127 days and the material was dry by May - the water on the books is the problem, not the drying.', true),
('cultivation','Harvest moisture','Wet weight',
 'What the plants weighed the day they were cut, water included.',
 'Fresh cannabis is roughly 75-80% water, so expect the dry result to be about a quarter of this.',
 'metrc_harvests.wet_weight - entered by the person who cut.',
 null,
 'This number is never wrong, but it is never what you have either. Comparing it to anything dry without converting is the most common mistake made with harvest figures.', false),
('cultivation','Harvest moisture','Dry it should yield',
 'An ESTIMATE of how much dried flower this harvest should produce - not a measurement.',
 'Treat it as a forecast with a wide range, not a fact.',
 'Calculated from wet weight using a standard conversion, not from anything weighed.',
 'wet weight x ~26.5% (a 3.8:1 wet-to-dry ratio)',
 'Real ratios vary from about 20% to 30%. At 22% instead of 26.5% this figure drops by a sixth, and everything derived from it moves with it. Never quote it as actual yield.', true),
('cultivation','Harvest moisture','Packaged so far',
 'How much finished material has actually been packaged off this harvest. This one IS measured.',
 'Compare it against "dry it should yield" to see how much of the expected crop has materialised.',
 'Sum of packages whose source is this harvest, from Metrc.',
 null,
 'A blended package lists several harvests as its source, so material can be attributed here that came mostly from elsewhere. Owner ruling D4: a blend has no single strain, and no single harvest.', false),
('cultivation','Harvest moisture','Waste',
 'Stems, leaf and trim recorded as waste against this harvest.',
 'Small relative to wet weight is normal.',
 'metrc_harvests.waste_weight.',
 null,
 'This is wet waste and is generally already accounted for inside the dry conversion. Subtracting it again from the dry estimate double-counts it.', false),
('cultivation','Harvest moisture','Really left',
 'An ESTIMATE of how much dried material should still be sitting there unpackaged.',
 'A starting point for going and looking, not a stock figure.',
 'Calculated - it subtracts a measured number from a modelled one.',
 'dry it should yield (estimate) - packaged so far (measured)',
 'The bold label reads like a count and it is not one. Because the first term is an estimate, this figure inherits its entire error: on one April harvest it reads 26.7 lb, and at a 22% dry ratio the same row would read 12.3 lb. Never put this number in a report without the word "estimated" beside it.', true),
('cultivation','Harvest moisture','Metrc still shows',
 'The weight Metrc''s own books still carry against this harvest - the legal record.',
 'Where this is far above the estimated dry remaining, the difference is water that evaporated and was never recorded as loss.',
 'metrc_harvests raw CurrentWeight - the state''s number, not ours.',
 null,
 'Do not treat this as material you can sell - most of it is water. But do not dismiss it either: it is what a regulator sees. Two harvests currently carry 418.7 lb of phantom water between them, and only a person recording the loss in Metrc removes it.', false),
('cultivation','Harvest moisture','Last pack',
 'The most recent date a package was created that CITES this harvest in its lineage.',
 'Recent does not mean this harvest is still producing.',
 'Max packaged date across packages listing this harvest as a source.',
 null,
 'THE TRAP THE OWNER HIT: an April harvest showed a last pack of today. The package created today was a BLEND citing a dozen harvests going back to December, plus some 0.03 lb lab samples. This column measures attribution, not production. If you want "is this harvest still being worked", look at packaged so far moving, not at this date.', false),
('inventory','Stock by stream','Failed — third party',
 'Pounds of material that failed testing and came from another licensee, not from us.',
 'Read it alongside the supplier names beside it.',
 'v_stock_summary, split by ownership.',
 null,
 'Owner ruling C6a: third-party failed material is an INPUT, not a loss. It is bought at a discount deliberately, then remediated or sold on. Never present it as a quality failure.', false),
('inventory','Stock by stream','Untested',
 'Material we hold that has never been submitted for testing.',
 'This cannot legally be sold until it is submitted, so treat it as blocked stock rather than available stock.',
 'v_stock_summary where lab state is NotSubmitted.',
 null,
 'Untested is not the same as failed, and neither is the same as "out for testing". Three different states, three different actions.', false),
('command','Key figures','Total on hand, dry-equivalent',
 'Everything we hold across both licences, with wet weights converted so they can be added to dry ones.',
 'This is the single biggest inventory number on the platform.',
 'mv_department_dashboard, from v_stock_on_hand.',
 'wet weights converted at the standard ratio, then summed with dry',
 'A tag can exist under both licences at once - seven currently do. Counting per tag instead of per licence-row moved this figure by 75 lb in August 2026. Always ask which population a stock figure counted.', true)
on conflict (page, section, field) do nothing;

create or replace view public.v_field_help_lookup as
select page, section, field, plain_english, how_to_read, where_it_comes_from,
       the_arithmetic, watch_out_for, is_derived,
       (watch_out_for is not null) as has_a_named_trap
from field_help order by page, section, field;

comment on view public.v_field_help_lookup is
 'What the "?" icon reads, keyed page/section/field. The front end mounts ONE help primitive '
 'against this view, so help can never drift from the data it describes - a hardcoded tooltip '
 'goes stale the day the field changes and nobody notices.';;
