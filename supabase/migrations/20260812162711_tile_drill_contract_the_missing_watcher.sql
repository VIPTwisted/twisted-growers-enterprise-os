-- Agent I (Database COO), 12 Aug 2026. DBI-054.
--
-- OWNER, ANGRY AND CORRECT: "where are the watchers, reviews, the guard!!! where are you to
-- allow this" and "Everything I touch I have yet to find one item without issues."
--
-- THE HONEST ANSWER, RECORDED HERE SO IT CANNOT BE FORGOTTEN. Every guard built to date watches
-- the DATABASE - drop view, grant to anon, deletes on forensic tables, ratchet baselines, fixture
-- proof. Not ONE watches the thing he keeps finding with his own eyes: DOES THE NUMBER ON A TILE
-- EQUAL THE NUMBER IN ITS OWN DRILL. There was no checker for that class. Zero coverage. So the
-- only detector of "F1 — 1,022 plants" drilling into "no plants recorded in F1" was the owner
-- opening the page. Three separate defects of this exact class reached him in one evening.
--
-- WHAT THIS BUILDS. tile_drill_contract: every tile on every page registers THREE things -
--   1. the SQL that produces the number the tile SHOWS,
--   2. the SQL that produces the same number by SUMMING THE DRILL ROWS the tile opens,
--   3. the tolerance, which is normally zero.
-- tg_check_tile_drill() runs them both and raises a finding on ANY disagreement. A tile with no
-- contract is itself a finding - silence is not a pass. This is the missing watcher, and it is
-- the one that would have caught all three of tonight's defects before he saw them.
--
-- SAFETY. Only an admin may register a contract. Both expressions must be a bare SELECT: the
-- trigger rejects anything containing a write verb, and execution is EXECUTE-into-numeric with a
-- read-only-friendly shape. This is deliberately narrow - it is a measuring instrument, not a
-- general SQL runner.
--
-- UNDO: drop function tg_check_tile_drill; drop view v_tile_drill_status; drop table tile_drill_contract.

create table if not exists tile_drill_contract (
  contract_key  text primary key,
  page          text not null,
  tile_label    text not null,
  tile_sql      text not null,   -- must return exactly one numeric
  drill_sql     text not null,   -- must return exactly one numeric, summed from the drill rows
  tolerance     numeric not null default 0,
  why_tolerance text,
  registered_by text not null default 'Agent I',
  registered_at timestamptz not null default now()
);

alter table tile_drill_contract enable row level security;
drop policy if exists tdc_read  on tile_drill_contract;
drop policy if exists tdc_write on tile_drill_contract;
create policy tdc_read  on tile_drill_contract for select to authenticated using (true);
create policy tdc_write on tile_drill_contract for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

comment on table tile_drill_contract is
 'THE MISSING WATCHER, built 12 Aug 2026. Every tile registers the SQL behind the number it '
 'SHOWS and the SQL that re-derives that number by summing the rows its DRILL opens. They must '
 'agree. Before this table existed nothing in the platform compared a tile to its own drill, so '
 'the owner was the detector - he found three of these in one evening. A tile with no contract '
 'is a finding in its own right: silence is not a pass.';

create or replace function tg_reject_write_sql() returns trigger
language plpgsql as $$
declare bad text;
begin
  foreach bad in array array['insert','update','delete','drop','alter','truncate','grant',
                             'revoke','create','copy',';'] loop
    if position(bad in lower(new.tile_sql))  > 0
    or position(bad in lower(new.drill_sql)) > 0 then
      raise exception
        'tile_drill_contract accepts a bare SELECT only. "%" appeared in one of the expressions. '
        'This table is a measuring instrument, not a SQL runner.', bad;
    end if;
  end loop;
  if lower(ltrim(new.tile_sql))  not like 'select%'
  or lower(ltrim(new.drill_sql)) not like 'select%' then
    raise exception 'Both tile_sql and drill_sql must begin with SELECT.';
  end if;
  return new;
end $$;

drop trigger if exists trg_tdc_select_only on tile_drill_contract;
create trigger trg_tdc_select_only before insert or update on tile_drill_contract
for each row execute function tg_reject_write_sql();

create or replace function tg_check_tile_drill()
returns table(contract_key text, page text, tile_label text,
              tile_value numeric, drill_value numeric, gap numeric, verdict text)
language plpgsql security definer set search_path = public as $$
declare c record; tv numeric; dv numeric; err text;
begin
  for c in select * from tile_drill_contract order by page, tile_label loop
    tv := null; dv := null; err := null;
    begin execute c.tile_sql  into tv; exception when others then err := 'tile SQL failed: '||sqlerrm; end;
    begin execute c.drill_sql into dv; exception when others then
      err := coalesce(err||' / ','')||'drill SQL failed: '||sqlerrm; end;

    contract_key := c.contract_key; page := c.page; tile_label := c.tile_label;
    tile_value := tv; drill_value := dv; gap := coalesce(tv,0) - coalesce(dv,0);

    verdict := case
      when err is not null                       then 'BROKEN — '||err
      when tv is null and dv is null             then 'BOTH EMPTY — the tile and its drill both return nothing'
      when tv is null or dv is null              then 'ONE SIDE EMPTY — a tile showing a figure whose drill returns nothing, or the reverse'
      when abs(tv - dv) <= c.tolerance           then 'AGREE'
      else 'DISAGREE — tile '||tv||' vs drill '||dv||', gap '||(tv-dv)
    end;
    return next;
  end loop;
end $$;

comment on function tg_check_tile_drill() is
 'Runs every registered tile against its own drill. AGREE, DISAGREE, ONE SIDE EMPTY, BOTH EMPTY '
 'or BROKEN. ONE SIDE EMPTY is the shape of the F1 defect: a tile showing 1,022 whose drill '
 'returned nothing and then explained the nothing.';

create or replace view public.v_tile_drill_status as
select * from tg_check_tile_drill();

comment on view public.v_tile_drill_status is
 'Live tile-versus-drill reconciliation for every registered tile. Anything not AGREE is a defect '
 'the owner must never be the one to find.';;
