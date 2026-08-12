-- Auditor must never break a write: identify records by id, key, or user_id — whichever exists.
create or replace function audit_row() returns trigger
language plpgsql security definer as $$
declare rec jsonb;
begin
  rec := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  insert into audit_events(actor, entity, entity_id, action, old_value, new_value)
  values (auth.uid(), tg_table_name,
          coalesce(rec->>'id', rec->>'key', rec->>'user_id', '?'),
          tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return case when tg_op = 'DELETE' then old else new end;
end $$;;
