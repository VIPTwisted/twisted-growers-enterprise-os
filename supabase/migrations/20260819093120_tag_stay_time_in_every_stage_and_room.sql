/* TAG_LIFECYCLE — "how long did this tag spend in veg / in Room 3" — owner
 * architecture, 19 Aug 2026, section 2.
 *
 * His spec calls for a tag_lifecycle table: one row per stage/room stay with
 * start, end and duration. It is DERIVED here rather than hand-maintained,
 * because a stored stay table has to be written correctly by every path that
 * ever moves a tag, and the day it is missed it lies silently. tag_event
 * already records every movement with its timestamp; consecutive events give
 * the stay boundaries exactly, and the derivation cannot drift from the
 * events it reads.
 *
 * NAME: v_tag_stay, not v_tag_lifecycle — that name is taken by the six-stage
 * seed-to-sale record, and two different things must never share one name.
 *
 * The open stay (the tag's current room) has no end_timestamp and its
 * duration runs to now, which is exactly "time in current location" for the
 * tag list his drill path specifies at step 2. */

create or replace view public.v_tag_stay as
with ev as (
  select e.tag, e.event_at, e.event_type, e.stage, e.location,
         lead(e.event_at) over (partition by e.tag order by e.event_at, e.id) as next_at,
         lead(e.location) over (partition by e.tag order by e.event_at, e.id) as next_location,
         row_number() over (partition by e.tag order by e.event_at, e.id)     as seq
  from tag_event e
),
stays as (
  select tag, seq, stage, location, event_type,
         event_at as start_timestamp,
         next_at  as end_timestamp
  from ev
  /* a stay begins at any event that establishes where the tag is */
  where location is not null
)
select s.tag,
       s.seq                                                            as stay_no,
       s.stage,
       s.location                                                       as room,
       s.event_type                                                     as began_with,
       s.start_timestamp,
       s.end_timestamp,
       (s.end_timestamp is null)                                        as is_current,
       round(extract(epoch from (coalesce(s.end_timestamp, now()) - s.start_timestamp))/3600.0, 1) as duration_hours,
       round(extract(epoch from (coalesce(s.end_timestamp, now()) - s.start_timestamp))/86400.0, 1) as duration_days,
       td.coa_certificate_id, td.coa_document_link,
       td.manifest_no, td.manifest_document_link,
       td.apex_invoice_no, td.apex_invoice_usd
from stays s
left join mv_tag_documents td on td.tag = s.tag;

comment on view public.v_tag_stay is
  'TAG LIFECYCLE per the owner architecture (19 Aug 2026, section 2): one row per stage/room stay '
  'with start, end and duration — "how long in veg", "how long in Room 3", "how long between '
  'harvest and COA". DERIVED from tag_event rather than stored, so it can never drift from the '
  'events it reads; the open stay (no end_timestamp) is the tag''s current location and its '
  'duration runs to now. Carries the document trinity so any stay row drills straight to its '
  'papers. Named v_tag_stay because v_tag_lifecycle is the six-stage seed-to-sale record — two '
  'different things never share one name. Agent I.';

create or replace function public.f_drill_stays(p_tag text)
returns setof public.v_tag_stay
language sql stable parallel safe
set search_path to 'public', 'pg_temp'
as $$ select * from public.v_tag_stay where tag = p_tag order by stay_no $$;

comment on function public.f_drill_stays(text) is
  'One tag''s room-and-stage history with durations — step 3 of the owner''s universal drill path, '
  'beside f_drill_events (what happened) and f_drill_tags (which tags are behind a row). Agent I.';

grant execute on function public.f_drill_stays(text) to authenticated;;
