-- ============================================================================
-- A CHECK OVER A PROCESS MUST KNOW WHICH ROWS ARE STILL IN FLIGHT,
-- OR IT MEASURES THE CALENDAR.
--
-- Established 9 Aug 2026 after the same root cause surfaced THREE times in one day
-- through three different agents, none of whom were looking for it:
--
--   packages-shipped-vs-received  201 packages "never confirmed received", severity
--                                 critical, tolerance 0. Decomposed: 154 of them were
--                                 shipped in the last week and simply IN TRANSIT. Of the
--                                 11 genuinely aged manifests, only 3 had received
--                                 nothing and 8 were partial. 77% of a critical finding
--                                 was work still in the air.
--   packages-unique-on-tag        a package mid-transfer exists under BOTH licences,
--                                 because the sending side is never marked departed. Read
--                                 as a duplicate.
--   lab-samples-shipped-vs-held   samples shipped to a lab are absent from a mirror that
--                                 syncs only ACTIVE packages.
--
-- NONE of the three was an error in the data. All three were STATES THE CHECKS HAD NO
-- CONCEPT OF. A tolerance of 0 on a metric that cannot reach 0 while anything is in
-- flight is a check that is red on every run and therefore ignored -- and
-- packages-shipped-vs-received had been red on every run since it was written.
--
-- The lesson, in the words of the agent who caught their own: "What caught it wasn't a
-- guard. It was looking at the seven rows instead of trusting the count."
--
-- So the declaration is now a COLUMN and a CONSTRAINT, not a habit. A process check
-- cannot be saved without stating what it excludes as unfinished.
-- ============================================================================

alter table verification_checks
  add column if not exists measures_a_process boolean not null default false,
  add column if not exists in_flight_rule     text,
  add column if not exists settles_within     interval;

comment on column verification_checks.measures_a_process is
'True when the check compares two ends of something with a start and a finish -- shipped/received, sent/acknowledged, submitted/returned. Such a check MUST declare what it excludes as still in flight, or it counts unfinished work as failed and goes red on every run.';

comment on column verification_checks.in_flight_rule is
'Plain English plus the predicate: which rows are excluded because the process has not finished yet, and why that is legitimate rather than a way to hide a failure.';

comment on column verification_checks.settles_within is
'How long the process normally takes to complete. Rows younger than this are in flight, not late. OWNER-SET -- never inferred from the data, because inferring it from late rows makes lateness normal (rule A5).';

do $$ begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.verification_checks'::regclass
                   and conname  = 'process_check_declares_in_flight') then
    alter table verification_checks add constraint process_check_declares_in_flight
      check (
        measures_a_process = false
        or (in_flight_rule is not null and length(in_flight_rule) >= 40)
      );
  end if;
end $$;

-- Flag the three that taught us, so the debt is named rather than remembered.
update verification_checks
   set measures_a_process = true,
       in_flight_rule = 'NOT YET DECLARED. Identified 9 Aug 2026 as a process check with no '
         || 'in-flight concept. Until the owner sets settles_within, this check counts work '
         || 'still in the air as failed. Do not act on its raw difference.'
 where check_key in ('packages-shipped-vs-received',
                     'packages-unique-on-tag',
                     'lab-samples-shipped-vs-held')
   and coalesce(in_flight_rule, '') = '';

-- What still needs a declaration, computed rather than typed.
create or replace view public.v_checks_missing_in_flight
with (security_invoker = true) as
select check_key, title, severity, tolerance_pct,
       measures_a_process, settles_within,
       case
         when measures_a_process and settles_within is null
           then 'PROCESS CHECK WITH NO SETTLING PERIOD - counts in-flight work as failed'
         when measures_a_process and tolerance_pct = 0 and settles_within is null
           then 'ZERO TOLERANCE on a metric that cannot reach zero while anything is in flight'
         else 'declared'
       end as state,
       in_flight_rule
from verification_checks
where measures_a_process
order by (settles_within is null) desc, check_key;

comment on view public.v_checks_missing_in_flight is
'Process checks that cannot yet tell unfinished work from failure. settles_within is an owner decision: how long the process normally takes. Inferring it from the data would make lateness normal.';;
