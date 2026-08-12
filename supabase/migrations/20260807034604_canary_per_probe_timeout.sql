/* A slow view must not be able to kill the canary - and slowness is itself
   worth reporting, because a page that takes 30 seconds is a broken page to
   the person waiting for it. Each probe gets 2 seconds and its own status. */

create or replace function tg_canary()
returns table (page text, category text, source text, status text, note text)
language plpgsql
security definer
set search_path = public
as $$
declare r record; has_rows boolean; started timestamptz; ms numeric;
begin
  for r in
    select label, nav_registry.category, table_ref
    from nav_registry
    where enabled and table_ref is not null
    order by nav_registry.category, label
  loop
    page := r.label; category := r.category; source := r.table_ref; note := null;

    if to_regclass('public.'||r.table_ref) is null then
      status := 'MISSING'; note := 'object does not exist - page renders blank';
      return next; continue;
    end if;

    started := clock_timestamp();
    begin
      set local statement_timeout = '2s';
      execute format('select exists(select 1 from %I limit 1)', r.table_ref) into has_rows;
      ms := extract(epoch from clock_timestamp() - started) * 1000;
      if not has_rows then
        status := 'EMPTY'; note := 'exists but returns no rows';
      elsif ms > 800 then
        status := 'SLOW';  note := round(ms)||' ms to return one row';
      else
        status := 'ok';
      end if;
    exception
      when query_canceled then
        status := 'SLOW'; note := 'over 2 seconds for a single row - page will hang';
      when others then
        status := 'ERROR'; note := left(sqlerrm,120);
    end;
    return next;
  end loop;
  reset statement_timeout;
end $$;

grant execute on function tg_canary() to authenticated;;
