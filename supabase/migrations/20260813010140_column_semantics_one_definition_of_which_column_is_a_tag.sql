-- Agent I, 12 Aug 2026. DBI-093.
--
-- §7 of the mandate: "Filters are DATA, never JSX. A hard-coded filter list is a filter that
-- goes stale the day a column is renamed, and nobody finds out."
--
-- The widget canvas froze two lists into wcanvas-kinds.jsx:108-109 - which column names mean
-- "this is a package tag" and which mean "this is a room". It needed them to know when to render
-- a tag as a drill link and when to qualify a room with its department.
--
-- IT IS NOT ALONE. App.jsx carries the SAME KIND OF LIST in nine places (lines 690, 1165, 2696,
-- 7205-7213), which is why the ratchet already stood at 17 before tonight. Eleven definitions of
-- "which column holds a tag". Rename one column in Metrc and ten of them are silently wrong -
-- exactly the failure `hold_the_ddc_discipline` names: count the definitions of any primitive,
-- more than one is the defect.
--
-- This is the ONE definition. Every surface joins it rather than carrying its own copy.
--
-- WHY IT IS DATA AND NOT CODE, concretely: `mirror_room` and `prefill_metrc_tag` exist because
-- of how two spreadsheets are shaped. When those sheets change, this is a row edit by a person
-- who noticed, not a front-end release.
--
-- UNDO: drop view v_column_semantics; drop table column_semantics.

create table if not exists column_semantics (
  column_name text primary key,
  means       text not null check (means in ('package_tag','room','licence','strain','manifest')),
  why         text not null,
  added_by    text not null default 'Agent I',
  added_at    timestamptz not null default now()
);

alter table column_semantics enable row level security;
drop policy if exists cs_read  on column_semantics;
drop policy if exists cs_write on column_semantics;
create policy cs_read  on column_semantics for select to authenticated using (true);
create policy cs_write on column_semantics for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

comment on table column_semantics is
 'Which COLUMN NAMES carry which meaning, so a surface can tell that `final_metrc_tag` is a '
 'package tag and `mirror_room` is a room without hardcoding a list. Built 12 Aug 2026 because '
 'eleven separate copies of these lists existed across the front end - one in the widget canvas '
 'and nine in App.jsx - and a column renamed in Metrc would have silently broken ten of them.';

insert into column_semantics (column_name, means, why) values
 ('package_tag',       'package_tag', 'The canonical name. Metrc''s own.'),
 ('tag',               'package_tag', 'Short form used by the mirror tables.'),
 ('metrc_tag',         'package_tag', 'Used by the spreadsheet imports.'),
 ('final_metrc_tag',   'package_tag', 'Finished-goods sheet: the tag of the packaged product.'),
 ('bulk_metrc_tag',    'package_tag', 'Finished-goods sheet: the tag of the bulk material it came from.'),
 ('prefill_metrc_tag', 'package_tag', 'Finished-goods sheet: the tag at the pre-fill stage.'),
 ('plant_tag',         'package_tag', 'A plant''s own tag. Same shape, same 24 characters, same drill.'),
 ('room',              'room',        'The canonical name.'),
 ('current_room',      'room',        'Where the package is now, as opposed to where it was.'),
 ('mirror_room',       'room',        'The room as the Metrc mirror reports it, before aliasing.'),
 ('flower_room',       'room',        'harvest_schedule names the flower room this way.'),
 ('drying_room',       'room',        'Where a harvest dried. A room, and must be qualified like one.'),
 ('metrc_room_name',   'room',        'Metrc''s own name for the room — see room_alias.'),
 ('licence',           'licence',     'Ours: MC281714 or MP281909.'),
 ('license',           'licence',     'American spelling, used by the Metrc payload.'),
 ('destination_licence','licence',    'The counterparty on an outbound manifest.'),
 ('manifest_number',   'manifest',    'The state transport record. Always openable.'),
 ('inbound_manifest',  'manifest',    'How material arrived.'),
 ('outbound_manifest', 'manifest',    'How it left.'),
 ('strain',            'strain',      'Fold accents and punctuation before comparing — Piña vs Pina.'),
 ('cultivar',          'strain',      'harvest_schedule''s word for strain.')
on conflict (column_name) do nothing;

create or replace view public.v_column_semantics as
select means, array_agg(column_name order by column_name) as column_names
from column_semantics group by means;

comment on view public.v_column_semantics is
 'The column-name lists, one array per meaning, ready for a front end to read once at load and '
 'stop carrying its own copy. Replaces TAG_COLS and ROOM_COLS in wcanvas-kinds.jsx and is the '
 'intended replacement for the nine equivalents still frozen into App.jsx.';;
