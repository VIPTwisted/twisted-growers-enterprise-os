-- Turns one ruling into the closure of every package behind it - and, where the ruling
-- says Metrc itself is wrong, raises a correction AT SOURCE (rule D2). Fixing only our
-- mirror would hide the fault from the state record, which is the thing D2 forbids.
create or replace function tg_apply_strain_rulings(p_by text default 'tg_apply_strain_rulings')
returns table(pair_key text, ruling text, packages_closed integer, correction_raised boolean)
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  r        record;
  n        integer;
  raised   boolean;
begin
  for r in
    select * from strain_name_ruling
    where ruling <> 'not yet ruled'
      and exists (
        select 1 from discrepancy_register d
        where d.resolved_at is null and d.class = 'strain'
          and lower(btrim(d.source_a_says)) = lower(btrim(strain_name_ruling.item_name))
          and lower(btrim(d.source_b_says)) = lower(btrim(strain_name_ruling.strain_field)))
    order by packages desc
  loop
    raised := false;

    -- Metrc is the legal record. If the ruling says Metrc is wrong, the correction
    -- belongs there, with instructions, and it cannot be closed without a reference.
    if r.ruling in ('item name is wrong - correct it in Metrc',
                    'strain field is wrong - correct it in Metrc') then
      if not exists (select 1 from metrc_corrections c
                     where c.title = 'Strain naming: '||r.pair_key) then
        insert into metrc_corrections
          (title, what_is_wrong, why_it_matters, how_to_fix_in_metrc,
           packages_affected, raised_by, urgency, evidence_sql)
        values
          ('Strain naming: '||r.pair_key,
           'The Metrc item name says "'||r.item_name||'" while the Metrc strain field says "'
             ||r.strain_field||'" on '||r.packages||' packages. Ruled by '||coalesce(r.ruled_by,'?')
             ||': '||r.ruling||'.'||coalesce(' Note: '||r.note,''),
           'Strain identity drives yield by strain, pricing by strain and the certificate '
             ||'chain. Two names on one package means every per-strain figure is split across '
             ||'a name that does not exist. Correcting it only in our mirror would hide the '
             ||'fault from the state record.',
           case r.ruling
             when 'item name is wrong - correct it in Metrc'
               then 'In Metrc, edit the ITEM so its name matches the strain "'||r.strain_field
                    ||'". Items are edited under Admin > Items. Existing packages keep the old '
                    ||'item name until repackaged, so record which packages remain on the old name.'
             else 'In Metrc, correct the STRAIN on the affected packages to "'||r.item_name
                  ||'". Where the package is finished, record the correction against the harvest '
                  ||'and note that historic packages cannot be re-tagged.'
           end,
           r.packages::text, p_by,
           case when r.packages >= 100 then 'high' else 'normal' end,
           'select * from strain_name_ruling where pair_key = '''||replace(r.pair_key,'''','''''')||'''');
        raised := true;
      end if;
    end if;

    update discrepancy_register d
    set resolved_at = now(),
        resolved_by = coalesce(r.ruled_by, p_by),
        resolution_note = r.ruling
          ||' (ruled by '||coalesce(r.ruled_by,'?')||' on '
          ||coalesce(r.ruled_at::date::text,'?')||'; one ruling covering '||r.packages
          ||' packages on the pair '||r.pair_key||')'
          ||coalesce('. Note: '||r.note,'')
          ||case when raised then ' A Metrc correction was raised at source.' else '' end
    where d.resolved_at is null and d.class = 'strain'
      and lower(btrim(d.source_a_says)) = lower(btrim(r.item_name))
      and lower(btrim(d.source_b_says)) = lower(btrim(r.strain_field));
    get diagnostics n = row_count;

    -- close the routed finding alongside the discrepancy, with the ruling as the reason
    update finding_state s
    set state = 'closed',
        override_reason = 'Closed by owner ruling on the strain name pair '||r.pair_key
                          ||': '||r.ruling||'. One ruling, '||n||' packages. The ruling IS '
                          ||'the independent judgement - a second agent cannot second-guess '
                          ||'what is a business decision about naming.',
        override_by = coalesce(r.ruled_by, p_by),
        override_at = now(),
        changed_by  = p_by,
        note        = 'strain ruling applied'
    from discrepancy_register d
    where s.finding_key = 'disc:'||d.discrepancy_key
      and d.class = 'strain'
      and d.resolved_at is not null
      and lower(btrim(d.source_a_says)) = lower(btrim(r.item_name))
      and lower(btrim(d.source_b_says)) = lower(btrim(r.strain_field))
      and s.state <> 'closed';

    pair_key := r.pair_key; ruling := r.ruling;
    packages_closed := n; correction_raised := raised;
    return next;
  end loop;
end;
$$;

comment on function tg_apply_strain_rulings(text) is
  'Applies owner rulings on strain name pairs: closes every discrepancy behind the pair '
  'and, where the ruling says Metrc is wrong, raises a metrc_corrections row so the fix '
  'happens at source (D2). Closure uses the override path deliberately - the owner ruling '
  'IS the judgement, and it stays visible in v_guard_queue as closed on authority.';;
