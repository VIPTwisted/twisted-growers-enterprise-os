-- Answers "what strain is this tag" by walking name_authority in order and stopping at
-- the first rung that answers. Returns the rung it used and the evidence, so the answer
-- can always be re-derived and argued with (A2).
--
-- It returns NULL strain for a blend ON PURPOSE. A blend has no single strain, and
-- returning one contributing strain as though it were the answer is the invention rule
-- A1 forbids. Callers must read verdict, not just strain.
create or replace function f_strain_by_tag(p_tag text)
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
  v_arr      text[];
  v_n        integer;
  v_one      text;
  v_batch    text;
  v_item     text;
  v_strain   text;
begin
  select distinct on (t.package_tag) t.source_harvest, t.item, t.strain
    into v_harvests, v_item, v_strain
  from metrc_rpt_package_transfers t
  where t.package_tag = p_tag
  order by t.package_tag, t.imported_at desc;

  -- fall back to the package mirror when the tag never appeared on a transfer
  if v_harvests is null then
    select p.raw->>'SourceHarvestNames', p.item_name
      into v_harvests, v_item
    from metrc_packages p where p.tag = p_tag limit 1;
  end if;

  ---------------------------------------------------------------- rung 1
  if coalesce(v_harvests,'') <> '' then
    v_arr := array(select btrim(x) from unnest(string_to_array(v_harvests, ',')) x
                   where btrim(x) <> '');
    v_n := coalesce(array_length(v_arr,1),0);

    if v_n > 1 then
      return query select
        null::text,
        'BLEND - no single strain exists for this tag'::text,
        1, 'Metrc seed-to-sale'::text,
        array(select btrim(coalesce(substring(h from '^(.*?)\s+-\s'), h)) from unnest(v_arr) h),
        ('built from '||v_n||' source harvests: '||v_harvests)::text;
      return;
    end if;

    if v_n = 1 then
      v_one := btrim(substring(v_arr[1] from '^(.*?)\s+-\s'));
      -- the harvest must name a REGISTERED strain, or it is off-convention
      if v_one is not null
         and exists (select 1 from metrc_strains s
                     where lower(btrim(s.name)) = lower(v_one)) then
        return query select
          v_one,
          'resolved from the single source harvest'::text,
          1, 'Metrc seed-to-sale'::text,
          array[v_one],
          ('source harvest '||v_arr[1])::text;
        return;
      end if;
    end if;
  end if;

  ---------------------------------------------------------------- rung 2
  select e.metrc_batch_id into v_batch
  from coa_extract e
  where e.package_tag = p_tag and coalesce(e.metrc_batch_id,'') <> ''
  order by e.report_date desc nulls last limit 1;

  if coalesce(v_batch,'') <> '' then
    v_one := btrim(substring(v_batch from '^(.*?)\s+-\s'));
    if v_one is not null
       and exists (select 1 from metrc_strains s where lower(btrim(s.name)) = lower(v_one)) then
      return query select
        v_one,
        'resolved from the certificate of analysis'::text,
        2, 'Certificate of analysis'::text,
        array[v_one],
        ('COA names Metrc batch '||v_batch)::text;
      return;
    end if;
  end if;

  ---------------------------------------------------------------- rung 3
  if coalesce(v_strain,'') <> ''
     and exists (select 1 from metrc_strains s where lower(btrim(s.name)) = lower(v_strain)) then
    return query select
      v_strain,
      'resolved from the manifest as shipped - weakest evidence, restates what the shipper entered'::text,
      3, 'Manifest'::text,
      array[v_strain],
      ('declared on the transfer for this tag; no harvest and no certificate answered')::text;
    return;
  end if;

  ---------------------------------------------------------------- rung 4
  return query select
    null::text,
    'UNRESOLVED - needs a person'::text,
    4, 'A person'::text,
    null::text[],
    ('no source harvest, no certificate batch, and no registered strain on the transfer. '
     ||'item name was '||coalesce(v_item,'(none)')
     ||'; strain field was '||coalesce(v_strain,'(none)'))::text;
end;
$$;

comment on function f_strain_by_tag(text) is
  'The owner ruling of 9 Aug 2026 made executable: resolve a strain BY TAG through Metrc '
  'seed-to-sale, then the COA, then the manifest, then a person. Returns NULL strain for a '
  'blend deliberately - a blend has no single strain and inventing one breaks rule A1.';;
