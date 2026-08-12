-- OWNER, 8 August 2026:
--   "no discrepancies can last longer than a week and must be addressed"
--   "seed to sale software does this so here should not be discrepancies"
--   "all can be resolved with metrc reports, coa and manefiest"
--
-- All three are correct, and the third is the one that makes this buildable.
--
-- THE PROBLEM WITH THE EXISTING FINDINGS. 1,352 are open. 955 of them (70%) came
-- from the platform's own agents, 536 in a single sweep on 5 August. Those are
-- OBSERVATIONS — "this is sitting too long", "this needs allocation". They are
-- work items, not discrepancies, and they bury the real ones: 63 findings are
-- already past a week and 52 are past thirty days, unnoticed, because a queue of
-- 1,352 cannot be worked.
--
-- A DISCREPANCY, here, means exactly one thing:
--   TWO AUTHORITATIVE SOURCES DISAGREE ABOUT THE SAME FACT.
-- Not an opinion, not an ageing threshold, not an agent's judgement. A
-- disagreement, with a document that settles it.
--
-- The register exists so first_seen is STABLE. Computing age from a view that
-- recalculates every read would reset the clock each time the underlying row
-- changed, and a seven-day rule needs a clock that cannot be restarted by a
-- refresh.
create table if not exists discrepancy_register (
  discrepancy_key   text primary key,
  class             text not null,
  subject           text not null,
  source_a          text not null,
  source_a_says     text,
  source_b          text not null,
  source_b_says     text,
  resolved_by_doc   text not null,
  document_link     text,
  first_seen        timestamptz not null default now(),
  last_seen         timestamptz not null default now(),
  resolved_at       timestamptz,
  resolved_by       text,
  resolution_note   text,
  assigned_to       text,
  assigned_at       timestamptz
);

-- RLS at creation, never after.
alter table discrepancy_register enable row level security;
revoke all on discrepancy_register from anon;
grant select, insert, update on discrepancy_register to authenticated;

drop policy if exists dr_read on discrepancy_register;
create policy dr_read on discrepancy_register for select to authenticated using (true);

drop policy if exists dr_write on discrepancy_register;
create policy dr_write on discrepancy_register for update to authenticated
  using (exists (select 1 from app_users u where u.user_id = auth.uid()
                   and u.role::text in ('owner','executive','manager')));

comment on table discrepancy_register is
  'Two authoritative sources disagreeing about the same fact — never an agent opinion or an ageing threshold. first_seen is stable so the owner''s seven-day clock cannot be reset by a refresh. Every row names the document that settles it: a Metrc report, a COA, or a manifest.';

create index if not exists discrepancy_register_open_idx
  on discrepancy_register (first_seen) where resolved_at is null;;
