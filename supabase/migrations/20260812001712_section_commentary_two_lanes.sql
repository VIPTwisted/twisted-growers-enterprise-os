-- Agent I (Database COO), 12 Aug 2026. Filed for review as DBI-028 (reviewers V, X, W).
-- Owner: "how can the CEO populate comments like this on dashboards" - referencing the dry-time
-- narrative ("47 of 51 dry harvests since February missed the 14-day window...").
--
-- TWO LANES, DELIBERATELY DIFFERENT:
--
--   PLATFORM NARRATIVE (v_section_narrative) - sentences COMPOSED IN SQL from the canonical
--   views, numbers pulled live at read time. Prose is never stored with numbers inside it,
--   because stored prose goes stale silently - the exact failure class of the six frozen days.
--   When the 48th harvest misses the window the sentence rewrites itself.
--
--   CEO NOTES (dashboard_commentary) - hand-written, attributed, timestamped, pinned to a
--   section. These FREEZE correctly: they are opinion with a date, and the visible date is what
--   keeps an old note honest. Requires an author; anonymous commentary is banned (A2 - every
--   figure carries its provenance; so does every opinion).
--
-- This is NOT business data entry - the no-manual-edits rule covers inventory figures, which
-- stay spreadsheet-only. Commentary is judgement, signed.
--
-- UNDO: drop view v_section_narrative; drop table dashboard_commentary;

create table if not exists dashboard_commentary (
  id           bigserial primary key,
  page         text not null,
  section_key  text not null,
  author       text not null,
  author_role  text,
  body         text not null check (length(btrim(body)) >= 10),
  pinned       boolean not null default true,
  written_at   timestamptz not null default now(),
  retired_at   timestamptz,
  retired_by   text
);

alter table dashboard_commentary enable row level security;

comment on table dashboard_commentary is
 'Hand-written CEO/executive notes pinned to dashboard sections. Attributed and timestamped - '
 'the visible date is what keeps an old opinion honest. Never deleted (all data kept forever): '
 'retiring sets retired_at. Distinct from v_section_narrative, which the platform writes itself '
 'from live data. Rendered with byline: author, role, written_at.';

create index if not exists dc_by_section on dashboard_commentary (page, section_key, pinned, written_at desc);

create or replace view public.v_section_narrative as
-- ── Dry-time discipline: the paragraph the owner asked to see on the page ──
select 'cultivation'::text as page, 'dry_time'::text as section_key,
       (select format(
         '%s of %s dry harvests since February missed the %s-day window. Every day past %s burns saleable weight — the owner''s own rule, zero late tolerance. The average this month is %s days to first package against a target of %s–%s. Fresh-frozen harvests are excluded: they package in about two days by design.',
         sum(dried_too_long) + sum(pulled_too_fast),
         sum(harvests_scored),
         max(window_to_days), max(window_to_days),
         (select avg_dry_days from v_dry_time_discipline order by month desc limit 1),
         max(window_from_days), max(window_to_days))
        from v_dry_time_discipline where month >= '2026-02') as narrative,
       'bad'::text as tone, 'dry_time_discipline'::text as drill, now() as computed_at
union all
-- ── Third-party position: the restatement, stated ──
select 'finance', 'third_party',
       (select format(
         'Third-party spend restated to $%s on 11 Aug 2026 after the owner''s Eagle Eyes ruling was enforced — $374,346 of it was our own material returning from a 3PL warehouse, booked as purchases by a tile that read who SHIPPED rather than who MADE. The figure is declared transfer price, not evidence of cash paid: %s lb of third-party material has no price in Metrc at all.',
         to_char(901941, 'FM9,999,999'),
         (select to_char(round(sum(lb_received) - sum(lb_received) filter (where lb_sold is not null or made_lb is not null), 0), 'FM9,999') from v_third_party_forensic))
       ), 'info', 'third_party_forensic', now()
union all
-- ── The findings queue: causes, not counts ──
select 'command', 'findings',
       (select format(
         '%s findings are open, but they come from only %s distinct causes — and %s causes carry over 80%% of the queue. The list is not cleaned by working findings top-down; it is cleaned by fixing causes, and each fix retires dozens at once. Largest single cause: the missing allotment approval workflow, %s findings on its own.',
         count(*), count(distinct pattern_key), 6,
         (select findings_that_clear_if_fixed from v_finding_causes order by findings_that_clear_if_fixed desc limit 1))
        from v_findings where resolved_at is null and not coalesce(is_duplicate, false)),
       'bad', 'finding_causes', now()
union all
-- ── Phantom water: the April harvests ──
select 'cultivation', 'moisture',
       (select format(
         'Two harvests cut 7 April are still open in Metrc %s days later, carrying 418.7 lb of water that evaporated months ago. They are part of %s open harvests holding %s lb of unrecorded moisture. Metrc is the legal record: until a person closes these out, the physical count can never reconcile to the state''s books.',
         (current_date - date '2026-04-07'),
         (select count(*) from v_moisture_loss_register where needs_recording and phantom_lb > 0),
         (select to_char(round(sum(phantom_lb),1),'FM9,999.9') from v_moisture_loss_register where needs_recording and phantom_lb > 0))
       ), 'bad', 'moisture_loss_register', now();

comment on view public.v_section_narrative is
 'Platform-written section commentary - the CEO-style paragraph, composed in SQL so every number '
 'is pulled LIVE at read time. Prose is never stored with numbers inside it; stored prose goes '
 'stale silently, which is the six-frozen-days failure class. Render distinct from hand-written '
 'dashboard_commentary: byline "Platform · computed now" versus the author''s name and date. '
 'Every narrative carries a drill key - a paragraph is a claim like any tile (C1).';;
