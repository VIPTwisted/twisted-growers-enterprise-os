-- When a check is wrong, the fault belongs to the CHECK, not to the day.
--
-- On 9 Aug 2026 a critical finding said 201 packages were shipped and never confirmed
-- received. 154 of those had shipped within three days and were simply in transit. The
-- real number was 47. Nothing in this platform could record that, so the check would
-- have gone on producing the same alarm forever and the owner would have gone on
-- reading 201. A check that cries wolf trains people to ignore it, which is how a real
-- finding gets missed.

create table if not exists check_defect (
  id           bigserial primary key,
  check_key    text not null,                    -- checker_registry / verification_checks key, or the view
  finding_key  text,                             -- the finding it produced, where there is one
  claimed      text not null check (length(btrim(claimed))  >= 15),
  actually     text not null check (length(btrim(actually)) >= 15),
  defect_kind  text not null check (defect_kind in (
                 'no_age_band','no_void_filter','wrong_join','wrong_population',
                 'unit_mismatch','stale_threshold','double_count','other')),
  impact       text not null check (impact in (
                 'false_alarm','missed_it','overstated','understated')),
  evidence_sql text not null check (length(btrim(evidence_sql)) >= 10),
  found_by     text not null,
  found_at     timestamptz not null default now(),
  fixed_at     timestamptz,
  fixed_by     text,
  fix_note     text,
  constraint fix_needs_its_note check (
    fixed_at is null or length(btrim(coalesce(fix_note,''))) >= 15
  )
);
alter table check_defect enable row level security;
create index if not exists check_defect_open_idx on check_defect (check_key) where fixed_at is null;

create policy check_defect_read  on check_defect for select to authenticated using (true);
create policy check_defect_write on check_defect for all to authenticated
  using (true) with check (true);

comment on table check_defect is
  'Defects in the checks themselves. A check with an unfixed defect is untrusted and '
  'says so in v_check_trust, so a known-broken check cannot keep presenting itself as '
  'authoritative. Distinct from a business finding: the fault is in the instrument.';;
