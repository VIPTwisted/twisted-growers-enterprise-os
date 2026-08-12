-- Agent I (Database COO), 12 Aug 2026. DBI-045 (reviewers V, X, W).
-- Owner: a watchguard agent shadows Agent B - verifying every section is fully wired, dynamic,
-- free of design faults, fortified - and making RECOMMENDATIONS TO HIM for each section of
-- every page on how to enhance it.
--
-- WHY A TABLE AND NOT A REPORT. A recommendation delivered in chat is read once and lost; the
-- owner cannot work a queue that scrolls away. This is the durable home: one row per section
-- per page, carrying the observation, the recommendation, its impact and effort, and his
-- decision. It accumulates as the build proceeds and becomes the fine-tuning worklist he asked
-- for ("then we will fine tune all"). Eventually it renders on the OS itself.
--
-- SEPARATION FROM DEFECTS: a DEFECT (something broken) goes to watchdog_findings and blocks
-- acceptance. An ENHANCEMENT (something that works but could be better) lands here and never
-- blocks a delivery. Conflating them is how a fix queue turns into a wish list nobody works.
--
-- UNDO: drop view v_enhancements_for_owner; drop table page_enhancement.

create table if not exists page_enhancement (
  id            bigserial primary key,
  page          text not null,
  section       text not null,
  kind          text not null check (kind in ('wiring','dynamic','design','fortify','capability','performance')),
  observation   text not null check (length(btrim(observation)) >= 20),
  recommendation text not null check (length(btrim(recommendation)) >= 20),
  why_it_matters text,
  impact        text not null check (impact in ('high','medium','low')),
  effort        text not null check (effort in ('small','medium','large')),
  status        text not null default 'proposed'
                check (status in ('proposed','approved','rejected','done','deferred')),
  owner_note    text,
  raised_by     text not null,
  raised_at     timestamptz not null default now(),
  decided_at    timestamptz,
  constraint decision_needs_a_note check (status not in ('rejected','deferred') or coalesce(btrim(owner_note),'') <> '')
);

alter table page_enhancement enable row level security;
drop policy if exists pe_read  on page_enhancement;
drop policy if exists pe_write on page_enhancement;
create policy pe_read  on page_enhancement for select to authenticated using (true);
create policy pe_write on page_enhancement for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

comment on table page_enhancement is
 'The fine-tuning queue: one row per section per page, raised by the watchguard agent as it '
 'shadows the build. An ENHANCEMENT is something that WORKS but could be better - it never '
 'blocks a delivery. Something BROKEN is a defect and goes to watchdog_findings instead; '
 'conflating the two turns a fix queue into a wish list nobody works. Sorted for the owner by '
 'impact against effort, so the cheap high-impact wins surface first.';

comment on column page_enhancement.kind is
 'wiring = connected but incompletely · dynamic = works yet carries a hardcoded or static '
 'element · design = renders correctly but breaks the DDC discipline · fortify = works and '
 'lacks a guard · capability = the section could do more for the manager who uses it · '
 'performance = correct but slow.';

create or replace view public.v_enhancements_for_owner as
select page, section, kind, impact, effort,
       observation, recommendation, why_it_matters, raised_by, raised_at, status, owner_note,
       case when impact='high' and effort='small' then 1
            when impact='high' and effort='medium' then 2
            when impact='medium' and effort='small' then 3
            when impact='high' then 4
            when impact='medium' then 5
            else 6 end as work_order
from page_enhancement
where status = 'proposed'
order by work_order, page, section;

comment on view public.v_enhancements_for_owner is
 'What the owner reads: open enhancement recommendations ranked cheap-and-valuable first '
 '(high impact + small effort at the top). Decided rows drop out. This is the "then we will '
 'fine tune all" list, built continuously while the pages are being built rather than '
 'reconstructed from memory afterwards.';;
