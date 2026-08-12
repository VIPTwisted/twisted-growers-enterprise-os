-- REBUILT after independent audit, 10 Aug 2026. Four defects the auditor found in v1:
--
-- 1. BLEND was decided on HARVEST COUNT, not on distinct STRAINS. Two harvests of the same
--    strain would be declared "no single strain exists" - false. A live case exists on
--    manifest 0003069212, where one package has two TG Rainbow Sherbet 11 harvests.
-- 2. Harvests were split on comma, but "TG Dr, J" is ONE registered strain containing a
--    comma. 13 tags were declared blends of "TG Dr" and "J". The same defect puts 202 rows
--    of a phantom harvest "TG Dr" into mv_package_harvest (not mine, reported separately).
-- 3. Rung 3 could echo the very strain field under test - circular, and it wrongly
--    "confirmed" 1 of 176.
-- 4. The BLEND branch used coalesce(substring(...), h), promoting an unparseable harvest
--    string to a phantom strain. Rung 1 had no coalesce. Same input, two behaviours.
--
-- Harvests are now split comma-aware: a token is only a new harvest if it carries a
-- " - <8 digits>" date. A token without one is a fragment of the previous harvest and is
-- rejoined, which is exactly the "TG Dr, J" case.

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
  strains    text[] := '{}';
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

  ------------------------------------------------ comma-aware split
  if coalesce(v_harvests,'') <> '' then
    foreach tok in array string_to_array(v_harvests, ',') loop
      acc := case when acc is null then btrim(tok) else acc || ', ' || btrim(tok) end;
      -- a harvest is complete once it carries its date
      if acc ~ ' - \s*\d{8}' then
        harvests := harvests || acc;
        acc := null;
      end if;
    end loop;
    if acc is not null then                      -- trailing fragment, keep it rather than lose it
      harvests := harvests || acc;
    end if;

    -- resolve each harvest to a REGISTERED strain; unparseable ones contribute nothing
    -- rather than becoming a phantom strain (defect 4).
    foreach h in array harvests loop
      nm := btrim(substring(h from '^(.*?)\s+-\s'));
      if nm is not null
         and exists (select 1 from metrc_strains s where lower(btrim(s.name)) = lower(nm)) then
        if not (lower(nm) = any (select lower(x) from unnest(strains) x)) then
          strains := strains || nm;
        end if;
      end if;
    end loop;

    ---------------------------------------------- rung 1
    -- BLEND is decided on DISTINCT STRAINS, never on harvest count (defect 1).
    if array_length(strains,1) > 1 then
      return query select
        null::text,
        'BLEND - no single strain exists for this tag'::text,
        1, 'Metrc seed-to-sale'::text,
        strains,
        ('built from '||array_length(harvests,1)||' source harvest(s) carrying '
         ||array_length(strains,1)||' DISTINCT strains: '||v_harvests)::text;
      return;
    end if;

    if array_length(strains,1) = 1 then
      return query select
        strains[1],
        case when array_length(harvests,1) > 1
             then 'resolved - several harvests, all of the same strain'
             else 'resolved from the single source harvest' end::text,
        1, 'Metrc seed-to-sale'::text,
        strains,
        ('source harvest(s): '||v_harvests)::text;
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
  -- A manifest that merely repeats the field under test is not evidence about it (defect 3).
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
              and coalesce(v_strain,'') = p_field_under_test
         then 'UNRESOLVED - the only remaining source repeats the field under test, which is circular'
         else 'UNRESOLVED - needs a person' end::text,
    4, 'A person'::text, nullif(strains,'{}'),
    ('no usable source harvest, no certificate batch, and no independent strain on the transfer. '
     ||'item name was '||coalesce(v_item,'(none)')
     ||'; strain field was '||coalesce(v_strain,'(none)'))::text;
end;
$$;

comment on function f_strain_by_tag(text, text) is
  'Owner ruling D4 made executable, rebuilt 10 Aug 2026 after independent audit. BLEND is '
  'decided on DISTINCT STRAINS, never harvest count. Harvest splitting is comma-aware, so '
  'the registered strain "TG Dr, J" is not mistaken for a blend of "TG Dr" and "J". Pass '
  'p_field_under_test to stop rung 3 confirming the very field being questioned.';;
