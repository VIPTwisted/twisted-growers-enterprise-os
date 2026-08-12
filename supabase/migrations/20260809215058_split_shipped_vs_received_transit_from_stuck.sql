-- packages-shipped-vs-received reported 201 packages short and that number MIXED TWO
-- DIFFERENT THINGS, so it was permanently red and told nobody what to do:
--
--   14 manifests, 154 packages, created 5-7 Aug 2026  -> plausibly still in transit. NORMAL.
--   11 manifests,  47 packages, oldest 5 May 2025     -> shipped and never confirmed received.
--                                                        Some over a year old. THIS IS THE FINDING.
--
-- A check whose number never reaches zero because it includes normal traffic is a check people
-- stop reading. Now it only counts manifests past the transit window, so zero is achievable and
-- any non-zero figure is genuinely actionable.
insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
values ('transit_window_days', 7, 'days',
  'Transit window before a shipment counts as unreceived',
  'How long a manifest may sit shipped-but-not-confirmed before it is treated as stuck rather than in transit.',
  'Measured 9 Aug 2026: short manifests fall into two clean clusters with nothing between them - 14 created in the last 3 days, and 11 older than 30 days with the oldest at 5 May 2025. Seven days sits inside that gap.',
  'Agent - measured, owner may change', 'measured',
  'Re-measure before changing. If in-state deliveries never take more than a day or two, this could tighten to 2 and surface problems sooner.')
on conflict (key) do update set
  value = excluded.value, what_it_means = excluded.what_it_means,
  where_it_came_from = excluded.where_it_came_from, evidence_note = excluded.evidence_note,
  updated_at = now();

update verification_checks
set title = 'Every shipment past the transit window was confirmed received',
    what_it_proves = 'Metrc records what was shipped and what the recipient confirmed. A permanent '
      'gap between them means product left the building and nobody acknowledged it arriving - the '
      'state record then shows custody we cannot prove ended. '
      'CORRECTED 9 Aug 2026: this previously counted EVERY unreceived package including normal '
      'in-transit traffic, so it could never reach zero and read as noise. It now excludes '
      'anything inside f_rule(transit_window_days). Measured on the day of the fix: 47 packages '
      'across 11 manifests were past the window, the oldest shipped 5 May 2025, while a further '
      '154 packages on 14 manifests were legitimately in transit and are correctly excluded.',
    source_a_label = 'Packages shipped, past the transit window',
    source_a_sql = 'select coalesce(sum((raw->>''PackageCount'')::int),0)::numeric from metrc_transfers where (raw->>''IsVoided'')::boolean is not true and (raw->>''CreatedDateTime'')::date < current_date - coalesce(f_rule(''transit_window_days''),7)::int',
    source_b_label = 'Of those, confirmed received',
    source_b_sql = 'select coalesce(sum((raw->>''ReceivedPackageCount'')::int),0)::numeric from metrc_transfers where (raw->>''IsVoided'')::boolean is not true and (raw->>''CreatedDateTime'')::date < current_date - coalesce(f_rule(''transit_window_days''),7)::int',
    tolerance_pct = 0,
    severity = 'critical'
where check_key = 'packages-shipped-vs-received';;
