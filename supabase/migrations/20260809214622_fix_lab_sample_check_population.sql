-- lab-samples-shipped-vs-held reported 1,402 vs 33 - 4,148% apart - and BOTH halves of that
-- were misleading. The check was comparing two different populations, which is the error
-- CEO_DASHBOARD_SUBSTITUTION_MAP.md was written about.
--
-- WHAT WAS WRONG. Source A summed PackageCount over every transfer where ContainsTestingSample
-- is true. That is EVERY PACKAGE ON A MANIFEST THAT HAPPENED TO CARRY A SAMPLE, not the samples.
-- Measured: 228 such manifests carry 1,402 packages between them, averaging 6.1 each and one
-- carrying 40. So a lab run shipping one sample alongside five commercial packages contributed
-- 6 to A and 1 to B. The 4,148% was mostly an artifact of the question.
--
-- WHAT WAS RIGHT, AND SURVIVES. 228 manifests each carried at least one testing sample, so the
-- mirror should hold AT LEAST 228 sample packages. It holds 33. Roughly 195 are missing, which
-- is exactly what the check's own note claimed: "the parents look untested-with-no-manifest
-- because the samples never imported."
--
-- So the intent was correct and the SQL was not. Comparing like with like: manifests that
-- carried a sample against sample packages we hold. B may legitimately EXCEED A (one manifest
-- can carry several samples); B falling below A means samples did not import.
update verification_checks
set source_a_label = 'Manifests that carried at least one testing sample',
    source_a_sql   = 'select count(*)::numeric from metrc_transfers where (raw->>''ContainsTestingSample'')::boolean',
    source_b_label = 'Testing-sample packages in the mirror',
    source_b_sql   = 'select count(*)::numeric from metrc_packages where (raw->>''IsTestingSample'')::boolean',
    tolerance_pct  = 0,
    severity       = 'elevated',
    title          = 'Every shipped lab sample exists in our mirror',
    what_it_proves = 'A test needs a sample, and a sample ships on a manifest. Each manifest '
      'marked ContainsTestingSample carried at least one, so the mirror should hold AT LEAST as '
      'many sample packages as there are such manifests - more is fine, since one manifest can '
      'carry several. FEWER means samples were never imported, and their parent packages then '
      'read as untested-with-no-manifest when they were in fact tested. '
      'Measured 9 Aug 2026: 228 manifests, 33 samples held - about 195 missing. '
      'NOTE, corrected 9 Aug: this previously summed PackageCount across those manifests, which '
      'counted every package riding alongside a sample (1,402 across 228 manifests, 6.1 each) '
      'and produced a false 4,148% gap. Two populations, one comparison.'
where check_key = 'lab-samples-shipped-vs-held';;
