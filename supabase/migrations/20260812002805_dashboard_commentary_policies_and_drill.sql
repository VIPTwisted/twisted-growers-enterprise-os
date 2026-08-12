-- Agent I (Database COO), 12 Aug 2026. Filed for review as DBI-031 (reviewers V, X, W).
-- Closing the three defects Agent B filed against MY table after delivering the CEO-notes lane.
--
-- DEFECT 1, MINE, AND EXACTLY THE TRAP MY OWN MEMORY RULE WARNS ABOUT IN REVERSE: I enabled
-- row-level security on dashboard_commentary (correct - the 7 Aug incident shipped three tables
-- wide open) and then wrote ZERO policies, which denies EVERYTHING. RLS-on-with-no-policies is
-- the mirror image of RLS-off: one ships data to the world, the other ships a dead feature that
-- renders as an error. B measured it (relrowsecurity true, pg_policy empty) instead of assuming.
--
-- POLICIES: reads for any signed-in user (a signed note is meant to be read by everyone who can
-- see the dashboard). Writes through the ONE existing role helper f_caller_is_admin - no second
-- identity path gets invented at 3am; if the owner later wants non-admin executives writing
-- notes, that is a role-model change made deliberately, not a policy hack. UPDATE is restricted
-- to RETIREMENT ONLY by trigger: body, author and section can never be edited after publication
-- - a correction is a new note, which is what keeps a signed opinion honest.
--
-- DEFECT 2: drill column added, nullable - a CEO note MAY point at evidence; null renders as
-- no drill, never invented.
--
-- DEFECT 3, the placement contract, DECIDED: narrative content lives in the per-dashboard
-- "In plain words" band exactly as B mounted it. page = dashboard key (command/cultivation/
-- finance/...), section_key = lane vocabulary within the band (period keys from
-- tg_period_narrative, standing keys from v_section_narrative, hand-written notes default
-- 'narrative'). Paragraphs do NOT sit under individual tile sections - one band per dashboard,
-- which is what shipped and reads well.
--
-- UNDO: drop policy dc_read/dc_insert/dc_retire on dashboard_commentary;
--       drop trigger trg_dc_retire_only on dashboard_commentary; drop function tg_dc_retire_only();
--       alter table dashboard_commentary drop column drill;

alter table dashboard_commentary add column if not exists drill text;

comment on column dashboard_commentary.drill is
 'Optional drill key - a signed note MAY point at the evidence behind the opinion. NULL renders '
 'as no drill; never invented on the note''s behalf.';

create policy dc_read on dashboard_commentary
  for select to authenticated using (true);

create policy dc_insert on dashboard_commentary
  for insert to authenticated
  with check (f_caller_is_admin() and length(btrim(author)) > 0);

create policy dc_retire on dashboard_commentary
  for update to authenticated
  using (f_caller_is_admin())
  with check (f_caller_is_admin());

create or replace function public.tg_dc_retire_only()
returns trigger language plpgsql as $fn$
begin
  if new.body is distinct from old.body
     or new.author is distinct from old.author
     or new.author_role is distinct from old.author_role
     or new.page is distinct from old.page
     or new.section_key is distinct from old.section_key
     or new.written_at is distinct from old.written_at then
    raise exception
      'A published note is never edited - body, author and placement are immutable. Retire it '
      '(set retired_at and retired_by) and publish a new note. A signed opinion stays exactly '
      'as it was signed.';
  end if;
  return new;
end $fn$;

create trigger trg_dc_retire_only
  before update on dashboard_commentary
  for each row execute function tg_dc_retire_only();

comment on table dashboard_commentary is
 'Hand-written CEO/executive notes pinned to dashboard sections. Attributed and timestamped - '
 'the visible date keeps an old opinion honest. INSERT-ONLY: published notes are immutable by '
 'trigger; corrections are new notes; retirement sets retired_at/retired_by. Reads: any signed-in '
 'user. Writes: f_caller_is_admin only (widening that is a deliberate role-model change, never a '
 'policy hack). PLACEMENT CONTRACT (decided 12 Aug 2026): page = dashboard key, section_key = '
 'lane vocabulary within the per-dashboard "In plain words" band; hand-written notes default '
 'section_key = narrative. RLS was enabled with zero policies for its first hours - the exact '
 'mirror-trap of shipping a table open; Agent B caught it by measuring.';;
