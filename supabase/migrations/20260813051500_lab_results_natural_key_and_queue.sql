-- =============================================================================
-- LAB RESULTS: THE NATURAL KEY, THE QUEUE THAT NOTICES A CHANGED TESTING STATE,
-- AND THE RECONCILIATION THAT MAKES A SILENT LOSS IMPOSSIBLE.
--
-- Agent I (Database COO) with TG-01 (Metrc & Compliance), 13 August 2026.
-- Owner approved directly: "pROCEED FIX; IN FUTURE FIX SO THIS DOES NOT HAPPEN".
--
-- -----------------------------------------------------------------------------
-- WHAT HAPPENED, MEASURED AGAIN TONIGHT BEFORE WRITING A LINE OF THIS
-- -----------------------------------------------------------------------------
-- metrc_lab_backfill.results        119,167   (what Metrc returned, per package)
-- metrc_lab_results row count       101,608
-- LOST                               17,559   = 14.7 per cent
-- packages that lost every row          137
-- packages that lost some rows            3
-- packages affected in total            140
--
-- THE MECHANISM, and it is not the one the shape of the number suggests.
-- The DEPLOYED metrc-lab-backfill - version 1, the artifact actually running, NOT the file in
-- this repository, which has already been rewritten to call tg_metrc_lab_store and is waiting
-- to be deployed - does a PLAIN INSERT in slices of 200 at lines 94-97:
--
--     for (let i = 0; i < mapped.length; i += 200) {
--       const { error } = await supa.from("metrc_lab_results").insert(mapped.slice(i, i + 200));
--       if (error && errs.length < 3) errs.push(error.message.slice(0, 130));
--     }
--     results += rows.length;
--
-- One INSERT is one statement. One unique violation anywhere in the slice throws
-- the WHOLE SLICE away. The error is pushed into an array that is returned in the
-- HTTP body and stored nowhere, and only the first three are even kept. The line
-- below it then adds rows.length - what the API RETURNED - to the counter that is
-- written to metrc_lab_backfill.results. So the ledger records the fetch and the
-- table records the landing and NOTHING HAS EVER COMPARED THEM.
--
-- The signature is visible in the three packages that lost only part:
--   1A40A030000E5B1000005049  401 returned, 1 held   (200 + 200 + 1: the last slice lived)
--   1A40A030000E5B1000005051  401 returned, 1 held
--   1A40A0300011815000000775  224 returned, 130 held (this one was loaded at 16:00 by a
--                                                     different, UPSERTING run - see below)
--
-- WHY THE KEY IS WRONG. The ad-hoc index (license, package_tag, test_name) was created
-- outside any migration to stop an ON CONFLICT error. It asserts that a package is tested
-- for any given analyte EXACTLY ONCE, and that is false on this platform:
--
--   1A40A0300011815000000775 has FIVE lab tests -
--     2664677  2026-06-12  34 analytes  Analytics Labs   FAILED
--     2672385  2026-06-23   4 analytes  Analytics Labs   retest, passed
--     2672486  2026-06-23   3 analytes  Analytics Labs   passed
--     2681141  2026-07-02  81 analytes  SafeTiva Labs    passed
--     2700128  2026-07-24   8 analytes  Analytics Labs   passed
--
-- 224 rows of truth collapsed to 130 - one row per analyte NAME, keeping whichever test
-- happened to be inserted first. The remediation history of a failed batch, which is the
-- single most important thing a compliance mirror can hold, was flattened at the key.
--
-- 340 of our 2,642 landed packages already carry more than one LabTestResultId. This is
-- normal operation, not an edge case.
--
-- THE KEY THAT IS RIGHT: (license, package_tag, lab_test_result_id, test_name).
-- LabTestResultId is Metrc's identifier for the TEST EVENT - 1,511 distinct values across
-- 101,608 rows, ~45 analytes each. test_name is the ANALYTE within it. Together they are
-- one measurement.
--
-- -----------------------------------------------------------------------------
-- DUPLICATE MEASUREMENT, RE-RUN TONIGHT AGAINST THE LIVE TABLE (rule 11)
-- -----------------------------------------------------------------------------
-- READ THE ZEROES AND THE NON-ZEROES DIFFERENTLY. Three of these five numbers prove nothing
-- about the candidate, and one of the three is the candidate's own.
--
--   ENTAILED, NOT MEASURED - each is zero by construction on this population:
--     (license, package_tag, test_name)              -- the enforced ad-hoc index   0 groups
--     (license, package_tag, test_type, result_date) -- the enforced constraint     0 groups
--     (license, package_tag, lab_test_result_id, test_name)  -- THE CANDIDATE       0 groups
--
--   The first two are the filters that produced this population: the rows they rejected are
--   not in the table to be counted. The CANDIDATE'S zero is in the same family and I first
--   presented it as though it were evidence - X caught that. The candidate is the enforced
--   ad-hoc key PLUS a column, and adding a column to a unique key can only ever weaken it,
--   so given the ad-hoc key holds at zero the candidate MUST also read zero. It is arithmetic,
--   not a finding. A check that cannot fail proves nothing, including when it is mine.
--
--   ACTUALLY MEASURED, and these carry real information:
--     (license, package_tag, lab_test_result_id)                    2,986 duplicate groups
--       - many analytes per test. This is what proves the ANALYTE must be in the key.
--     lab_test_result_id alone                                      1,495 duplicate groups
--       - one lab test covers several packages. Proves the PACKAGE must be in the key.
--
-- WHAT ACTUALLY CARRIES THE CLAIM is the worked case, not any of the zeroes: package
-- 1A40A0300011815000000775, whose 224-row API response is recorded in the queue and whose
-- FIVE distinct LabTestResultIds are still visible in the 130 rows that survived. Under the
-- ad-hoc key that package can hold at most 130 rows - one per analyte name - and the 12 June
-- failure is interleaved with three later retests at whichever value landed first. Under the
-- candidate key it holds all 224 and every test event stays separate. That is a demonstrated
-- collapse of real records, and it is the whole argument.
--
-- The API population itself cannot be re-measured without re-fetching, which is what
-- tg_metrc_lab_enqueue/drain below exist to do, and what the loss figure will be proved
-- against afterwards. And if the API ever DOES return the same (test event, analyte) twice,
-- tg_metrc_lab_store dedupes it and reports the count in results_deduped rather than aborting
-- the batch - a genuine key violation is recorded, never silently dropped and never fatal.
--
-- All 101,608 rows cast cleanly: raw->>'LabTestResultId' is numeric on every one, null on
-- none, between 1,370,412 and 2,712,905. The generated column cannot fail on existing data.
--
-- -----------------------------------------------------------------------------
-- THIS IS NOT WEAKENING A KEY. Read this before approving the two drops.
-- -----------------------------------------------------------------------------
-- Both indexes being removed are SUPERSETS of the new one in what they forbid - they reject
-- rows Metrc genuinely has. The new index is stricter in the only sense that matters: it
-- rejects exactly one thing, the same Metrc measurement recorded twice, and it accepts every
-- distinct measurement Metrc will hand us. NULLS NOT DISTINCT is set so that a row arriving
-- with no LabTestResultId cannot slip past uniqueness by being null - the classic hole.
--
-- The original table constraint (license, package_tag, test_type, result_date) has to go
-- with it. test_type is populated from the same TestTypeName as test_name and result_date is
-- a DATE, so the moment the ad-hoc index is removed that constraint becomes the binding one
-- and re-creates the same defect for any two tests on one package RELEASED ON THE SAME DAY.
-- That is not hypothetical: 2672385 and 2672486 above were both released 2026-06-23. They
-- happen not to share an analyte name; the next pair will.
--
-- -----------------------------------------------------------------------------
-- WHAT THIS FILE DOES NOT FIX, STATED PLAINLY (rule 8)
-- -----------------------------------------------------------------------------
-- The loader still does a plain INSERT. With the correct key in place a package that has
-- NEVER been fetched lands perfectly - that is 779 of the packages queued below. A package
-- that already holds rows will still throw its slice away on re-fetch, because the rows it
-- is re-inserting already exist. So the 140 packages holding the 17,559 lost rows are
-- DELIBERATELY EXCLUDED from the first sweep: tg_metrc_lab_enqueue() takes a parameter and
-- defaults it to false. They come back only after metrc-lab-backfill is redeployed to call
-- tg_metrc_lab_store(), which upserts. Until then v_metrc_lab_retrieval_loss keeps naming
-- them and lab.retrieval-loses-nothing stays red. Nothing here goes green on work not done.
--
-- No row is deleted anywhere in this file. Recovering the 17,559 by deleting the 101,608
-- and re-pulling was considered and rejected: it trades a known gap for an unrecoverable
-- one if the re-pull fails, and metrc_lab_results has no backup of its own.
--
-- -----------------------------------------------------------------------------
-- THIS MIGRATION BREAKS A DEPLOYED FUNCTION. REDEPLOY BOTH IN THE SAME WINDOW.
-- -----------------------------------------------------------------------------
-- The DEPLOYED metrc-lab-sync (version 1, the running artifact) upserts with
-- onConflict: "license,package_tag,test_name". The moment the index behind that key is
-- dropped, every upsert it makes fails with 42P10, no unique constraint matching the ON
-- CONFLICT specification. The repository source has already been corrected to the natural
-- key - and CORRECTED IN SOURCE IS NOT CORRECTED. A file on disk changes nothing about what
-- is running; that distinction is the whole of standard rule 6 and I stated it the wrong way
-- round in my first report.
--
-- Nothing schedules metrc-lab-sync - metrc_scan_schedule has no lab job and no cron entry
-- names it - and it records the error rather than swallowing it, so between the migration and
-- the redeploy it degrades to a LOUD no-op reachable only by hand. That is a small window and
-- a visible failure, not a silent one. It is still a break, and it is not acceptable to leave
-- it standing.
--
-- ORDER: (1) apply this migration, (2) redeploy metrc-lab-backfill AND metrc-lab-sync,
-- (3) then and only then select tg_metrc_lab_enqueue(true) for the 140.
--
-- The redeploy also removes a hardcoded x-admin-key literal from both running functions -
-- an auth bypass that reaches metrc-lab-sync even with verify_jwt false. The on-disk sources
-- read it from integration_secrets instead. Key rotation is parked by the owner until after
-- deployment and this does not change that; it stops the literal shipping again.
--
-- -----------------------------------------------------------------------------
-- UNDO, in full, before you start
-- -----------------------------------------------------------------------------
--   select cron.unschedule('metrc-lab-enqueue');
--   select cron.unschedule('metrc-lab-drain');
--   drop function if exists tg_metrc_lab_drain(integer);
--   drop function if exists tg_metrc_lab_enqueue(boolean);
--   drop function if exists tg_metrc_lab_store(text,text,bigint,jsonb);
--   drop view if exists v_metrc_lab_retrieval_loss;
--   drop view if exists v_failed_material_without_result;
--   drop view if exists v_manifest_line_gap;
--   drop view if exists v_metrc_lab_retrieval;
--   delete from verification_checks where check_key like 'lab.%' or check_key like 'manifest.line%';
--   create unique index metrc_lab_results_license_pkg_testname_key
--     on metrc_lab_results (license, package_tag, test_name);       -- only if it is empty of
--   alter table metrc_lab_results add constraint                    -- new retest rows by then
--     metrc_lab_results_license_package_tag_test_type_result_date_key
--     unique (license, package_tag, test_type, result_date);
--   drop index if exists metrc_lab_results_natural_key;
--   alter table metrc_lab_results drop column lab_test_result_id;
--   alter table metrc_lab_backfill drop column results_stored, drop column results_deduped,
--     drop column queued_at, drop column attempts, drop column requeue_reason;
--
-- Everything is idempotent. 20260811154220 was applied twice by a tool retry and survived
-- only because it was; assume this one will be too.
--
-- BLAST RADIUS, re-counted at review time: 25 views and materialised views read
-- metrc_lab_results - it was 24 when I first measured, and v_tag_evidence and mv_tag_evidence
-- joined the list when the certificate release went in an hour later. None of them is affected
-- by adding a column or swapping an index, and NO foreign key references the table, so the
-- constraint drop cannot cascade. The re-count is recorded rather than the first number
-- because a stale figure in a migration header is the same wrong-training problem as a stale
-- figure in the brain.
--
-- NO begin/commit IN THIS FILE. apply_migration already wraps the whole script in one
-- transaction, and a nested pair is at best noise and at worst a second commit point somebody
-- reasons about incorrectly. Applied through any path, this file is still all-or-nothing:
-- if the natural-key index cannot be built, nothing before it survives either.
-- =============================================================================

-- =============================================================================
-- 1. THE NATURAL KEY
-- =============================================================================

-- Generated, not written by the loader. A column the loader has to remember to populate is
-- a column that will be null the first time somebody writes a second loader.
alter table metrc_lab_results
  add column if not exists lab_test_result_id bigint
  generated always as (nullif(raw->>'LabTestResultId','')::bigint) stored;

comment on column metrc_lab_results.lab_test_result_id is
 'Metrc LabTestResultId: the identifier of the TEST EVENT, not of the analyte row. One test '
 'carries around 45 analytes, so this repeats within a package by design. Generated from raw '
 'so it can never disagree with the payload. Part of the natural key with test_name.';

-- Built BEFORE the wrong ones are dropped. If it cannot be built the whole transaction rolls
-- back and the table is exactly as it was.
create unique index if not exists metrc_lab_results_natural_key
  on metrc_lab_results (license, package_tag, lab_test_result_id, test_name)
  nulls not distinct;

comment on index metrc_lab_results_natural_key is
 'One Metrc measurement: this licence, this package, this test event, this analyte. Replaces '
 '(license, package_tag, test_name), which was created outside any migration to silence an ON '
 'CONFLICT error and discarded 17,559 of 119,167 fetched rows without raising anything.';

drop index if exists metrc_lab_results_license_pkg_testname_key;

alter table metrc_lab_results
  drop constraint if exists metrc_lab_results_license_package_tag_test_type_result_date_key;

-- Rule 11: a table a sync writes to gets its key registered in the same commit, with the
-- reason. metrc_lab_results was never registered, which is exactly why no-duplicate-rows.mjs
-- never looked at it and the ad-hoc index sat there unaudited.
insert into duplicate_key (table_name, key_columns, why) values
 ('metrc_lab_results',
  array['license','package_tag','lab_test_result_id','test_name'],
  'One analyte within one Metrc test event, for one package under one licence. A package is '
  || 'legitimately tested more than once - 340 of 2,642 already are - so the test event must '
  || 'be in the key. THE EVIDENCE IS THE WORKED CASE, NOT A ZERO: package '
  || '1A40A0300011815000000775 has 224 results across FIVE test events and can hold only 130 '
  || 'under the key this replaces. Measured 13 Aug 2026: 2,986 duplicate groups without '
  || 'test_name (many analytes per test) and 1,495 on the test id alone (one test covers many '
  || 'packages) - both real. This key also reads 0 duplicate groups, but that is ENTAILED and '
  || 'not evidence: it is the previously enforced key plus a column, and adding a column can '
  || 'only weaken a unique key.'),
 ('metrc_lab_backfill',
  array['license','metrc_package_id'],
  'One retrieval record per package per licence. Metrc package ids are issued per licence, so '
  || 'a package visible under both licences is two rows and both are correct.')
on conflict (table_name) do update
  set key_columns = excluded.key_columns, why = excluded.why;

-- =============================================================================
-- 2. THE LEDGER LEARNS TO RECORD WHAT LANDED, NOT WHAT WAS FETCHED
-- =============================================================================
-- metrc_lab_backfill.results held the API's count and nothing held the database's. That one
-- missing column is the whole reason a 14.7 per cent loss survived six days of dashboards.

alter table metrc_lab_backfill add column if not exists results_stored   integer;
alter table metrc_lab_backfill add column if not exists results_deduped  integer;
alter table metrc_lab_backfill add column if not exists queued_at        timestamptz;
alter table metrc_lab_backfill add column if not exists attempts         integer not null default 0;
alter table metrc_lab_backfill add column if not exists requeue_reason   text;

alter table metrc_lab_backfill alter column queued_at set default now();

comment on column metrc_lab_backfill.results  is
 'How many result rows METRC RETURNED. Written from the API response.';
comment on column metrc_lab_backfill.results_stored is
 'How many rows the DATABASE actually holds afterwards, written by tg_metrc_lab_store from the '
 'INSERT''s own outcome. When this is less than results, rows were lost. Null on the 3,099 rows '
 'from the 6 August sweep, which predates the column - for those, compare against a live count.';
comment on column metrc_lab_backfill.results_deduped is
 'Rows the payload itself repeated on the natural key, dropped on purpose and counted so the '
 'drop is never silent.';
comment on column metrc_lab_backfill.queued_at is
 'Null on the original 6 August rows: the column did not exist and inventing a value for them '
 'would be fabricating a timestamp. Everything queued from now on carries a real one.';
comment on column metrc_lab_backfill.requeue_reason is
 'Why this package is in the queue again. "Because the state moved" and "because we lost its '
 'rows" need different handling, and a queue that cannot tell them apart cannot report.';

create index if not exists metrc_lab_backfill_queued_at on metrc_lab_backfill (queued_at)
  where fetched_at is null;

-- =============================================================================
-- 3. THE LANDING FUNCTION. One statement writes the results AND the ledger.
-- =============================================================================
-- The loader can no longer report a number the database did not agree to. It hands over the
-- payload and gets back what actually happened.

create or replace function public.tg_metrc_lab_store(
  p_license    text,
  p_package_tag text,
  p_package_id bigint,
  p_rows       jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_returned int;
  v_distinct int;
  v_inserted int := 0;
  v_updated  int := 0;
  v_held     int;
begin
  if p_license is null or p_package_tag is null or p_package_id is null then
    raise exception 'tg_metrc_lab_store needs a licence, a package tag and a Metrc package id';
  end if;

  v_returned := coalesce(jsonb_array_length(coalesce(p_rows,'[]'::jsonb)), 0);

  -- Collapse anything the payload repeats on the natural key BEFORE the insert, so a repeat
  -- inside one batch cannot abort the batch. Counted, never silent.
  with src as (
    select x.value as r,
           row_number() over (
             partition by (x.value->>'LabTestResultId'), (x.value->>'TestTypeName')
             order by x.ordinality) as rn
      from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) with ordinality as x(value, ordinality)
  ), one_each as (
    select r from src where rn = 1
  ), landed as (
    insert into metrc_lab_results
      (license, package_tag, package_id, test_name, test_type, result, passed, units,
       result_date, lab_facility, document_file_id, notes, raw, synced_at)
    select p_license,
           p_package_tag,
           p_package_id::text,
           r->>'TestTypeName',
           r->>'TestTypeName',
           nullif(r->>'TestResultLevel','')::numeric,
           coalesce((r->>'TestPassed')::boolean, (r->>'OverallPassed')::boolean),
           r->>'TestTypeUnitOfMeasureAbbreviation',
           nullif(coalesce(r->>'ResultReleaseDateTime', r->>'TestPerformedDate'),'')::date,
           r->>'LabFacilityName',
           r->>'LabTestResultDocumentFileId',
           r->>'ProductName',
           r,
           now()
      from one_each
    on conflict (license, package_tag, lab_test_result_id, test_name) do update
      set result           = excluded.result,
          passed           = excluded.passed,
          units            = excluded.units,
          result_date      = excluded.result_date,
          lab_facility     = excluded.lab_facility,
          document_file_id = excluded.document_file_id,
          notes            = excluded.notes,
          raw              = excluded.raw,
          package_id       = excluded.package_id,
          synced_at        = now()
    returning (xmax = 0) as was_insert
  )
  select count(*) filter (where was_insert),
         count(*) filter (where not was_insert),
         count(*)
    into v_inserted, v_updated, v_distinct
    from landed;

  -- READ IT BACK. v_inserted + v_updated is arithmetic on this function's own variables and
  -- can only ever agree with itself - a check that cannot fail. This counts what the table
  -- actually holds for the package afterwards, which is a different source, and it is the
  -- number the queue is judged against.
  select count(*) into v_held
    from metrc_lab_results
   where license = p_license and package_tag = p_package_tag;

  update metrc_lab_backfill
     set fetched_at      = now(),
         results         = v_returned,
         results_stored  = v_inserted + v_updated,
         results_deduped = v_returned - v_distinct,
         attempts        = attempts + 1,
         error           = case
                             when v_held >= v_distinct then null
                             else 'read back ' || v_held || ' rows for this package after '
                                  || 'landing ' || v_distinct || ' of ' || v_returned
                                  || ' returned - do not trust this package until it is explained'
                           end,
         document_file_ids = nullif(array(
           select distinct (x.value->>'LabTestResultDocumentFileId')::bigint
             from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) x
            where x.value->>'LabTestResultDocumentFileId' is not null), '{}')
   where license = p_license and metrc_package_id = p_package_id;

  return jsonb_build_object(
    'ok', true,
    'returned', v_returned,
    'deduped',  v_returned - v_distinct,
    'inserted', v_inserted,
    'updated',  v_updated,
    'stored',   v_inserted + v_updated,
    'held_after', v_held);
end $function$;

comment on function public.tg_metrc_lab_store(text,text,bigint,jsonb) is
 'Lands one package''s Metrc lab results and closes its queue row IN THE SAME CALL, so the '
 'ledger can only ever record what the database accepted. Returns returned/deduped/stored. '
 'Replaces a loop of plain INSERTs in slices of 200 where one unique violation silently threw '
 'away 200 rows and the counter still added them.';

revoke all on function public.tg_metrc_lab_store(text,text,bigint,jsonb) from public, anon;
grant execute on function public.tg_metrc_lab_store(text,text,bigint,jsonb) to service_role;

-- =============================================================================
-- 4. THE ENQUEUE. The half of the promise that was never implemented.
-- =============================================================================
-- metrc-lab-backfill's own header says a package is "pulled once and never again unless its
-- testing state changes". Nothing anywhere implemented the second clause, and the queue only
-- ever selects fetched_at is null, so a package fetched while it was still at the laboratory
-- was stamped and never looked at again. Fourteen packages went through that door: queued
-- 6 August as SubmittedForTesting, correctly returned nothing, stamped, and then passed on
-- 10-11 August into a queue that could not see them. Nine of them carry 6,810 g each -
-- 61,290 g, 135.12 lb - and one of them FAILED.
--
-- NOTE ON THE POPULATION. Packages still at the laboratory are DELIBERATELY NOT ENQUEUED.
-- Fetching a SubmittedForTesting package returns nothing and stamps fetched_at, which is the
-- exact mistake that created the fourteen. They enter the queue when their state moves, which
-- is what rule (a) below is for. That is why this enqueues 779 and not 838.
--
-- DO NOT EXPECT A LARGE NUMBER OF ROWS BACK, AND DO NOT READ A SMALL ONE AS FAILURE.
-- 757 of the 765 never-queued packages are REPACKS (SourcePackageCount > 0). The comparable
-- cohort already measured - the 119 fetched packages that sit in a tested state and returned
-- nothing - are repacks too, and 110 of them have an immediate parent that holds the results
-- directly. A child inherits its parent's test, so Metrc has nothing of its own to return.
-- The certain recoveries here are the FOURTEEN whose state moved, and the 17,559 rows behind
-- the 140 once the loader upserts. Anything else is a bonus. Stating this in advance so that
-- "the catch-up only returned a few hundred rows" is read as the expected outcome and not as
-- a broken job - a projection quoted without its caveat becomes a target nobody can hit.

create or replace function public.tg_metrc_lab_enqueue(p_include_lossy boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_new int; v_moved int; v_lossy int;
begin
  -- (a) A package carrying a result that has never been asked for.
  with cand as (
    select p.license, (p.raw->>'Id')::bigint pid, p.tag, p.lab_testing_state
      from metrc_packages p
     where p.lab_testing_state in ('TestPassed','TestFailed','RetestPassed')
       and not exists (select 1 from metrc_lab_backfill b
                        where b.license = p.license and b.metrc_package_id = (p.raw->>'Id')::bigint)
  ), ins as (
    insert into metrc_lab_backfill
      (license, metrc_package_id, package_tag, lab_testing_state, queued_at, requeue_reason)
    select license, pid, tag, lab_testing_state, now(),
           'never asked for - package carries testing state ' || lab_testing_state
      from cand
    on conflict (license, metrc_package_id) do nothing
    returning 1)
  select count(*) into v_new from ins;

  -- (b) THE SECOND HALF OF THE PROMISE. The testing state moved after we fetched, so whatever
  --     we hold is an answer to a question about a different state of the world.
  with moved as (
    update metrc_lab_backfill b
       set fetched_at        = null,
           lab_testing_state = p.lab_testing_state,
           queued_at         = now(),
           attempts          = 0,
           error             = null,
           requeue_reason    = 'testing state moved from ' || coalesce(b.lab_testing_state,'unknown')
                               || ' to ' || coalesce(p.lab_testing_state,'unknown')
      from metrc_packages p
     where p.license = b.license
       and (p.raw->>'Id')::bigint = b.metrc_package_id
       and b.fetched_at is not null
       and p.lab_testing_state is distinct from b.lab_testing_state
    returning 1)
  select count(*) into v_moved from moved;

  -- (c) The packages whose rows were thrown away by the old key. OFF BY DEFAULT: re-fetching
  --     one of these against the CURRENT deployed loader repeats the same plain INSERT over
  --     rows that already exist, so the slice dies again. Turn this on only once
  --     metrc-lab-backfill calls tg_metrc_lab_store.
  --     THE JOIN HERE MUST BE CORRELATED, NOT AN UPDATE ... FROM. Caught in review by X
  --     before this shipped, and it was the worst kind of bug: the one that reports success.
  --     The first draft joined to a grouped subquery of metrc_lab_results through the FROM
  --     clause, which is an INNER join - so the 137 packages that lost EVERY row have no row
  --     in metrc_lab_results, are absent from the subquery, and were silently excluded. It
  --     requeued 3 packages and 894 rows against the intended 140 and 17,559, missed 94.9 per
  --     cent of the recovery, and returned ok:true with the number 3 on it. Somebody reads 3,
  --     calls it done, and lab.retrieval-loses-nothing stays red forever with no explanation.
  --     Measured both forms on the live table before changing it: inner join 3 / 894,
  --     correlated 140 / 17,559. coalesce() around the count is not needed and is not used -
  --     a correlated count(*) returns 0, never null, and a coalesce that can never fire reads
  --     like a guard while guarding nothing.
  v_lossy := 0;
  if p_include_lossy then
    with lossy as (
      update metrc_lab_backfill b
         set fetched_at     = null,
             queued_at      = now(),
             attempts       = 0,
             error          = null,
             requeue_reason = 'rows lost on the 6 August sweep: ' || b.results || ' returned, '
                              || (select count(*) from metrc_lab_results r
                                   where r.license = b.license and r.package_tag = b.package_tag)
                              || ' held'
       where b.results > (select count(*) from metrc_lab_results r
                           where r.license = b.license and r.package_tag = b.package_tag)
      returning 1)
    select count(*) into v_lossy from lossy;
  end if;

  return jsonb_build_object(
    'ok', true,
    'newly_queued', v_new,
    'requeued_because_state_moved', v_moved,
    'requeued_because_rows_were_lost', v_lossy,
    'still_queued', (select count(*) from metrc_lab_backfill where fetched_at is null),
    'note', case when p_include_lossy then
              'Lossy packages included. This only recovers anything if metrc-lab-backfill has '
              || 'been redeployed to call tg_metrc_lab_store; against the plain-INSERT loader '
              || 'the slice dies on rows that already exist and nothing changes.'
            else
              'Lossy packages EXCLUDED by default. The 17,559 lost rows stay lost until the '
              || 'loader upserts. lab.retrieval-loses-nothing stays red until then, on purpose.'
            end);
end $function$;

comment on function public.tg_metrc_lab_enqueue(boolean) is
 'Keeps the lab retrieval queue fed. Three rules: a package with a result nobody asked for, a '
 'package whose testing state moved since we asked, and - only on request - a package whose '
 'rows were discarded by the old key. Packages still at the laboratory are never enqueued: '
 'fetching one returns nothing and stamps it fetched, which is how 14 packages went dark.';

revoke all on function public.tg_metrc_lab_enqueue(boolean) from public, anon;
grant execute on function public.tg_metrc_lab_enqueue(boolean) to authenticated;

-- =============================================================================
-- 5. THE DRAIN. It writes its own run row, first, and closes the previous one.
-- =============================================================================
-- metrc-lab-backfill has never written a metrc_sync_runs row in its life. Its source does
-- attempt one - but on the LAST line, after the loop, outside any try/finally and with the
-- error unbound. Anything that ends the invocation early leaves no trace at all, and an
-- invocation that ends early is precisely the one worth logging. 3,099 packages and 119,167
-- results went through it on 6 August and the sync log has nothing between 23:05 and 23:24.
--
-- So the log is opened OUT HERE, before the call, by the thing that schedules it. It cannot
-- depend on the worker surviving. The previous run is closed from the queue's own evidence -
-- how many rows actually got a fetched_at - and not from the worker's opinion of itself.

insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by)
values ('metrc_lab_drain_batch', 100, 'packages', 'Lab retrieval batch size',
        'How many packages one drain tick hands to metrc-lab-backfill. The 6 August sweep ran '
        || '3,099 packages in 19 minutes 45 seconds, so a package costs about 0.4 seconds and '
        || '100 of them about 40 - comfortably inside an Edge Function invocation, and gentle '
        || 'on a Metrc endpoint that must be called once per package.',
        'Measured from metrc_lab_backfill.fetched_at spread on 6 August 2026', 'agent-i')
on conflict (key) do nothing;

create or replace function public.tg_metrc_lab_drain(p_limit integer default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_limit int := coalesce(p_limit, f_rule('metrc_lab_drain_batch')::int, 100);
  v_open  metrc_sync_runs;
  v_todo  int;
  v_done  int;
  v_run   bigint;
  v_req   bigint;
begin
  -- Close the previous tick from the queue, not from the worker's self-report.
  select * into v_open from metrc_sync_runs
   where endpoint = 'lab results backfill' and status = 'running' and finished_at is null
   order by started_at desc limit 1;

  if found then
    if v_open.started_at > now() - interval '4 minutes' then
      return 'waiting - the previous drain started '
             || round(extract(epoch from now() - v_open.started_at)) || 's ago';
    end if;
    select count(*) into v_done from metrc_lab_backfill
     where fetched_at >= v_open.started_at;
    update metrc_sync_runs
       set status = case when v_done > 0 then 'ok' else 'error' end,
           finished_at = now(),
           records = v_done,
           error = case when v_done > 0 then null
                        else 'The worker was called and not one queue row was stamped. Either '
                             || 'the invocation never reached Metrc or it died before writing.' end,
           note = coalesce(note,'') || ' · closed by tg_metrc_lab_drain from the queue: '
                  || v_done || ' packages stamped'
     where id = v_open.id;
  end if;

  select count(*) into v_todo from metrc_lab_backfill where fetched_at is null;
  if v_todo = 0 then
    return 'nothing queued - lab retrieval is up to date';
  end if;

  insert into metrc_sync_runs (endpoint, license, status, records, note)
  values ('lab results backfill', 'both', 'running', 0,
          v_todo || ' packages queued, handing over ' || least(v_limit, v_todo))
  returning id into v_run;

  -- runId is passed so the worker can close the row we opened. Version 1 of the worker
  -- ignores an unknown query parameter, so this is safe before the redeploy as well as
  -- after it: if the worker never closes the row, the next tick closes it from the queue.
  select tg_call_function('metrc-lab-backfill?limit=' || v_limit || '&runId=' || v_run)
    into v_req;

  update metrc_sync_runs set note = note || ' · request ' || v_req where id = v_run;

  return format('fired %s of %s queued packages (run %s, request %s)',
                least(v_limit, v_todo), v_todo, v_run, v_req);
end $function$;

comment on function public.tg_metrc_lab_drain(integer) is
 'Fires one batch of lab retrieval and OPENS ITS OWN RUN ROW BEFORE CALLING, because the '
 'worker writes its log on its last line and therefore never wrote one at all. Closes the '
 'previous run from the queue''s own fetched_at stamps. Returns what it did in words: '
 '"waiting", "nothing queued" and "fired" are three different answers and a stalled drain '
 'must never read like a finished one.';

revoke all on function public.tg_metrc_lab_drain(integer) from public, anon;
grant execute on function public.tg_metrc_lab_drain(integer) to authenticated;

-- =============================================================================
-- 6. THE VIEWS THAT NAME THINGS. A count is a summary of rows nobody has read.
-- =============================================================================

create or replace view v_metrc_lab_retrieval
with (security_invoker = true) as
select b.license,
       b.package_tag,
       b.metrc_package_id,
       p.item_name,
       p.quantity,
       p.uom,
       p.location,
       p.source_state,
       p.finished,
       p.lab_testing_state          as state_now,
       b.lab_testing_state          as state_when_queued,
       b.queued_at,
       b.fetched_at,
       b.requeue_reason,
       b.results                    as returned_by_metrc,
       coalesce(h.n, 0)             as held_in_mirror,
       greatest(0, b.results - coalesce(h.n,0)) as rows_lost,
       b.results_stored,
       b.results_deduped,
       b.error,
       case
         when b.fetched_at is null                                  then 'QUEUED'
         -- This branch must come BEFORE the state comparison. Without it a queue row whose
         -- package has left the mirror joins to nulls, and null IS DISTINCT FROM anything, so
         -- 125 rows read as STATE MOVED. My own first draft did exactly that and reported 139
         -- where the true figure is 14. A wrong label costs more than no label.
         when p.license is null                                     then 'PACKAGE NO LONGER IN THE MIRROR'
         when b.results > coalesce(h.n,0)                           then 'ROWS LOST'
         when p.lab_testing_state is distinct from b.lab_testing_state then 'STATE MOVED SINCE FETCH'
         when b.results = 0 and p.lab_testing_state in ('TestPassed','TestFailed','RetestPassed')
                                                                    then 'NO RESULTS OF ITS OWN - CHECK ITS SOURCE PACKAGE'
         when b.results = 0                                         then 'NOTHING TO RETURN YET'
         else 'COMPLETE'
       end as verdict
  from metrc_lab_backfill b
  left join metrc_packages p
    on p.license = b.license and (p.raw->>'Id')::bigint = b.metrc_package_id
  left join (select license, package_tag, count(*) n from metrc_lab_results group by 1,2) h
    on h.license = b.license and h.package_tag = b.package_tag;

comment on view v_metrc_lab_retrieval is
 'One row per package we have asked Metrc about, with what Metrc returned beside what we '
 'actually hold. This comparison did not exist, which is the only reason a 14.7 per cent loss '
 'survived. Read the rows; the totals are in lab.retrieval-loses-nothing. Verdicts measured '
 '13 Aug 2026: COMPLETE 2,639 · ROWS LOST 140 · PACKAGE NO LONGER IN THE MIRROR 125 · NO '
 'RESULTS OF ITS OWN 119 · NOTHING TO RETURN YET 62 · STATE MOVED SINCE FETCH 14. The 119 are '
 'NOT an alarm and no check is written against them: all 119 are repacks with source packages, '
 'and 110 have an immediate parent that holds results directly - a child inherits its parent''s '
 'test, exactly as the ownership ruling describes. The 9 whose immediate parent holds nothing '
 'are a question for the certificate lane, to be walked further up the lineage before anybody '
 'calls them untested.';

grant select on v_metrc_lab_retrieval to authenticated;

create or replace view v_metrc_lab_retrieval_loss
with (security_invoker = true) as
select * from v_metrc_lab_retrieval where rows_lost > 0 order by rows_lost desc;

comment on view v_metrc_lab_retrieval_loss is
 'The 140 packages whose results were fetched and discarded. Named, not counted - a finding '
 'nobody can act on is a finding nobody acts on.';

grant select on v_metrc_lab_retrieval_loss to authenticated;

create or replace view v_failed_material_without_result
with (security_invoker = true) as
select p.license, p.tag, p.item_name, p.quantity, p.uom, p.location, p.source_state,
       p.lab_testing_state, (p.raw->>'LastModified')::timestamptz as metrc_last_modified,
       (select count(*) from metrc_lab_results r where r.package_tag = p.tag) as result_rows,
       (select count(*) from metrc_rpt_package_transfers t where t.package_tag = p.tag) as manifest_lines,
       b.fetched_at, b.requeue_reason
  from metrc_packages p
  left join metrc_lab_backfill b
    on b.license = p.license and b.metrc_package_id = (p.raw->>'Id')::bigint
 where p.lab_testing_state = 'TestFailed'
   and not p.finished
   and not exists (select 1 from metrc_lab_results r where r.package_tag = p.tag);

comment on view v_failed_material_without_result is
 'Live material Metrc says FAILED, where we hold no result at all - so we cannot say which '
 'analyte failed, at what level, or by which laboratory. This is NOT a compliance allegation: '
 'the owner''s standing ruling is that we remediate failed material and follow the child tag. '
 'It is a statement that the remediation cannot even begin from a fact the platform does not '
 'hold. 1A40A030000E5B1000006129, 6,810 g, Pre Trim Storage Room, failed 11 August 2026.';

grant select on v_failed_material_without_result to authenticated;

-- =============================================================================
-- 7. THE MANIFEST LINE ITEMS. What is ON the manifest, five days behind.
-- =============================================================================
-- The header table metrc_transfers syncs hourly and is current to 22:00 tonight. The LINE
-- table metrc_rpt_package_transfers is a CSV report import and was last loaded 7 August
-- 17:25. So an amended manifest line is invisible, and v_tag_resolver and the_manifest_wins
-- rule are both reading a five-day-old manifest.
--
-- Measured tonight, and this is the part that makes it concrete rather than a staleness
-- grumble: Metrc's own delivery payload declares how many packages are on each manifest, and
-- we already store it - metrc_transfers.raw->'_delivery'->>'DeliveryPackageCount', present on
-- 2,547 of 2,599 outgoing transfers. Compare it to the lines we hold:
--
--   manifests declaring a package count            2,547
--   manifests where the counts match exactly       2,523   (nothing short, nothing over)
--   manifests holding NO line detail at all           24
--   package lines missing                            141
--     of those, on manifests created after 7 Aug     134 on 21 manifests
--     of those, on manifests older than the import     7 on  3 manifests
--
-- Two of yesterday's manifests carry 23 and 22 packages and we hold not one line of either.
-- The 3 old ones (2025-07-21 x2, 2025-12-18) are a separate, pre-existing gap.
--
-- The permanent fix is an API path: /transfers/v2/delivery/{id}/packages, whose input - the
-- delivery Id - is ALREADY STORED on 2,547 transfers. Nothing in the codebase calls it; the
-- only delivery endpoint we call is /deliveries. That is an edge-function build and it is
-- filed in actions_register below. This migration makes the gap impossible to miss.

create or replace view v_manifest_line_gap
with (security_invoker = true) as
with hdr as (
  select t.license, t.manifest_number, t.direction, t.recipient, t.created_on,
         (t.raw->'_delivery'->>'Id')::bigint          as delivery_id,
         (t.raw->'_delivery'->>'DeliveryPackageCount')::int as declared_packages
    from metrc_transfers t
   where t.raw ? '_delivery'
), lines as (
  select manifest_number, count(distinct package_tag) held, max(imported_at) last_import
    from metrc_rpt_package_transfers group by 1
), last_import as (
  select coalesce(max(imported_at), 'epoch'::timestamptz) at_time from metrc_rpt_package_transfers
)
select h.license, h.manifest_number, h.direction, h.recipient, h.created_on, h.delivery_id,
       h.declared_packages,
       coalesce(l.held,0) as lines_held,
       h.declared_packages - coalesce(l.held,0) as lines_missing,
       (select at_time from last_import) as line_import_ran_at,
       (h.created_on > (select at_time from last_import)::date) as created_after_last_import,
       case when h.created_on > (select at_time from last_import)::date
            then 'IN FLIGHT - this manifest is newer than our most recent line import'
            else 'MISSING - this manifest existed when the line import ran and its lines are absent'
       end as verdict
  from hdr h
  left join lines l on l.manifest_number = h.manifest_number
 where coalesce(l.held,0) < h.declared_packages;

comment on view v_manifest_line_gap is
 'Manifests where Metrc''s own declared package count exceeds the line detail we hold. Two '
 'genuinely independent sources: the count comes from the live API delivery payload, the lines '
 'from the CSV report import. A manifest created after the last import is IN FLIGHT by '
 'construction and says so - no invented settling window, because a window inferred from late '
 'rows makes lateness normal.';

grant select on v_manifest_line_gap to authenticated;

insert into ratchet_baseline (metric_key, baseline, set_by, what_it_counts, note) values
 ('manifest_lines_missing', 141, 'agent-i 13 Aug 2026',
  'Package lines declared on a Metrc outgoing manifest that our line-item mirror does not '
  || 'hold, summed over all manifests. Source A is the live API delivery payload, source B is '
  || 'the metrc_rpt_package_transfers import.',
  'Set the night the gap was first measured. 141 lines on 24 manifests: 134 of them on 21 '
  || 'manifests created after the last import ran on 7 August, 7 on 3 manifests old enough '
  || 'that the import should have had them. It may fall and may never rise - a rise means '
  || 'another shipment left the building with no line detail behind it. It returns to zero '
  || 'the moment a line import runs, so it is actionable on the day it fires.')
on conflict (metric_key) do nothing;

-- =============================================================================
-- 8. THE CHECKS. Routed through tg_verify, which is the runner that actually runs.
-- =============================================================================
-- tg_check_tile_drill() has no cron entry and fires nothing; a registry row alone is not a
-- watcher. tg_verify runs at :20 past the hour - 24 runs in the last 24 hours, proven from
-- verification_runs, which is the runner's own footprint rather than the scheduler's opinion
-- of itself. Everything below hangs off it.
--
-- Every check is written so IMPROVEMENT NEVER FIRES IT: source A counts things that are
-- wrong, source B is zero.

insert into verification_checks
 (check_key, title, what_it_proves, source_a_label, source_a_sql,
  source_b_label, source_b_sql, tolerance_pct, severity, owner,
  measures_a_process, in_flight_rule, settles_within)
values

 ('lab.retrieval-loses-nothing',
  'Every lab result Metrc returned is a lab result we hold',
  'The single largest data loss found on this platform: 17,559 of 119,167 fetched result rows '
  || 'were discarded by a unique index created outside any migration, and nothing compared the '
  || 'fetch ledger to the table for six days. This check IS that comparison. It is red today '
  || 'and stays red until metrc-lab-backfill upserts through tg_metrc_lab_store and the 140 '
  || 'affected packages are re-pulled. Red for a real reason is the correct state.',
  'Result rows Metrc returned that the mirror does not hold',
  'select coalesce(sum(greatest(0, b.results - coalesce(h.n,0))),0)::numeric '
  || 'from metrc_lab_backfill b left join (select license, package_tag, count(*) n '
  || 'from metrc_lab_results group by 1,2) h '
  || 'on h.license=b.license and h.package_tag=b.package_tag',
  'Zero, which is the only acceptable number',
  'select 0',
  0, 'critical', 'Vincent', false, null, null),

 ('lab.every-tested-package-is-queued',
  'No package carries a Metrc test result we have never asked for',
  'Retrieval is per package - Metrc has no "all lab results" endpoint - so a package that '
  || 'never enters the queue is a certificate that never arrives, and it reads exactly like a '
  || 'package that was never tested. That confusion is what the owner''s never-tested proof '
  || 'rule exists to stop.',
  'Packages in a result-bearing state with no queue row',
  'select count(*)::numeric from metrc_packages p '
  || 'where p.lab_testing_state in (''TestPassed'',''TestFailed'',''RetestPassed'') '
  || 'and not exists (select 1 from metrc_lab_backfill b where b.license=p.license '
  || 'and b.metrc_package_id=(p.raw->>''Id'')::bigint) '
  || 'and coalesce((p.raw->>''LastModified'')::timestamptz, ''epoch''::timestamptz) '
  || '< now() - interval ''2 hours''',
  'Zero',
  'select 0',
  0, 'elevated', 'Vincent',
  true,
  'A package whose Metrc record changed within the last two hours has not had its turn yet: '
  || 'the enqueue runs hourly, so two hours is one cadence plus one. That window comes from '
  || 'the schedule WE set, never from how late rows actually are - inferring it from the data '
  || 'is how lateness becomes normal. My first draft excluded anything newer than the last '
  || 'enqueue run, which read GREEN the moment it was installed and before a single package '
  || 'had been queued, and would have gone green again the day the enqueue died.',
  interval '2 hours'),

 ('lab.a-moved-testing-state-is-refetched',
  'A package whose testing state moved has been asked again',
  'metrc-lab-backfill''s header promises a package is "pulled once and never again unless its '
  || 'testing state changes" and NOTHING implemented the second clause. Fourteen packages were '
  || 'fetched on 6 August while still SubmittedForTesting, correctly returned nothing, were '
  || 'stamped fetched, and then passed on 10-11 August into a queue that only ever selects '
  || 'fetched_at is null. Nine carried 6,810 g each - 135.12 lb - and one had failed.',
  'Fetched packages whose testing state has moved since',
  'select count(*)::numeric from metrc_lab_backfill b join metrc_packages p '
  || 'on p.license=b.license and (p.raw->>''Id'')::bigint=b.metrc_package_id '
  || 'where b.fetched_at is not null '
  || 'and p.lab_testing_state is distinct from b.lab_testing_state '
  || 'and coalesce((p.raw->>''LastModified'')::timestamptz, ''epoch''::timestamptz) '
  || '< now() - interval ''2 hours''',
  'Zero',
  'select 0',
  0, 'critical', 'Vincent',
  true,
  'A state that moved in Metrc within the last two hours is still in flight and is excluded - '
  || 'one enqueue cadence plus one, taken from the schedule we set rather than from how late '
  || 'anything has been. Past two hours a package showing here has been SKIPPED, not delayed, '
  || 'and that is the exact failure that left nine packages carrying 135.12 lb and one failed '
  || 'batch invisible for two days.',
  interval '2 hours'),

 ('lab.failed-material-carries-its-result',
  'Live material that failed testing has its result in the mirror',
  'Distinct from failed-state-vs-lab-result, which compares two totals and has been red at '
  || '149 against 134 without naming anybody. This one is restricted to material that is still '
  || 'LIVE - not finished - and demands at least one result row, so it is short, named in '
  || 'v_failed_material_without_result, and closeable. The owner''s ruling is that we remediate '
  || 'failed material and follow the child tag; you cannot start that from a failure whose '
  || 'analyte, level and laboratory the platform does not hold.',
  'Live failed packages with no lab result at all',
  'select count(*)::numeric from v_failed_material_without_result',
  'Zero',
  'select 0',
  0, 'critical', 'Vincent',
  true,
  'A failure recorded in Metrc within the last two hours has not been re-pulled yet - one '
  || 'enqueue cadence plus one, and the same window the other lab checks use. The view itself '
  || 'applies no window, so the two rows standing tonight (25,782 g and 6,810 g, both dated '
  || 'weeks and days ago) are outside it and count.',
  interval '2 hours'),

 ('lab.nothing-is-stuck-in-the-queue',
  'The lab retrieval drain is alive, judged by its effect',
  'A scheduled job can report success while doing nothing - a retry loop once ran 1,440 times '
  || 'a day retrying nothing and read as green throughout. So this does not ask the drain how '
  || 'it is. It counts packages that have sat in the queue unfetched for over two hours, which '
  || 'can only happen if the drain has stopped working or its cron entry has been removed.',
  'Packages queued for more than two hours and still unfetched',
  'select count(*)::numeric from metrc_lab_backfill '
  || 'where fetched_at is null and queued_at < now() - interval ''2 hours''',
  'Zero',
  'select 0',
  0, 'elevated', 'Vincent',
  true,
  'A package queued within the last two hours is waiting its turn, not stuck: the drain runs '
  || 'every five minutes and hands over 100 packages a tick, so a full 779-package catch-up '
  || 'clears in about forty minutes and the largest sweep ever run cleared in twenty.',
  interval '2 hours'),

 ('manifest.line-detail-for-every-manifest-we-could-have-imported',
  'Every manifest old enough to be in the line import has its lines',
  'metrc_transfers is the manifest HEADER and syncs hourly. metrc_rpt_package_transfers is what '
  || 'is actually ON the manifest and comes only from a CSV report import, last run 7 August. '
  || 'The owner raised this himself: "if there is change in Manefest for orders or inventory '
  || 'the sync must pick it up." Two independent sources - Metrc''s own declared package count '
  || 'from the live delivery payload against the imported lines.',
  'Declared package lines missing on manifests older than our last import',
  'select coalesce(sum(lines_missing),0)::numeric from v_manifest_line_gap '
  || 'where not created_after_last_import',
  'Zero',
  'select 0',
  0, 'critical', 'Vincent',
  true,
  'A manifest created AFTER the most recent line import cannot possibly be in that import and '
  || 'is excluded by construction - the comparison is against the import''s own timestamp, not '
  || 'against a settling window somebody chose. 21 of tonight''s 24 gaps are in flight by that '
  || 'test and 3 are real.',
  null),

 ('manifest.line-backlog-is-not-growing',
  'The manifest line backlog has not grown since it was measured',
  'The in-flight exclusion above is honest but it would hide an ever-growing backlog behind '
  || '"not yet imported" if no import ever ran again. This is the ratchet that stops that: it '
  || 'sits at zero while the backlog holds or falls and goes red the moment another shipment '
  || 'leaves with no line detail behind it. It returns to zero when an import runs, so it is '
  || 'actionable the day it fires rather than a standing red nobody reads.',
  'Missing manifest lines above the recorded baseline',
  'select greatest(0, (select coalesce(sum(lines_missing),0) from v_manifest_line_gap) '
  || '- (select baseline from ratchet_baseline where metric_key=''manifest_lines_missing''))::numeric',
  'Zero above baseline',
  'select 0',
  0, 'elevated', 'Vincent', false, null, null)

on conflict (check_key) do update set
  title            = excluded.title,
  what_it_proves   = excluded.what_it_proves,
  source_a_label   = excluded.source_a_label,
  source_a_sql     = excluded.source_a_sql,
  source_b_label   = excluded.source_b_label,
  source_b_sql     = excluded.source_b_sql,
  tolerance_pct    = excluded.tolerance_pct,
  severity         = excluded.severity,
  measures_a_process = excluded.measures_a_process,
  in_flight_rule   = excluded.in_flight_rule,
  settles_within   = excluded.settles_within;

-- =============================================================================
-- 9. THE SCHEDULES
-- =============================================================================
-- :47 is clear of verification-suite (:20), feed work (:25), verification-escalate (:30),
-- alert-email-send (:45) and alert-email-confirm (:50). The drain is offset off the :00/:05
-- cluster that refresh-tower and hr-drain-punch-queue already occupy.
--
-- THE DRAIN IS 3-58/5 AND NOT 2-57/5. My first draft used 2-57/5, which yields :47 - the same
-- minute as the enqueue, so once an hour the drain would read the queue while the enqueue was
-- still writing it and hand the worker a partial batch. Caught in review by X. It is a one
-- character fix and exactly the kind of thing that would have produced an occasional short
-- run that nobody could reproduce.
--
-- The drain is left scheduled permanently, not run once and removed. It answers "nothing
-- queued - lab retrieval is up to date" when there is no work, which costs one count(*), and
-- it is the mechanism by which a newly tested package gets its certificate from now on.

select cron.schedule('metrc-lab-enqueue', '47 * * * *', $job$select tg_metrc_lab_enqueue()$job$);
select cron.schedule('metrc-lab-drain',   '3-58/5 * * * *', $job$select tg_metrc_lab_drain()$job$);

-- =============================================================================
-- 10. WHAT THIS FILE CANNOT DO, FILED SO IT DOES NOT EVAPORATE
-- =============================================================================
-- A decision recorded is not a decision implemented. Each of these needs a deploy or a build,
-- and none of them is closed by this migration.

-- actions_register is keyed on a generated uuid, so ON CONFLICT DO NOTHING would match
-- nothing and a second application would file four duplicate actions. Guarded on the title
-- instead. This is the kind of detail that makes "harmless to run twice" true rather than
-- assumed.
insert into actions_register (title, priority, status, source, needs_owner,
                              what_to_do, why_it_matters, how_to_execute, recommendation)
select v.* from (values
 ('Redeploy metrc-lab-backfill AND metrc-lab-sync in the same window as this migration', 'P0', 'open',
  'agent-i · lab natural key migration 13 Aug 2026', true,
  'BOTH functions, not one. metrc-lab-backfill: replace the loop of plain INSERTs in slices of '
  || '200 with one supa.rpc("tg_metrc_lab_store", {p_license, p_package_tag, p_package_id, '
  || 'p_rows}) per package, bind the returned error, and stop writing '
  || 'metrc_lab_backfill.results from the API count - the RPC writes the whole queue row from '
  || 'what the database accepted. metrc-lab-sync: its upsert key must move to the natural key '
  || 'or every write it makes fails 42P10 once the old index is dropped. Both corrections are '
  || 'already in the repository sources. THEN run select tg_metrc_lab_enqueue(true), which must '
  || 'report 140 - if it reports 3, the inner-join bug has come back.',
  '17,559 fetched result rows are lost until metrc-lab-backfill ships. The migration fixes the '
  || 'KEY, so a package never fetched before lands complete - but a re-fetch of a package that '
  || 'already holds rows still throws its whole slice away on a plain INSERT. And the migration '
  || 'BREAKS deployed metrc-lab-sync on the same statement that fixes the key: corrected in '
  || 'source is not corrected. Until both land, lab.retrieval-loses-nothing is red.',
  'Sources are app/supabase/functions/metrc-lab-backfill/index.ts and '
  || 'app/supabase/functions/metrc-lab-sync/index.ts. Deploy through the MCP path, which needs '
  || 'no token. Commit in the same breath - standard 6. The redeploy also removes a hardcoded '
  || 'x-admin-key literal from both running functions, which reaches metrc-lab-sync even with '
  || 'verify_jwt false; the sources read it from integration_secrets instead.',
  'Do this immediately after the migration and before anything else. It is the only thing '
  || 'standing between us and the 17,559 rows, and it closes a break this migration opens.'),

 ('Pull manifest LINE ITEMS from the API instead of a CSV report import', 'P1', 'open',
  'agent-i · lab natural key migration 13 Aug 2026', true,
  'Build a walk over /transfers/v2/delivery/{deliveryId}/packages. The delivery Id is ALREADY '
  || 'STORED on 2,547 outgoing transfers at metrc_transfers.raw->''_delivery''->>''Id'', so the '
  || 'input needs no discovery pass. Land it in metrc_rpt_package_transfers or a sibling table '
  || 'keyed (manifest_number, package_tag) to match the registered duplicate key.',
  'The manifest header syncs hourly; what is ON the manifest has not moved since 7 August. '
  || '141 package lines across 24 manifests are invisible tonight, including two of '
  || 'yesterday''s shipments carrying 23 and 22 packages. v_tag_resolver and the '
  || 'the_manifest_wins ruling both read this table, so we are settling disputes against a '
  || 'five-day-old manifest. The owner raised it himself.',
  'Nothing in the codebase calls the delivery-packages endpoint today; the only delivery call '
  || 'is /deliveries in metrc-delivery-detail and metrc-reference-sync. Model the new worker on '
  || 'metrc-delivery-detail, which already walks transfers and handles the licence pair.',
  'Build it as a queue and drain like the lab one, not a full sweep - 2,547 deliveries at one '
  || 'call each is a sweep that will time out, and a resumable queue never has to.'),

 ('Re-run the manifest PDF parse - manifest_extract stopped on 8 August', 'P2', 'open',
  'agent-i · lab natural key migration 13 Aug 2026', false,
  'Run the parse over manifests received since 8 August 2026 03:01, the last parsed_at in '
  || 'manifest_extract. 764 manifests are parsed against 2,744 on record.',
  'manifest-pdf-coverage has been red at 72 per cent apart. The PDF is the only place the '
  || 'destination is printed for a manifest whose header we cannot resolve.',
  'parse-documents / manifest-parse edge functions. Remember the layout trap: under '
  || 'pdftotext -layout labels and values are offset by one line, so anchor on the licence '
  || 'pattern (MX transporter, IL laboratory, otherwise destination) and never on the adjacent '
  || 'label.',
  'Schedule it rather than running it once. It has now stopped twice.'),

 ('Correct the briefing: outgoing manifest recipients are no longer null', 'P2', 'open',
  'agent-i · lab natural key migration 13 Aug 2026', false,
  'brain/AGENT_BRIEFING.md and _charter_common.md both still say all 2,550 outgoing manifests '
  || 'carry a null recipient and that /transfers/v2/{id}/deliveries "has never been called". '
  || 'Measured tonight: 2,599 outgoing transfers, ZERO null recipients, 2,547 carrying the '
  || 'stored _delivery payload including RecipientFacilityLicenseNumber. metrc-delivery-detail '
  || 'and metrc-reference-sync both call the endpoint and reference sync ran at 22:00 tonight.',
  'The briefing is printed verbatim at session start, so a stale line in it is not a '
  || 'documentation problem - it is wrong training, and every agent starts the day believing '
  || 'it. Two agents could spend a day rebuilding a capability that already works.',
  'Correct the file and re-derive the claim in brain_claims with the query above. Never delete '
  || 'the claim to silence it. 52 outgoing transfers still have no _delivery payload and that '
  || 'is the real remaining gap, which is a different and much smaller sentence.',
  'Fix the text tonight. It is three lines and it is actively misleading every agent.'),

 ('Retire metrc-lab-sync - two loaders for one Metrc endpoint, and one of them skips work', 'P2', 'open',
  'agent-i · lab natural key migration 13 Aug 2026', false,
  'Retire app/supabase/functions/metrc-lab-sync in favour of the queue path '
  || '(metrc_lab_backfill + tg_metrc_lab_enqueue + tg_metrc_lab_drain + metrc-lab-backfill). '
  || 'Its upsert key and its admin-key handling were both corrected on 13 Aug so that the '
  || 'migration does not break it, but correcting it is not the same as needing it.',
  'It builds a set of every package_tag already present in metrc_lab_results and processes '
  || 'only packages ABSENT from that set, so a package holding one row counts as finished. '
  || '1A40A0300011815000000775 holds 130 of the 224 results Metrc has and this function will '
  || 'never look at it again. Two definitions of one primitive is the defect; the countable '
  || 'test is that there should be exactly one loader for /labtests/v2/results and there are two.',
  'Nothing schedules it - metrc_scan_schedule has no lab job and no cron entry names it - so '
  || 'it is reachable only by hand. Check the Sync Center buttons before removing it.',
  'Leave it working until the queue path has drained once and been verified, then remove it '
  || 'and its Sync Center entry in one change.')
) as v(title, priority, status, source, needs_owner,
       what_to_do, why_it_matters, how_to_execute, recommendation)
where not exists (select 1 from actions_register a where a.title = v.title);

-- =============================================================================
-- AFTER APPLYING, RUN THESE FOUR AND COMPARE AGAINST THE NUMBERS IN THE HEADER
-- =============================================================================
-- 1. The key took, and nothing was lost doing it:
--      select count(*) from metrc_lab_results;                        -- expect 101,608
--      select count(*) from (select license,package_tag,lab_test_result_id,test_name
--                              from metrc_lab_results
--                             group by 1,2,3,4 having count(*)>1) x;  -- expect 0
--      select indexname from pg_indexes where tablename='metrc_lab_results';
--                                                    -- expect pkey, mlr_pkg, natural_key only
--
-- 2. Fill the queue and see the population:
--      select tg_metrc_lab_enqueue();      -- expect newly_queued 765,
--                                          --        requeued_because_state_moved 14,
--                                          --        requeued_because_rows_were_lost 0
--
-- 3. Watch it drain (or wait for the cron at :03, :08, :13 ...):
--      select tg_metrc_lab_drain();
--      select verdict, count(*) from v_metrc_lab_retrieval group by 1 order by 2 desc;
--
-- 4. The fourteen, by name, and whether they resolved:
--      select package_tag, state_now, returned_by_metrc, held_in_mirror, verdict
--        from v_metrc_lab_retrieval
--       where requeue_reason like 'testing state moved%' order by package_tag;
--      select * from v_failed_material_without_result;
--
-- 5. ONLY AFTER BOTH EDGE FUNCTIONS ARE REDEPLOYED - the 140 and the 17,559:
--      select tg_metrc_lab_enqueue(true);
--        -- requeued_because_rows_were_lost MUST BE 140. If it is 3, the correlated subquery
--        -- in branch (c) has been turned back into an UPDATE ... FROM, which is an inner join
--        -- and silently drops the 137 packages that hold no rows at all. That form recovers
--        -- 894 of 17,559 and reports ok:true while doing it. This is the single number on the
--        -- whole migration most worth reading twice.
--      select count(*) from metrc_lab_results;   -- expect roughly 119,000 once drained
--
-- RESTATEMENT, WHICH NEEDS THE OWNER BEFORE ANY FIGURE IS REPUBLISHED.
-- v_certificate_gap stands at 1,086 rows tonight and metrc_lab_results at 101,608. When the
-- catch-up completes, both move: the gap falls as certificates arrive for the 779, and the
-- result count rises. The rise is NOT growth and must never be reported as such - it is the
-- correction of a retrieval defect. File the restatement before anyone quotes the new number.
