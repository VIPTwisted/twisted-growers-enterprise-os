/* A historical figure comes from the source that stated it, never from an estimate.
 *
 * Owner ruling, 18 Aug 2026: "track as historical data is recorded from metrc as record of
 * fact; and or Apex ... or the manefest."
 *
 * The order of authority for anything that already happened:
 *   1. METRC        the record of fact. What the state was told is what happened.
 *   2. APEX         the sales and money record, per the ruling of 17 Aug that Apex owns
 *                   sales, invoices and COAs while Metrc owns cultivation and tags.
 *   3. THE MANIFEST the document itself, when neither system carries the field.
 *
 * WHAT THIS RULES OUT. I had proposed, as one option for the 208 lab samples recorded at
 * 0.00 g, deducting the standard sample size where the true weight could not be recovered.
 * That is now explicitly not allowed. A figure computed from a standard is an ESTIMATE,
 * and writing it into a historical row makes an invention indistinguishable from a
 * measurement the moment the next person reads it. The 12g standard is for deciding what
 * to send tomorrow, not for restating what was sent in 2024.
 *
 * SO THE FIX FOR THE ZEROS IS TO GO AND LOOK. Metrc first — the weight may be in the API
 * record even though the report export shows zero. Then the manifest document, which we
 * hold for many of these. Only if all three are silent does the row stay at zero, and it
 * stays labelled unknown rather than being filled in.
 *
 * A zero that is TRUE is a fact. A 12 that is INVENTED is a lie with better presentation.
 */

insert into public.conversion_factors
  (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
values
  ('historical_source_of_truth', 1, 'ruling', 'Where a historical figure must come from',
   'Anything that already happened is read from the source that recorded it, in order: '
   || 'Metrc as the record of fact, then Apex for sales and money, then the manifest '
   || 'document. A standard or a factor may inform what to do NEXT; it may never be used '
   || 'to fill in what was.',
   'Owner ruling, 18 Aug 2026, given while deciding how to treat 208 laboratory samples '
   || 'recorded at zero weight.',
   'Owner', 'ruling',
   'Explicitly overrides the estimate-from-standard option that had been offered for those '
   || '208 rows. An estimated weight written into a historical row cannot afterwards be '
   || 'told apart from a measured one.')
on conflict (key) do update
  set what_it_means = excluded.what_it_means, where_it_came_from = excluded.where_it_came_from,
      evidence_note = excluded.evidence_note;

update public.watchdog_findings
   set what_to_do =
         'Go to the source, in the owner''s order of authority. FIRST Metrc — the weight may '
         || 'be present in the API package record even though the report export shows zero, '
         || 'which would make this an import defect and ours to fix. THEN the manifest '
         || 'document, which we hold for many of these tags. Only if Metrc, Apex and the '
         || 'manifest are all silent does the row stay at zero, and it stays labelled '
         || 'unknown.',
       solutions = array[
         'Check Metrc''s own API record for these tags — if the weight is there, the import '
           || 'dropped it and the fix is ours.',
         'Read the manifest document where we hold one; it states the weight that physically '
           || 'left.',
         'Add a weight check when a sample package is created, so a new zero cannot be saved.',
         'Where all three sources are silent, leave the zero and mark it UNKNOWN. A gap that '
           || 'says it is a gap is worth more than a number nobody can defend.'],
       guard_recommendation =
         'DO NOT deduct the 12g standard to fill these in. Owner ruling 18 Aug 2026: a '
         || 'historical figure comes from Metrc, Apex or the manifest, never from a factor. '
         || 'An estimate written into a historical row is indistinguishable from a '
         || 'measurement to the next person who reads it, and the standard changed from 7g '
         || 'to 12g in Q2 2025 anyway, so a single figure would restate the past twice over.'
 where fingerprint = 'lab_samples_recorded_at_zero_weight';

comment on view public.v_lab_samples_out is
  'Every package sent to an independent testing laboratory, tracked SEPARATELY from sales '
  'on the owner''s instruction of 18 Aug 2026. 1,398 tags across 225 manifests to 5 labs, '
  '18.75 lb, $0.00 declared on every line. Weights are AS METRC RECORDED THEM and are '
  'never estimated from the sample standard — owner ruling: a historical figure comes from '
  'Metrc, then Apex, then the manifest, and a factor may inform what to do next but never '
  'what was. 208 rows read 0.00 g and 153 of those hold a lab result; they are left at zero '
  'rather than filled in. has_a_lab_result answers the question this view exists for: did a '
  'result ever come back for the sample we sent. Agent I.';;
