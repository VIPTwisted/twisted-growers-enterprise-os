-- Agent: M — the owner's production cost calculator, mirrored as NAMED FIGURES with their
-- inputs, not as rows. Owner: "SYNC THE CALCULATOR SO AS WE CHANGE THINGS IN FUTURE OUR COSTS
-- WILL UPDATE IN OUR OS." Re-reading the sheet upserts on figure_key, so a changed assumption
-- flows through rather than creating a second competing number.

create table if not exists manufacturing_cost_figure (
  figure_key       text primary key,
  block            text not null,
  label            text not null,
  figure_value     numeric not null,
  unit             text not null,
  basis            text,
  evidence_status  text not null default 'owner_set'
                     check (evidence_status in ('owner_set','measured','derived','confirmed')),
  is_owner_editable boolean not null default false,
  includes_tariff  boolean not null default false,
  tariff_note      text,
  sheet_key        text not null default 'manufacturing_production_calculator',
  source_key       text,
  import_run_id    uuid,
  source_cell_label text,
  as_of            date,
  note             text,
  updated_at       timestamptz not null default now()
);

comment on table manufacturing_cost_figure is
'THE PRODUCTION COST CALCULATOR, mirrored read-only from the owner''s "manufacturing Production worksheet". It is a CALCULATOR, not a table - several independent blocks sit side by side on one wide sheet with labels sharing rows with values - so it is modelled as named output figures carrying their unit and their basis, never as spreadsheet rows. Owner ruling: vape and pre-roll costs MUST be pulled from here and never double-dipped against the concentrate material they consume. Re-import upserts on figure_key so a changed assumption updates the figure in place.';

comment on column manufacturing_cost_figure.evidence_status is
'owner_set = an assumption the owner tunes in the sheet, NOT a measurement. measured = observed from production. derived = computed by the sheet from other cells. confirmed = independently verified against a second source. The distinction matters because an assumption presented as a measurement is how a costing gets defended in an examination it cannot survive.';
comment on column manufacturing_cost_figure.is_owner_editable is
'TRUE for cells the sheet marks "Can Edit" or highlights as adjustable. WARNING measured 12 Aug 2026: only the two cells marked with the literal text "Can Edit" can be detected. The sheet also says "*Adjust Highlighted Values to Determine Infusion Costs" and colour highlighting is NOT carried by any text rendering of the file, so this flag UNDERSTATES how many cells are assumptions. Do not read FALSE as proof a figure is measured.';
comment on column manufacturing_cost_figure.includes_tariff is
'TRUE where the sheet states the price already carries the 22.5% tariff charge dated 2/8/2026. Never add tariff on top of a figure flagged here.';

alter table manufacturing_cost_figure enable row level security;
create policy mcf_read  on manufacturing_cost_figure for select to authenticated using (true);
create policy mcf_write on manufacturing_cost_figure for all    to authenticated using (f_caller_is_admin()) with check (f_caller_is_admin());

insert into duplicate_key (table_name, key_columns, why) values
('manufacturing_cost_figure', array['figure_key'],
 'One row per NAMED COST FIGURE the calculator publishes. Keyed on the figure, not on a sheet cell reference, because the owner rearranges the grid and a cell address is not a stable identity - and because the whole point is that re-reading the sheet UPDATES the cost rather than adding a second one.')
on conflict (table_name) do update set key_columns = excluded.key_columns, why = excluded.why;;
