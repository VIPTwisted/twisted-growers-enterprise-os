-- ---------------------------------------------------------------------------
-- 0067 — Owner rulings on material accounting, 11 Aug 2026. These are business
-- practice, not anything derivable from the data, and were stated directly by the
-- owner. Recorded so no agent re-derives or contradicts them.
-- ---------------------------------------------------------------------------
insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
values
('material_no_double_dip_concentrate','1','rule',
 'Never count concentrate weight AND its input material as separate inventory',
 'Fresh frozen and trim consumed into concentrate are the COST OF MATERIALS. The '
 'concentrate produced from them is that same material transformed. Counting both as '
 'inventory weight double-dips the cost of materials. Applies to CONCENTRATE MATERIAL '
 'ONLY - flower to pre-roll is roughly one to one and has no comparable conversion loss.',
 'Owner ruling 11 Aug 2026, verbatim: "YOU CAN NOT COUNT CONTCENTRATS LIKE VAPES ETC, '
 'IF WE ACCOUNT FOR FRESH FROZEN AND TRIM TO MAKE IT AGAINST THE WEIGHT YOU WOULD BE '
 'DOUBLE DIPPING IN ACTUALY COST OF MATERIALS" and "THIS ONLY HOLDS TRUE FOR '
 'CONCENTRATE MATERIAL."',
 'Owner (Vinny), 11 Aug 2026','owner_set',
 'Structural rule for any cost-of-materials or inventory-value report. A weight '
 'reconciliation may still show conversion loss as a residual; a COST report may not '
 'charge for the input and the output both.'),

('material_prerolls_from_dried_flower','1','rule',
 'All pre-rolls draw FINISHED DRIED FLOWER',
 'Pre-roll material is finished dried flower, not wet and not trim. Material required '
 'is units sold multiplied by the grams per pre-roll on the product record.',
 'Owner ruling 11 Aug 2026: "WE PULL FROM FINISHED DRIED WEIGHT FOR ALL PRE-ROLLS". '
 'Apex carries gram_per_preroll on 6,088 of 6,098 pre-roll lines at 0.5, 0.7 or 1.0 g. '
 'Cross-checks against Metrc, which independently reports 2,096.3 lb of Raw Pre-Rolls '
 'shipped against 2,491.0 lb computed from Apex.',
 'Owner (Vinny), 11 Aug 2026','owner_set',
 'The BOM & Yield tab of the Enterprise Operations Planner is an EMPTY TEMPLATE - the '
 'formula exists but every Qty per Finished Unit and Expected Yield reads 0.0, so it '
 'cannot compute anything. The per-unit sizes come from Apex product records instead.'),

('material_premium_vs_economy_sourcing','1','rule',
 'Premium draws our own buds; Economy may draw third-party flower and trim',
 'PREMIUM concentrates and PREMIUM infused pre-rolls are made from our own buds - pure '
 'flower. ECONOMY concentrates and ECONOMY infused pre-rolls may be third-party cheap '
 'flower and trim mix. Material sourcing therefore differs by tier and the two must '
 'never be costed or attributed the same way.',
 'Owner ruling 11 Aug 2026: "CONCENTRATES WE HAVE ECONOMY AND PREMIUM PREMIUM IS ALL '
 'OUR BUDS MEANING PURE FLOWER OUR OWN AND ECONOMY COULD BE 3RD CHEAP FLOWER AND TRIM '
 'MIX." and "SAME HOLDS TRUE FOR INFUSED PRE-ROLLS".',
 'Owner (Vinny), 11 Aug 2026','owner_set',
 'OPEN: the tier is NOT written in the Apex product name. A search of all 6,036 '
 'pre-roll, 1,127 cartridge and 2,129 extract lines found neither "premium" nor '
 '"economy". The names carry Diamond / Liquid Diamond / Micro Diamond / Raw and case '
 'sizes of 20, 48 and 100. THE MAPPING FROM PRODUCT NAME TO TIER MUST BE SUPPLIED BY '
 'THE OWNER - do not infer it from naming patterns or case size.'),

('bulk_flower_sold_both_origins','1','rule',
 'We sell bulk flower both our own and third-party',
 'Bulk flower sales include material we grew and material we purchased. Every bulk '
 'flower figure must be split by origin; a single bulk flower total is not meaningful.',
 'Owner ruling 11 Aug 2026: "WE SELL BULK FLOWER OURS AND 3RD PARTY".',
 'Owner (Vinny), 11 Aug 2026','owner_set',
 'v_forensic_inventory and v_forensic_sold_by_tag both carry is_ours and '
 'grown_or_processed_by for exactly this split.')
on conflict (key) do update set
  value=excluded.value, label=excluded.label, what_it_means=excluded.what_it_means,
  where_it_came_from=excluded.where_it_came_from, set_by=excluded.set_by,
  evidence_status=excluded.evidence_status, evidence_note=excluded.evidence_note,
  updated_at=now();
;
