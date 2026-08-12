/* THE DROP GUARD
   --------------
   "Never run drop view ... cascade" has been a written rule since the first
   handoff. It did not stop the dashboards being destroyed three times in one
   day, silently, because a written rule is not a control - it only works while
   someone remembers it at 2am.

   This makes it physical. Any attempt to drop a view or materialised view in
   public raises an exception and rolls the whole transaction back. It applies
   to every agent and every person equally, including whoever wrote it.

   There is a deliberate escape hatch, because sometimes a drop is genuinely
   right:
       set tg.allow_drop = 'yes';
   It lasts for that session only. You cannot do it by accident, and it is
   visible in the audit trail.

   Normal work is unaffected: create or replace does not drop. */

create or replace function tg_block_view_drops()
returns event_trigger
language plpgsql
as $$
declare
  obj record;
  allowed text := current_setting('tg.allow_drop', true);
begin
  if allowed = 'yes' then
    return;                       -- explicitly permitted for this session
  end if;

  for obj in select * from pg_event_trigger_dropped_objects()
  loop
    if obj.schema_name = 'public'
       and obj.object_type in ('view','materialized view') then
      raise exception
        'BLOCKED: dropping % "%" is not allowed.',
        obj.object_type, obj.object_identity
        using hint =
          'Use CREATE OR REPLACE VIEW instead - it keeps every dependent view alive. '
          'Dropping a view cascades and has destroyed the dashboards three times. '
          'If you genuinely must drop it, run: set tg.allow_drop = ''yes''; first, '
          'then re-create every dependent view and CHECK EACH ONE RETURNS ROWS.',
        errcode = 'raise_exception';
    end if;
  end loop;
end $$;

drop event trigger if exists tg_guard_view_drops;
create event trigger tg_guard_view_drops
  on sql_drop
  execute function tg_block_view_drops();

comment on function tg_block_view_drops() is
  'Refuses to drop any view or matview in public. Escape hatch: set tg.allow_drop = ''yes'' for the session.';;
