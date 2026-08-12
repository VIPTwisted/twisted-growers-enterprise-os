create table if not exists page_help (
  view_key text primary key,
  headline text not null,
  what_this_shows text,
  how_to_read text,
  watch_for text,
  metrc_terms jsonb,
  updated_at timestamptz default now()
);
alter table page_help enable row level security;
create policy ph_read on page_help for select to authenticated using (true);
create policy ph_write on page_help for all to authenticated
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive')))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive')));

insert into page_help (view_key, headline, what_this_shows, how_to_read, watch_for, metrc_terms) values
('loss_ledger', 'Loss and destruction is not all the same thing',
 'Every quantity Metrc recorded as leaving your inventory without being sold: harvest waste, package quantity reductions, and failed laboratory tests.',
 'Most rows here are NORMAL. "Harvest waste" with reason "WholePlant" is the stems, fan leaves and stalk removed during a normal harvest - it is not product you lost. What matters is the percentage: waste above roughly 10 to 15 percent of wet weight is worth investigating; single digits is routine.',
 'Rows marked FAILED TESTING or a package quantity that dropped with no reason recorded - those are real exposure, not routine trim.',
 '{"WholePlant": "The whole-plant material removed at harvest - stems, stalk and fan leaves. Routine, not a loss of sellable product.", "Harvest waste": "Material recorded as waste against a harvest batch. Normal at harvest time.", "Package adjustment": "The quantity in a package was reduced. If no reason was recorded, investigate it.", "TestFailed": "The laboratory failed this package. It cannot be sold and must be remediated or destroyed."}'::jsonb),
('inventory_locator', 'Where every item physically sits right now',
 'Every plant, plant batch, harvest lot, package and outbound manifest as an individual item with its location, stage, quantity and how long it has been there.',
 'Use the weight selector to switch between grams, ounces and pounds - Metrc reports everything in grams, which is hard to judge. Group by location to walk the building, or by stage to see the flow.',
 'Anything with a high day count in the Days here column, and anything red in the Action column.',
 '{"Package": "A tagged, sealed quantity of product. The tag is the state identifier.", "Harvest lot": "Material from one takedown, still drying, curing or being packaged.", "In transit": "On a manifest and legally out of your custody until the recipient confirms."}'::jsonb),
('metrc_rpt_lab_status', 'What the laboratory states actually mean',
 'Your packages grouped by their laboratory testing state.',
 'NotSubmitted simply means testing has not started - for bulk and work-in-progress material that is completely normal. SubmittedForTesting and TestingInProgress mean the laboratory has it. TestPassed is sellable.',
 'TestFailed sitting in active inventory. That is product you cannot sell and must resolve.',
 '{"NotSubmitted": "Testing has not been requested. Normal for bulk, biomass and work-in-progress.", "SubmittedForTesting": "Sample sent, awaiting result.", "TestingInProgress": "The laboratory is running it now.", "TestPassed": "Passed - sellable.", "TestFailed": "Failed - not sellable. Remediate or destroy.", "RetestPassed": "Failed once, retested, and passed."}'::jsonb),
('metrc_rpt_transfer_ledger', 'Manifests are the legal record of every movement',
 'Every transfer manifest with its number, direction, counterparty, packages, transporter, driver, vehicle and a link that opens the manifest document in Metrc.',
 'Outgoing manifests are your sales record for wholesale. A manifest is not complete until the receiving facility confirms it - until then the product is legally in transit.',
 'Manifests older than a few days with no received date. Those are unconfirmed shipments.',
 '{"Manifest": "The state transport document listing every package on a shipment.", "Incoming": "Product coming to you.", "Outgoing": "Product leaving you - your wholesale sale.", "Received date empty": "The recipient has not confirmed. Chase it."}'::jsonb),
('harvest_lifecycle', 'The deadline clock on every harvest',
 'Every harvest milestone by milestone against the plan: planned versus actual takedown, days in drying against the 10 and 14 day rules, whether weights were reported, waste and yield against projection, and where the material went.',
 'Read the Verdict column first. BLOCKING THE ROOM means drying has run past 14 days and the next planting cannot start. MISSING WEIGHTS means nobody recorded the weight after takedown.',
 'Anything not saying On track or Complete. Each one is a delay to the next cycle.',
 '{"Dry target": "Day 10 - drying should be finishing.", "Dry deadline": "Day 14 - the outer limit from the harvest calendar.", "Yield percentage": "Packaged weight as a share of wet weight.", "Waste percentage": "Waste as a share of wet weight."}'::jsonb),
('custody_alerts', 'Chain of custody red flags',
 'Live compliance exposure: lineage breaks, holds, failed testing left in inventory, unexplained quantity loss, transfers never confirmed, investigations, unlocated items, and stale data.',
 'These are computed from Metrc directly, every twenty minutes, and logged permanently so a regulator can see when each was raised and when it cleared.',
 'Anything marked critical. Those are the items that would fail an inspection today.',
 '{"Lineage break": "A package with no recorded source harvest - the seed to sale chain cannot be proven.", "On hold": "Metrc has frozen this item.", "Under investigation": "Flagged by the state. Do not move or sell."}'::jsonb)
on conflict (view_key) do update set headline = excluded.headline, what_this_shows = excluded.what_this_shows,
  how_to_read = excluded.how_to_read, watch_for = excluded.watch_for, metrc_terms = excluded.metrc_terms;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Reports', (select category_order from nav_registry where category='Reports' limit 1),
  'Metrc Glossary & Page Help', 9, 'help', 'page_help', 'page_help',
  'Plain English explanations of every confusing Metrc term and how to read each page - what it shows, how to read it, and what to watch for.',
  true, false, false
where not exists (select 1 from nav_registry where view_key = 'page_help');
select view_key, headline from page_help;;
