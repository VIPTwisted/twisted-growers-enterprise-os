/* The TG Workspace board is a work queue, not a month — 28 Aug 2026,
 * docs/REMAINING_PAGES.md.
 *
 * tg_workspace held NO default_range, so f_date_default fell past nav_registry to
 * the company fallback and resolved 'this_month'. Wiring the board to the bus is
 * what made that visible, and it would have reached a user as a board that had
 * quietly lost most of its work:
 *
 *   Every task raised before the 1st and STILL OPEN would have been hidden, with
 *   nothing on screen saying a window was applied. A task board exists to show
 *   what is outstanding, and the oldest outstanding item is the one that matters
 *   most — it is the one that has been ignored the longest. A month frame hides
 *   exactly the rows the board is for.
 *
 * So 'all' with range_kind 'snapshot', the same answer already reached for the
 * onboarding console and the employee file for the same reason: what is
 * outstanding is a standing fact, not something that happened on a date.
 *
 * The control stays on the page and still answers a period question when one is
 * asked — "what was raised this month" is real, it is just never the opening
 * question on a queue.
 *
 * NOTE ON range_kind. It moves from 'activity' to 'snapshot' because that is what
 * the data is: an open task is a position. range_kind is what makes a page
 * disclose rather than pretend, so leaving it as 'activity' would have the board
 * claim a flow it does not have.
 */

update public.nav_registry
   set default_range = 'all',
       range_kind    = 'snapshot'
 where view_key = 'tg_workspace'
   and (default_range is distinct from 'all' or range_kind is distinct from 'snapshot');

do $$
declare got text;
begin
  select coalesce(default_range, 'NULL') || '/' || coalesce(range_kind, 'NULL')
    into got
    from public.nav_registry
   where view_key = 'tg_workspace';

  if got is null then
    raise exception
      'nav_registry has no row for tg_workspace at all. The board renders from a '
      'nav entry, so this is a missing page rather than a missing frame.';
  end if;

  if got is distinct from 'all/snapshot' then
    raise exception
      'tg_workspace did not take the queue frame: it reads %. Find out what wrote '
      'it rather than assuming this migration applied.', got;
  end if;

  if not exists (select 1 from public.f_date_presets() where preset_key = 'all') then
    raise exception 'f_date_presets does not offer the preset ''all''.';
  end if;
end $$;
