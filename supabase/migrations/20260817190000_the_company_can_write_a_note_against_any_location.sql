/* The company can write a note against any location.
 *
 * Owner, 17 Aug 2026: "these are our locations allow us the company to add notes to each"
 * — sent alongside the Metrc Locations export for MC281714.
 *
 * VERIFIED FIRST. The export lists 21 locations for MC281714 and our mirror holds
 * exactly those 21 by name, plus 17 for MP281909: 38 in total, every one with a
 * distinct metrc_id. So the note can hang off metrc_id rather than a name.
 *
 * WHY THE NOTE DOES NOT GO ON metrc_locations
 * -------------------------------------------
 * metrc_locations is a Metrc mirror and Metrc is read-only, forever. A note written
 * into a mirror row is destroyed the next time the sync runs, silently, and the
 * person who wrote it has no way to know. Every note therefore lives in its own
 * table and the mirror is never written to.
 *
 * WHY THERE IS NO FOREIGN KEY
 * ---------------------------
 * Metrc can retire a location. A cascade would delete the notes with it, and a
 * restrict would break the sync. Neither is acceptable: the note is our record of
 * what happened in that room, and it must outlive the room. So the link is a plain
 * metrc_location_id, and location_name_when_written preserves what the author was
 * actually looking at. v_location_notes shows the live name where the location still
 * exists and says so plainly where it does not, rather than rendering a blank.
 *
 * MANY NOTES PER LOCATION, NOT ONE FIELD
 * --------------------------------------
 * A single overwritable note field loses everything but the last edit. These are
 * operational records — what was cleaned, what failed, what was moved and why — so
 * they accumulate. Nothing is ever omitted or shortened.
 */

create table if not exists public.location_note (
  id                          bigint generated always as identity primary key,
  metrc_location_id           bigint not null,
  license                     text   not null,
  location_name_when_written  text   not null,
  note                        text   not null,
  category                    text,
  author_user_id              uuid   not null default auth.uid(),
  author_name                 text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint note_is_not_blank check (btrim(note) <> ''),
  constraint category_is_known check (
    category is null or category in
      ('maintenance','cleaning','compliance','equipment','safety','environment','general'))
);

create index if not exists location_note_by_location on public.location_note (metrc_location_id, created_at desc);
create index if not exists location_note_by_author   on public.location_note (author_user_id, created_at desc);

comment on table public.location_note is
  'Free-text notes the company writes against a Metrc location. Deliberately NOT a '
  'column on metrc_locations: that is a read-only Metrc mirror and a resync would '
  'destroy the note silently. No foreign key either, so a note outlives a location '
  'Metrc retires. Owner request, 17 Aug 2026. Agent I.';

comment on column public.location_note.location_name_when_written is
  'The location name as it read when the note was written. Metrc can rename a room; '
  'without this a two-year-old note would appear to describe somewhere it never did.';

comment on column public.location_note.metrc_location_id is
  'metrc_locations.metrc_id. Verified unique across all 38 locations on 17 Aug 2026.';

/* ── Who can do what ─────────────────────────────────────────────────────────── */
alter table public.location_note enable row level security;

drop policy if exists ln_read on public.location_note;
create policy ln_read on public.location_note
  for select to authenticated using (true);

/* Anyone signed in may write a note — this is the company's log, not an admin one.
   default auth.uid() plus this check means an author cannot be forged. */
drop policy if exists ln_insert on public.location_note;
create policy ln_insert on public.location_note
  for insert to authenticated with check (author_user_id = auth.uid());

drop policy if exists ln_update on public.location_note;
create policy ln_update on public.location_note
  for update to authenticated
  using (author_user_id = auth.uid() or public.f_caller_is_admin())
  with check (author_user_id = auth.uid() or public.f_caller_is_admin());

/* Deletion is an admin act and is logged by the ordinary audit path. An operator
   correcting their own typo edits; removing a record entirely is a different thing. */
drop policy if exists ln_delete on public.location_note;
create policy ln_delete on public.location_note
  for delete to authenticated using (public.f_caller_is_admin());

drop trigger if exists location_note_touch on public.location_note;
create trigger location_note_touch before update on public.location_note
  for each row execute function public.tg_touch_updated_at();

/* ── Every location, with its notes — including the ones with none ───────────── */
create or replace view public.v_location_notes as
select
  l.metrc_id                             as metrc_location_id,
  l.license,
  l.name                                 as location,
  l.location_type,
  count(n.id)                            as note_count,
  max(n.created_at)                      as last_note_at,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', n.id, 'note', n.note, 'category', n.category,
        'author', coalesce(n.author_name, 'not recorded'),
        'written_at', n.created_at,
        'renamed_since',
          case when n.location_name_when_written is distinct from l.name
               then n.location_name_when_written end)
      order by n.created_at desc)
      filter (where n.id is not null),
    '[]'::jsonb)                         as notes
from public.metrc_locations l
left join public.location_note n on n.metrc_location_id = l.metrc_id
group by l.metrc_id, l.license, l.name, l.location_type;

comment on view public.v_location_notes is
  'All 38 Metrc locations with their notes attached. A location with no notes still '
  'appears, with note_count 0 — a location missing from a list reads as "no such '
  'room" rather than "nothing written yet". Agent I, 17 Aug 2026.';

/* Notes whose location Metrc no longer serves. Not an error — a retired room still
   has a history — but it must be visible rather than silently dropped by the join
   above, which is exactly how a record disappears without anyone deciding it should. */
create or replace view public.v_location_notes_orphaned as
select n.id, n.metrc_location_id, n.license,
       n.location_name_when_written as location_as_written,
       n.note, n.category, n.author_name, n.created_at,
       'This location is no longer served by Metrc for this licence. The note is kept.'::text as why_here
from public.location_note n
where not exists (
  select 1 from public.metrc_locations l where l.metrc_id = n.metrc_location_id);

comment on view public.v_location_notes_orphaned is
  'Notes against a location Metrc has since retired. v_location_notes cannot show '
  'them, so they are surfaced here rather than lost. Agent I, 17 Aug 2026.';

grant select on public.v_location_notes, public.v_location_notes_orphaned to tg_desktop_reader;
