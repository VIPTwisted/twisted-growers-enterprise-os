/* The lab sample size changed with the lab, and 208 samples weigh nothing.
 *
 * Owner, 18 Aug 2026: "7grams for flower test is sent to labs."
 *
 * TRUE, HISTORICALLY. Measured across 774 flower samples by quarter:
 *   Q3 2024 - Q1 2025   132 at 7g,   0 at 12g   SafeTiva, ProVerde, MCR, Assured
 *   Q2 2025              28 at 7g,  22 at 12g   both, as Green Valley Analytics arrives
 *   Q3 2025 - Q3 2026     0 at 7g, 348 at 12g   Green Valley only
 *
 * The changeover is clean and lines up exactly with the change of laboratory. 7g was the
 * standard and 12g is the standard now. Neither is a defect, and a check written against
 * a single figure would have called half the history wrong.
 *
 * THE REAL DEFECT IS THE ZEROS. 208 of 1,398 samples across all five labs and every
 * quarter from May 2024 to July 2026 are recorded at 0.00 g. 153 of them HAVE A LAB
 * RESULT — the laboratory received, tested and reported on material our own record says
 * weighed nothing. Flower alone accounts for 122.
 *
 * A zero-weight sample cannot be reconciled: it cannot be deducted from the package it
 * came out of, it cannot be checked against the standard, and it makes any yield or
 * shrinkage figure that spans it wrong by the amount actually sent.
 */

insert into public.conversion_factors
  (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
values
  ('lab_sample_flower_g', 12, 'grams', 'Flower lab sample, current',
   'The weight of flower sent for a compliance test today. Deduct this from the source '
   || 'package when a sample goes out.',
   'Measured 18 Aug 2026 from 774 flower samples: 348 of 348 sized samples since Q3 2025 '
   || 'are 12g, all to Green Valley Analytics.',
   'Owner ruling plus measurement, 18 Aug 2026', 'measured',
   'The owner stated 7g. That was correct until Q2 2025 — see lab_sample_flower_g_historic. '
   || 'The size changed with the laboratory, not by decision, and both figures are right for '
   || 'their period.'),
  ('lab_sample_flower_g_historic', 7, 'grams', 'Flower lab sample, to Q2 2025',
   'The weight of flower sent for a compliance test while SafeTiva, ProVerde, MCR and '
   || 'Assured were the laboratories. Use this for any figure covering a period before '
   || 'Q3 2025.',
   'Measured 18 Aug 2026: 160 flower samples at exactly 7g, all before Q3 2025, none after.',
   'Owner ruling plus measurement, 18 Aug 2026', 'measured',
   'Retained rather than overwritten. A historic yield or shrinkage figure recomputed with '
   || 'today''s 12g would silently restate the past.')
on conflict (key) do update
  set value = excluded.value, what_it_means = excluded.what_it_means,
      where_it_came_from = excluded.where_it_came_from, evidence_note = excluded.evidence_note;

insert into public.watchdog_findings (
  observed_at, fingerprint, severity, what, where_it_is, who_is_accountable,
  when_it_started, why_it_matters, how_it_was_detected, what_to_do,
  the_arithmetic, evidence, record_count, solutions, guard_recommendation)
values (
  now(), 'lab_samples_recorded_at_zero_weight', 'elevated',
  '208 of 1,398 laboratory samples are recorded at 0.00 g, and 153 of them came back with '
    || 'a lab result — the laboratory tested material our own record says weighed nothing.',
  'metrc_rpt_package_transfers, outbound lines to IL licences. Surfaced by v_lab_samples_out.',
  'Agent I, Database COO. Cultivation and QA send the samples.',
  'First on 8 May 2024, most recent 23 Jul 2026. Present in every quarter and at all five '
    || 'laboratories, so it is a standing habit rather than an incident.',
  'A zero-weight sample cannot be deducted from the package it came out of, cannot be '
    || 'checked against the 12g standard, and makes any yield or shrinkage figure spanning '
    || 'it wrong by the amount actually sent. 122 of the 208 are flower.',
  'v_lab_samples_out, built 18 Aug 2026, compared recorded sample weight against the '
    || 'owner-stated standard. The zeros surfaced immediately.',
  'Find whether the weight is absent in Metrc itself or lost on the way in. If Metrc holds '
    || 'it, this is an import defect and is ours. If Metrc is blank, the sample was recorded '
    || 'without a weight at the point it was created and that is a process fix.',
  '208 of 1,398 samples at zero, 14.9%. 153 of those hold a lab result. Current standard is '
    || '12g, so roughly 2.5 kg of material is unaccounted if all were full samples.',
  jsonb_build_object('zero_weight', 208, 'total_samples', 1398,
                     'with_a_result_anyway', 153, 'flower_zeros', 122,
                     'first', '2024-05-08', 'last', '2026-07-23', 'labs_affected', 5),
  208,
  array[
    'Check Metrc''s own record for a handful of these tags — if the weight is there, the '
      || 'import dropped it and the fix is ours.',
    'If Metrc is genuinely blank, add a weight check at the point a sample package is '
      || 'created, so a zero cannot be saved.',
    'Deduct the standard sample size where the true weight cannot be recovered, and mark '
      || 'those rows as estimated so no one later reads them as measured.'],
  'Do not backfill 12g across all 208 silently. 132 of the historic samples were 7g and the '
    || 'standard changed with the laboratory in Q2 2025 — a single figure applied to the '
    || 'whole history would restate the past. Any estimate must use the factor for its own '
    || 'period and be labelled an estimate.')
on conflict do nothing;;
