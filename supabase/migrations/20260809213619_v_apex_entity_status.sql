/* One row per Apex entity: what it is, when it last came in, how much of it we
   hold, and whether pulling it right now would cost anything.

   A VIEW rather than direct table reads, for two reasons. apex_raw is deliberately
   unreadable by any browser role - raw payloads carry buyer contacts and pricing -
   but a COUNT of it is harmless and is exactly what the operator needs. A view runs
   with its owner's rights, so it can publish the count without publishing a single
   payload. And it puts "is this due?" in one place, so the screen and the connector
   cannot disagree about what due means. */
create or replace view public.v_apex_entity_status as
with counts as (
  select entity, count(*) as rows_stored, max(fetched_at) as newest_row
  from public.apex_raw group by entity
),
lastrun as (
  select distinct on (entity) entity, status, started_at, rows_written, error
  from public.apex_sync_run order by entity, started_at desc
)
select
  e.entity,
  e.kind,
  e.endpoint,
  e.api_version,
  e.required,
  e.supports_delta,
  e.min_interval_minutes,
  w.last_success_at,
  w.consecutive_errors,
  coalesce(c.rows_stored, 0)          as rows_stored,
  c.newest_row,
  r.status                            as last_status,
  r.started_at                        as last_attempt,
  r.rows_written                      as last_rows,
  left(r.error, 300)                  as last_error,
  /* DUE means "a pull would actually call Apex". Anything else is free, and the
     screen must say so - a button that silently does nothing is worse than one that
     explains why it is not needed. */
  case
    when w.last_success_at is null then true
    else (extract(epoch from (now() - w.last_success_at)) / 60) >= e.min_interval_minutes
  end                                 as due,
  case
    when w.last_success_at is null then 'never pulled'
    else greatest(0, e.min_interval_minutes
         - floor(extract(epoch from (now() - w.last_success_at)) / 60))::int || ' min until due'
  end                                 as due_text
from public.apex_entity e
left join public.apex_watermark w on w.entity = e.entity
left join counts   c on c.entity = e.entity
left join lastrun  r on r.entity = e.entity;

comment on view public.v_apex_entity_status is
  'Per-entity Apex sync status for the operator screen. Publishes COUNTS of apex_raw without publishing any payload - apex_raw itself stays unreadable to browser roles because it carries buyer contacts and pricing. "due" is computed here so the screen and the connector cannot disagree about what due means.';

grant select on public.v_apex_entity_status to authenticated;;
