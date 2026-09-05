-- Applied prod 20260904220149. Nine named guards ENABLE ALWAYS.
alter table public.allocation_requests enable always trigger allocation_guard;
alter table public.measure_semantic_registry enable always trigger measure_semantic_guard;
alter table public.metrc_corrections enable always trigger metrc_correction_guard;
alter table public.report_registry enable always trigger report_measure_contract_guard;
alter table public.shift_claims enable always trigger trg_guard_claim;
alter table public.offboarding enable always trigger trg_guard_offboarding_close;
alter table public.employee_schedules enable always trigger trg_guard_schedulable;
alter table public.ratchet_baseline enable always trigger trg_ratchet_guard;
alter table public.root_cause_ledger enable always trigger trg_root_cause_needs_a_guard;
