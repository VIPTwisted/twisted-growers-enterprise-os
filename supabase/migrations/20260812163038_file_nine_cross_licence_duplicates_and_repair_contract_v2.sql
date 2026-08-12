-- Agent I, 12 Aug 2026. DBI-056.
-- (a) Repair my OWN instrument: the contract named a column "lb" that v_stock_packages does not
--     have (it is "pounds"). The watcher reported BROKEN, which is correct behaviour - a checker
--     that cannot run must say so loudly, never pass quietly.
-- (b) File the defect the watcher found on its FIRST RUN, for owner decision. NOT applied: the
--     owner's standing rule is that agents flag and never change.

update tile_drill_contract
   set tile_sql = 'select round(sum(pounds),1) from v_stock_packages', registered_at = now()
 where contract_key = 'cc.stock.packages_lb';

insert into correction_proposal
 (raised_by, domain, target_object, severity, the_issue, the_evidence, what_needs_fixing,
  the_proposal, why_this_is_the_fix, how_it_never_repeats,
  rows_affected, pounds_affected, dollars_affected, risk_if_wrong, reversible, status)
values
('Agent I', 'Inventory', 'v_stock_packages', 'elevated',

 'Nine package tags each appear TWICE in the stock detail — once under cultivation licence '
 'MC281714 and once under manufacturing licence MP281909. They are one physical package sitting '
 'in one physical vault, counted as two.',

 'Found 12 Aug 2026 by the new tile-versus-drill watcher on its FIRST RUN, not by a human. The '
 'tile "Tags on hand" read 1,047; summing the drill rows gave 1,038 distinct tags. Gap of nine. '
 'Eight of them sit in Finish Vault carrying 0.37 lb across their two rows; the ninth '
 '(1A40A0300010D89000002450) sits in Fulfillment Vault carrying 10.21 lb across its two rows. '
 'Total weight resting on duplicate rows: 13.17 lb over 18 rows, so the weight overstatement is '
 '6.59 lb. The TAG COUNT overstatement is exactly 9 and is not in doubt.',

 'The stock detail must count a physical package once. Today it counts once per licence row, so '
 'any tag Metrc shows against two licences is doubled in both the tag census and the weight.',

 'Collapse to one row per package_tag, keeping the licence Metrc shows as the CURRENT holder, '
 'and add a column naming the other licence so the cross-licence fact stays visible rather than '
 'being deleted. Do not sum the two rows and do not pick arbitrarily.',

 'This is the same defect class as the 72 lb cross-licence finding already settled under WO-002: '
 'one tag, two licence rows. That fix was applied at v_stock_on_hand and never propagated to '
 'v_stock_packages, which is exactly why it came back in a different room.',

 'Register a permanent contract asserting count(*) = count(distinct package_tag) on '
 'v_stock_packages so a tenth duplicate fires a finding within the hour. Put the cross-licence '
 'rule in the import field map so every future stock view inherits it instead of rediscovering '
 'it. Log the root cause in root_cause_ledger under cross-licence tags, which already holds two '
 'entries — this is the third, and three occurrences of one cause means the cause was never '
 'actually closed, only its symptoms were.',

 18, 6.59, null,

 'Low. Collapsing is reversible and the underlying Metrc rows are never touched. The risk of NOT '
 'fixing is higher: every tag count and every weight quoted from stock detail runs 9 tags and '
 '6.59 lb high, including anything a regulator or a buyer reads.',

 true, 'proposed');;
