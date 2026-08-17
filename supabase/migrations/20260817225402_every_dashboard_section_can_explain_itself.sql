/* Every dashboard section can explain itself.
 *
 * Owner, 17 Aug 2026: "you need to add a very small question mark so users understand
 * exactly how to read each section on the dashboards all of them."
 *
 * The prompt for it was a real misreading: the Command page says "23 open harvests" and
 * the owner reasonably read that as 23 takedowns, against a cadence of two pulls a month.
 * It is not. Metrc opens one harvest batch PER STRAIN and keeps it open until every gram
 * is packaged out, so eleven pull events had produced twenty-eight open batches. The
 * number was right, the label was not enough, and the owner had to ask.
 *
 * HELP IS DATA, NOT MARKUP.
 * Written into each page's JSX it drifts: the same tile ends up explained two ways on
 * two pages, and correcting one leaves the other wrong. Held here, every surface reads
 * one row and a correction lands everywhere at once. This is the same rule as share
 * primitives, never layouts — one definition of what a figure means.
 *
 * WHAT A GOOD ENTRY CONTAINS. Not a restatement of the label. It answers: what is
 * actually counted, what is NOT counted, and the misreading that is easy to make. The
 * third is the one that matters — "23 open harvests" needed someone to say "this is not
 * 23 takedowns" before it made sense.
 */

create table if not exists public.section_help (
  page          text not null,
  section_key   text not null,
  title         text not null,
  what_it_shows text not null,
  how_to_read   text not null,
  common_misreading text,
  source_note   text,
  updated_by    text not null default 'Agent I',
  updated_at    timestamptz not null default now(),
  primary key (page, section_key),
  constraint help_is_not_a_restatement check (length(btrim(how_to_read)) >= 40)
);

comment on table public.section_help is
  'One row per dashboard section, holding the ⓘ text. Help is DATA so a correction lands '
  'on every surface at once rather than drifting between pages. how_to_read must be at '
  'least 40 characters — a help bubble that restates the label teaches nobody anything. '
  'Owner request 17 Aug 2026. Agent I.';

comment on column public.section_help.common_misreading is
  'The wrong reading someone will actually make. This is the field that earns the ⓘ: '
  '"23 open harvests" was read as 23 takedowns against a cadence of two a month, and it '
  'took a measurement to explain that Metrc opens one batch per strain.';

alter table public.section_help enable row level security;
drop policy if exists sh_read on public.section_help;
create policy sh_read on public.section_help for select to authenticated using (true);
drop policy if exists sh_write on public.section_help;
create policy sh_write on public.section_help for all to authenticated
  using ((select public.f_caller_is_admin())) with check ((select public.f_caller_is_admin()));
grant select on public.section_help to tg_desktop_reader;

insert into public.section_help
  (page, section_key, title, what_it_shows, how_to_read, common_misreading, source_note) values

('command','key_figures','Key figures',
 'Eight position figures for the whole operation, recomputed on a schedule rather than on page load.',
 'Every one of these is a POSITION — what is true right now — not an amount that happened over a period. '
 || 'That is why they do not change when you pick a date range: "flower on hand between January and August" '
 || 'is not a number. The date chips govern the sections below that count events.',
 'Reading these as period totals. They are as-of figures and the timestamp top right tells you as of when.',
 'mv_department_dashboard, refreshed every 10 minutes and healed within 45 if that fails.'),

('command','open_harvests','Open harvests',
 'Harvest batches Metrc still has open, with their combined weight.',
 'Metrc opens ONE BATCH PER STRAIN and keeps it open until every gram has been packaged out and someone '
 || 'marks it Finished. One takedown of a six-strain room therefore creates six open batches. Measured '
 || '17 Aug 2026: 28 open batches from 11 pull events since April — a cadence of about two pulls a month, '
 || 'exactly as intended.',
 'Reading the count as the number of takedowns in progress. It is not. 28 open batches came from 11 pulls, '
 || 'and 19 of them are from five OLD pulls that were never closed out — including one from 7 April still '
 || 'holding weight 132 days later.',
 'metrc_harvests where source_state = active. Weights arrive from Metrc in GRAMS and are converted.'),

('command','harvests_open_too_long','Harvests open too long',
 'Open harvest batches past the day limit set in the cultivation calendar.',
 'This is the actionable half of the open-harvest count. A batch past the limit is one nobody has finished '
 || 'out in Metrc, and its remaining weight still counts as on-hand until they do.',
 'Assuming the plants are still hanging. They are not — the room has usually been replanted. What is open '
 || 'is the RECORD, not the crop.',
 'metrc_harvests against the 28-day limit from the 2026 calendar.'),

('command','seed_to_sale','Seed to sale — where everything is right now',
 'Every plant and package placed in the stage it currently occupies, from growing through to in transit.',
 'A census across stages, taken now. The stages are exclusive: nothing is counted twice. The bottleneck chip '
 || 'names the stage holding the most weight for the longest, which is where to look first.',
 'Treating the oldest-days figure as an average. It is the single oldest item in that stage, not the typical one.',
 'mv_flow_stages, refreshed every 10 minutes.'),

('command','in_plain_words','In plain words',
 'Narrative lanes: the period story for the range you picked, the platform-wide story, and any signed notes.',
 'The PERIOD lane is the one that honours your date chips — it compares the window you chose against the '
 || 'window before it. The PLATFORM lane is computed live over everything and ignores the range by design.',
 'Expecting the platform lane to move when you change the date range. It is deliberately all-time; the label '
 || 'under each lane says which it is.',
 'tg_period_narrative for the period lane, v_section_narrative for the platform lane.'),

('command','global_management','Global management — every department, one view',
 'Open findings, tasks and stock rolled up by department.',
 'One row per department, so a department with nothing open still appears with zeros. A missing department '
 || 'means no such department, not nothing to report.',
 'Reading a zero as "not measured". Zero is a measurement here; an absent row is not.',
 'v_global_management.'),

('command','data_age','The data-age stamp',
 'How old the computed figures are, shown top right of the page.',
 'This is the age of the DATA, not of the page load. Refreshing the browser does not change it. It moves '
 || 'when the scheduled refresh runs — every 10 minutes, with a watcher that heals it within 45 minutes if '
 || 'that fails and raises a finding if it cannot.',
 'Refreshing the page to make it current. The number comes from the last computation, not from this visit.',
 'mv_department_dashboard.computed_at, watched by v_matview_health.')

on conflict (page, section_key) do update
  set title = excluded.title, what_it_shows = excluded.what_it_shows,
      how_to_read = excluded.how_to_read, common_misreading = excluded.common_misreading,
      source_note = excluded.source_note, updated_at = now();

create or replace view public.v_section_help_coverage as
select h.page,
       count(*) as sections_explained,
       count(*) filter (where coalesce(btrim(h.common_misreading),'') = '') as no_misreading_recorded,
       max(h.updated_at) as last_updated
from public.section_help h
group by h.page;

comment on view public.v_section_help_coverage is
  'How many sections on each page carry help, and how many are missing the '
  'common_misreading field — the one that actually earns the question mark. Agent I.';

grant select on public.v_section_help_coverage to tg_desktop_reader;;
