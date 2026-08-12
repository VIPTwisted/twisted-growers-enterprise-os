-- Agent I, 12 Aug 2026. DBI-061. Two owner rulings, both the same principle, both proven within
-- minutes of being given. Stored as rules in conversion_factors so every agent inherits them.

insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status)
values

('tag_missing_means_go_find_the_manifest','1','rule',
 'A tag that is not in our package mirror is NOT unexplained — find its manifest',

 'Every physical item in this industry carries a tag, and every tag arrived or departed on a '
 'manifest. So "absent from metrc_packages" never means "unknown" — it means we have not looked '
 'in the transfer records yet. Before ANY agent files a missing-tag finding it must: (1) check '
 'whether the tag is THIRD PARTY, because we do not mirror other facilities'' packages and never '
 'will; (2) look it up in metrc_rpt_package_transfers for its manifest; (3) only then report, and '
 'report what the manifest says, not that the tag is missing.',

 'Owner ruling 12 Aug 2026, verbatim: "ALWAYS CHECK TO SEE WHEN A TAG IS NOT FOUND IF IT IS THRID '
 'PARTY THERE IS A TAG FOR EVERY SINGLE ITEM DEPLOY AGENTS ON MISSING TO FIND MANEFEST FOR EACH OF '
 'THESE TAGS". PROVEN THE SAME HOUR: Agent V reported 484 adjustment tags absent from '
 'metrc_packages. Joined to metrc_rpt_package_transfers, ALL 484 have a manifest — 100 percent, '
 'zero unresolved. 371 tags (367.1 lb) left us outbound to customers between Aug 2024 and Aug '
 '2026; 113 tags (158.1 lb) came to us inbound. Not one was a mystery. The finding was true about '
 'the mirror and misleading about the facts.',
 'Owner (Vinny)', 'owner_set'),

('tested_means_a_coa_exists_go_find_it','1','rule',
 'If Metrc says TestPassed, a certificate EXISTS — find it, never report it absent',

 'A lab result cannot exist in Metrc without a certificate behind it. So "no COA" on a TestPassed '
 'package is a statement about OUR retrieval, never about the material. Search order is fixed: '
 '(1) Metrc — the lab result, its attached document, and the package''s own lineage; (2) the '
 'certificate already held for a PARENT or SIBLING tag, since a child inherits its parent''s test; '
 '(3) Apex, LAST RESORT ONLY. A surface may say "certificate not yet retrieved" and must name '
 'where it looked. It may NEVER say the material is untested when Metrc says it passed.',

 'Owner ruling 12 Aug 2026, verbatim: "DEPLOY AGENTS TO LOCATE AND PARSE FOR COA, IF TESTED THERE '
 'IS A COA IT WILL BE IN METRC!!! LAST RESORT LOOK AT APEX". Raised because 462 of 1,100 "none" '
 'entries in mv_tag_evidence contradict Metrc''s own tested state — 26 of them still held, 68.5 '
 'lb, every one TestPassed. Root cause measured by Agent V: the evidence view inherits '
 'CERTIFICATES through lineage but not LAB RESULTS, so 317 packages whose ancestor holds a result '
 'read as untested.',
 'Owner (Vinny)', 'owner_set')

on conflict (key) do update set
  value = excluded.value, label = excluded.label,
  what_it_means = excluded.what_it_means, where_it_came_from = excluded.where_it_came_from,
  set_by = excluded.set_by, evidence_status = excluded.evidence_status, updated_at = now();;
