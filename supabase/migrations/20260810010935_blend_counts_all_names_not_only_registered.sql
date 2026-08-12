-- CORRECTION to the 10 Aug rebuild, same session. I required every contributing strain to
-- be REGISTERED before it counted toward a blend. That is too strict: a package built from
-- our harvests plus an outside cultivator's (codes like H3C16-DOSI-122925, which are not in
-- our strain register and never will be) is still unambiguously a blend. It cut blends from
-- 447 to 249 and pushed the rest down the ladder.
--
-- Registration decides whether we can NAME the single strain. It does not decide whether the
-- package is a blend. Those are different questions and I had merged them.

create or replace function f_strain_by_tag(p_tag text, p_field_under_test text default null)
returns table(
  strain           text,
  verdict          text,
  decided_by_rung  integer,
  decided_by       text,
  contributors     text[],
  evidence         text
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_harvests text;
  v_item     text;
  v_strain   text;
  v_batch    text;
  tok        text;
  acc        text := null;
  harvests   text[] := '{}';
  names      text[] := '{}';   -- every distinct harvest-derived name, registered or not
  h          text;
  nm         text;
  v_one      text;
begin
  select distinct on (t.package_tag) t.source_harvest, t.item, t.strain
    into v_harvests, v_item, v_strain
  from metrc_rpt_package_transfers t
  where t.package_tag = p_tag
  order by t.package_tag, t.imported_at desc;

  if v_harvests is null then
    select p.raw->>'SourceHarvestNames', p.item_name
      into v_harvests, v_item
    from metrc_packages p where p.tag = p_tag limit 1;
  end if;

  if coalesce(v_harvests,'') <> '' then
    -- comma-aware: a token only starts a new harvest if it carries a date, so the
    -- registered strain "TG Dr, J" is never split into "TG Dr" and "J".
    foreach tok in array string_to_array(v_harvests, ',') loop
      acc := case when acc is null then btrim(tok) else acc || ', ' || btrim(tok) end;
      if acc ~ ' - \s*\d{8}' then
        harvests := harvests || acc;
        acc := null;
      end if;
    end loop;
    if acc is not null then harvests := harvests || acc; end if;

    foreach h in array harvests loop
      nm := btrim(substring(h from '^(.*?)\s+-\s'));
      if nm is null or nm = '' then
        nm := btrim(h);                 -- unparseable: keep the whole string as its identity
      end if;
      if nm <> '' and not (lower(nm) = any (select lower(x) from unnest(names) x)) then
        names := names || nm;
      end if;
    end loop;

    ---------------------------------------------- rung 1
    -- BLEND on DISTINCT NAMES, registered or not. An outside cultivator's harvest code is
    -- still a different origin.
    if array_length(names,1) > 1 then
      return query select null::text,
        'BLEND - no single strain exists for this tag'::text,
        1, 'Metrc seed-to-sale'::text, names,
        ('built from '||array_length(harvests,1)||' source harvest(s) carrying '
         ||array_length(names,1)||' DISTINCT strain names: '||left(v_harvests,300))::text;
      return;
    end if;

    -- exactly one origin. We can only NAME it if the register knows it.
    if array_length(names,1) = 1 then
      if exists (select 1 from metrc_strains s
                 where lower(btrim(s.name)) = lower(names[1])) then
        return query select names[1],
          case when array_length(harvests,1) > 1
               then 'resolved - several harvests, all of the same strain'
               else 'resolved from the single source harvest' end::text,
          1, 'Metrc seed-to-sale'::text, names,
          ('source harvest(s): '||left(v_harvests,300))::text;
        return;
      end if;
      -- one origin, but not a strain we hold. Say so; do not invent it.
      return query select null::text,
        ('UNRESOLVED - one origin "'||names[1]||'", which is not in the Metrc strain register')::text,
        1, 'Metrc seed-to-sale'::text, names,
        ('single source harvest '||left(v_harvests,200)||' names something the strain '
         ||'register does not hold - typically an outside cultivator''s batch code')::text;
      return;
    end if;
  end if;

  ---------------------------------------------- rung 2
  select e.metrc_batch_id into v_batch
  from coa_extract e
  where e.package_tag = p_tag and coalesce(e.metrc_batch_id,'') <> ''
  order by e.report_date desc nulls last limit 1;

  if coalesce(v_batch,'') <> '' then
    v_one := btrim(substring(v_batch from '^(.*?)\s+-\s'));
    if v_one is not null
       and exists (select 1 from metrc_strains s where lower(btrim(s.name)) = lower(v_one)) then
      return query select v_one,
        'resolved from the certificate of analysis'::text,
        2, 'Certificate of analysis'::text, array[v_one],
        ('COA names Metrc batch '||v_batch)::text;
      return;
    end if;
  end if;

  ---------------------------------------------- rung 3
  if coalesce(v_strain,'') <> ''
     and exists (select 1 from metrc_strains s where lower(btrim(s.name)) = lower(v_strain))
     and (p_field_under_test is null
          or lower(btrim(v_strain)) <> lower(btrim(p_field_under_test))) then
    return query select v_strain,
      'resolved from the manifest as shipped - weakest evidence, restates what the shipper entered'::text,
      3, 'Manifest'::text, array[v_strain],
      'declared on the transfer for this tag; no harvest and no certificate answered'::text;
    return;
  end if;

  ---------------------------------------------- rung 4
  return query select null::text,
    case when p_field_under_test is not null
              and lower(btrim(coalesce(v_strain,''))) = lower(btrim(p_field_under_test))
         then 'UNRESOLVED - the only remaining source repeats the field under test, which is circular'
         else 'UNRESOLVED - needs a person' end::text,
    4, 'A person'::text, nullif(names,'{}'),
    ('no usable source harvest, no certificate batch, and no independent strain on the transfer. '
     ||'item name was '||coalesce(v_item,'(none)')
     ||'; strain field was '||coalesce(v_strain,'(none)'))::text;
end;
$$;;
