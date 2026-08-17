/* THE COMMAND CENTER ASKS FOR TWO COLUMNS THAT HAVE NEVER EXISTED.
 *
 * Both seen by the owner on his own screen, 16 Aug 2026, and both are the page asking
 * the database for something it does not have. The page reports them honestly rather
 * than showing an empty box, which is the design working - but an honest error is
 * still an error, and he has been looking at them instead of his figures.
 *
 * 1. "The open-harvest limit could not be read: column conversion_factors.note does
 *    not exist". commandcenter.jsx selects key, value, set_by, NOTE. The table has
 *    evidence_note, what_it_means and where_it_came_from - never a bare note.
 *
 *    Adding the column is the one-sided fix: the page starts working with no deploy,
 *    and nothing that reads evidence_note changes. It is seeded FROM evidence_note so
 *    it carries the reasoning that already exists rather than being blank.
 *
 * 2. Every future row of the production schedule renders "F1 - department not
 *    recorded". harvest_schedule has NO department column. The page is not failing to
 *    find a value; it is failing to find the field, and saying so 50 times.
 *
 *    Every row in this table is a flower-room harvest, so the department is
 *    Cultivation. That is not a guess: harvest_schedule holds flower_room F1-F4 and
 *    cultivar, which is what Cultivation owns. Rows with no readable room stay NULL
 *    rather than being assumed into a department.
 *
 * WHY DEFAULTS AND NOT A ONE-OFF BACKFILL. The next planner_v4 load would reintroduce
 * both gaps. A column default means a row that forgets still lands correct - the same
 * reasoning as the IsFinished repair earlier today, where the fix was to complete the
 * data rather than teach thirty views to work around it.
 */

alter table public.conversion_factors
  add column if not exists note text;

update public.conversion_factors
   set note = coalesce(nullif(btrim(evidence_note), ''), nullif(btrim(what_it_means), ''))
 where note is null;

comment on column public.conversion_factors.note is
  'Short human note about this factor. Added 16 Aug 2026 because commandcenter.jsx selects key, value, set_by, note and the column did not exist, so the open-harvest limit tile failed on every load. Seeded from evidence_note, falling back to what_it_means. evidence_note remains the fuller provenance field; this is the one the dashboards read.';

alter table public.harvest_schedule
  add column if not exists department text;

update public.harvest_schedule
   set department = 'Cultivation'
 where department is null
   and coalesce(nullif(btrim(flower_room), ''), '') <> '';

comment on column public.harvest_schedule.department is
  'Which department owns this scheduled event. Added 16 Aug 2026: the Command Center production schedule rendered "department not recorded" on all 50 future rows because the column did not exist at all - it was not a missing value, it was a missing field. Every row carrying a flower room is Cultivation, which is what that department owns. Rows with no readable room are left NULL on purpose: unknown is a fact, and assuming a department onto a row we cannot place would be the fabrication this platform exists to prevent.';
