/* Every report column gets a destination, or a stated reason it has none.
 *
 * Owner, 17 Aug 2026: "you need to train agents an OS exacty how to use every peice
 * of data from these reports into this os" and "every piece of data available via
 * metrc sync must be used in this OS".
 *
 * metrc_report_catalog says WHICH report to pull and what trap it carries. It does
 * not say what to do with a single column once the file is open, so every agent
 * re-derives the mapping by eye and they disagree. That is exactly how 14,822
 * packages lost their parent: the loader wrote
 * metrc_rpt_package_transfers.source_harvest and nobody recorded that
 * metrc_packages.raw->>'SourceHarvestNames' was its real destination — the place the
 * ~30 downstream views actually read.
 *
 * A column with no destination is not allowed to be silent here. It gets a row with
 * target_table null and a why_unmapped that a human wrote, and the check constraint
 * refuses anything else. A silent drop is how data disappears without anyone
 * deciding it should.
 */

create table if not exists public.metrc_report_field_map (
  report_key       text not null references public.metrc_report_catalog(report_key) on update cascade,
  source_column    text not null,
  target_table     text,
  target_column    text,
  target_json_key  text,
  is_lineage       boolean not null default false,
  transform        text,
  why_unmapped     text,
  notes            text,
  added_by         text not null default 'Agent I',
  added_at         timestamptz not null default now(),
  primary key (report_key, source_column),
  constraint mapped_or_explained check (
    target_table is not null or why_unmapped is not null)
);

comment on table public.metrc_report_field_map is
  'One row per column of every catalogued Metrc report, naming exactly where that '
  'column lands in this OS. A column with no destination must carry why_unmapped — '
  'the check constraint refuses a silent drop. Agents read this instead of guessing. '
  'Owner instruction, 17 Aug 2026. Agent I.';

comment on column public.metrc_report_field_map.target_json_key is
  'For mirror tables the destination is often a key inside raw jsonb rather than a '
  'column. Naming it here is what was missing when 14,822 packages lost their parent.';

comment on column public.metrc_report_field_map.is_lineage is
  'True where the column carries seed-to-sale parentage. These are the columns that '
  'break the legal chain when dropped, and Metrc omits them from default column sets.';

alter table public.metrc_report_field_map enable row level security;

drop policy if exists mrfm_read on public.metrc_report_field_map;
create policy mrfm_read on public.metrc_report_field_map
  for select to authenticated using (true);

drop policy if exists mrfm_write on public.metrc_report_field_map;
create policy mrfm_write on public.metrc_report_field_map
  for all to authenticated
  using (public.f_caller_is_admin()) with check (public.f_caller_is_admin());

grant select on public.metrc_report_field_map to tg_desktop_reader;
