-- Agent I, 12 Aug 2026. DBI-084.
-- OWNER RULING, verbatim: "always go with what the manefest says".
--
-- V2 NOTE, and it is worth keeping: v1 also flipped the matching correction_proposal rows to
-- 'approved' and tg_proposal_gate() refused - "Only the owner decides a correction proposal.
-- Agent decisions are not decisions." The gate is RIGHT and I am not routing around it. His
-- ruling is a general principle; whether it closes one specific filed proposal is his click.
-- The ruling is recorded here and the proposals get a note, not a decision.

insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status)
values
('the_manifest_wins','1','rule',
 'When a spreadsheet and a manifest disagree about what a package IS, the manifest wins',

 'A manifest is a state transport record. It was created before the product moved, it names the '
 'item that physically left the building, and a licensed receiver signed for it. A spreadsheet is '
 'a working document maintained by hand between other jobs. When the two disagree about what a '
 'tag contains, the manifest is the fact and the sheet is the error. '
 'WHAT THIS SETTLES IMMEDIATELY: 12 finished-goods rows name one product in the sheet and another '
 'on the manifest, 179 cases in total, 8 of them already shipped and ACCEPTED by retailers. The '
 'manifest name stands; the sheet row is wrong. Example: the sheet reads Comfortably Numb; '
 'manifest 0002838011 reads Lemon Drop Infused PreRoll, delivered to SafeTiva Labs. '
 'HOW TO APPLY: where a manifest exists for a tag, its item name is authoritative over any '
 'sheet. NEVER edit the sheet to match - our access is VIEW AND SYNC ONLY; file it and a person '
 'corrects it at source. Record the disagreement rather than silently overwriting either side, so '
 'the correction stays auditable. '
 'WHAT THIS DOES NOT SETTLE, and do not stretch it: a disagreement between two METRC records is '
 'outside this rule. Tag 1A40A0300010D89000002450 reads 1,489 g under MC281714 and 3,142 g under '
 'MP281909 with no manifest between them - only Metrc can resolve that, and this platform must '
 'not invent a third number. Nor does it override IDENTITY IS THE TAG: the manifest settles what '
 'a package is CALLED; the tag settles which package it IS.',

 'Owner ruling 12 Aug 2026: "always go with what the manefest says", given on being told that 12 '
 'finished-goods products are tagged as one thing in the Manufacturing Product Inventory sheet '
 'and another in Metrc, 8 already shipped and Accepted. Consistent with his standing D4 ruling '
 'that identity is the tag and names resolve Metrc then COA then manifest, and with '
 'spreadsheets_are_view_only_forever.',
 'Owner (Vinny)', 'owner_set')
on conflict (key) do update set
  label = excluded.label, what_it_means = excluded.what_it_means,
  where_it_came_from = excluded.where_it_came_from, updated_at = now();

update correction_proposal
   set owner_note = coalesce(owner_note || E'\n\n', '') ||
       'OWNER RULING 12 Aug 2026, verbatim: "always go with what the manefest says". The manifest '
       'name is authoritative and the sheet rows are the error. Correction happens IN THE SHEET, '
       'by a person — our access is view and sync only. Recorded as rule the_manifest_wins in '
       'v_house_rules. AWAITING HIS DECISION on this specific proposal; the ruling is the '
       'principle, approving this row is his click.'
 where status = 'proposed'
   and (the_issue ilike '%different product in Metrc%'
     or the_issue ilike '%name a different product%'
     or the_issue ilike '%mis-tagged%');;
