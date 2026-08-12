create or replace function tg_apply_naming_ladder(p_by text default 'tg_apply_naming_ladder')
returns table(outcome text, discrepancies integer, corrections_raised integer)
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_blend int := 0; v_confirm int := 0; v_wrong int := 0; v_corr int := 0;
  rec record;
begin
  ---------------------------------------------------------------- blends
  with x as (
    select d.discrepancy_key, lr.evidence, lr.contributors
    from discrepancy_register d
    cross join lateral f_strain_by_tag(substring(d.subject from '1A[0-9A-Z]{22}')) lr
    where d.resolved_at is null and d.class='strain' and lr.verdict like 'BLEND%'
  )
  update discrepancy_register d
  set resolved_at = now(), resolved_by = p_by,
      resolution_note = 'NOT A DISCREPANCY - BLEND. Rung 1, Metrc seed-to-sale: '||x.evidence
        ||'. Contributing strains: '||array_to_string(x.contributors, ', ')
        ||'. Metrc holds one strain field and this package has several, so neither the item '
        ||'name nor the strain field is wrong. Owner ruling 9 Aug 2026.'
  from x where x.discrepancy_key = d.discrepancy_key;
  get diagnostics v_blend = row_count;

  ------------------------------------------------- harvest confirms the strain field
  with x as (
    select d.discrepancy_key, lr.strain, lr.evidence
    from discrepancy_register d
    cross join lateral f_strain_by_tag(substring(d.subject from '1A[0-9A-Z]{22}')) lr
    where d.resolved_at is null and d.class='strain'
      and lr.strain is not null
      and lower(lr.strain) = lower(btrim(d.source_b_says))
  )
  update discrepancy_register d
  set resolved_at = now(), resolved_by = p_by,
      resolution_note = 'NOT A DISCREPANCY. Rung 1, Metrc seed-to-sale confirms the strain '
        ||'field as "'||x.strain||'" ('||x.evidence||'). The item name is a PRODUCT name, not '
        ||'a strain. Owner ruling 9 Aug 2026: identity is the tag, names come from Metrc '
        ||'seed-to-sale first.'
  from x where x.discrepancy_key = d.discrepancy_key;
  get diagnostics v_confirm = row_count;

  ------------------------------------------- harvest backs the item name: Metrc is wrong
  for rec in
    select btrim(regexp_replace(d.source_a_says,'^M\d+:\s*','')) as item_name,
           d.source_b_says as strain_field, lr.strain as true_strain, count(*)::int as packages
    from discrepancy_register d
    cross join lateral f_strain_by_tag(substring(d.subject from '1A[0-9A-Z]{22}')) lr
    where d.resolved_at is null and d.class='strain'
      and lr.strain is not null
      and lower(lr.strain) = lower(btrim(regexp_replace(d.source_a_says,'^M\d+:\s*','')))
    group by 1,2,3
  loop
    if not exists (select 1 from metrc_corrections c
                   where c.title = 'Strain field wrong in Metrc: '||rec.strain_field
                                   ||' should be '||rec.true_strain
                     and not c.fixed_in_metrc) then
      insert into metrc_corrections
        (title, what_is_wrong, why_it_matters, how_to_fix_in_metrc, packages_affected,
         raised_by, urgency, evidence_sql)
      values
        ('Strain field wrong in Metrc: '||rec.strain_field||' should be '||rec.true_strain,
         rec.packages||' packages carry the Metrc strain field "'||rec.strain_field||'" while '
           ||'the source harvest they came from is "'||rec.true_strain||'". Seed-to-sale is '
           ||'rung 1 of the naming ladder and outranks the strain field, so the strain field '
           ||'is the wrong one.',
         'Strain identity drives yield by strain, price by strain and the certificate chain. A '
           ||'package recorded under a strain it did not come from splits every per-strain '
           ||'figure across a name the plants never had. Correcting it only in our mirror would '
           ||'hide the fault from the state record (D2).',
         'In Metrc, correct the strain on these '||rec.packages||' packages to "'
           ||rec.true_strain||'". Where a package is finished and cannot be edited, record the '
           ||'correction against the harvest and note that historic packages cannot be re-tagged.',
         rec.packages::text, p_by,
         case when rec.packages >= 50 then 'high' else 'normal' end,
         'select d.subject, s.strain from discrepancy_register d cross join lateral '
           ||'f_strain_by_tag(substring(d.subject from ''1A[0-9A-Z]{22}'')) s '
           ||'where d.class=''strain'' and lower(s.strain) = lower('
           ||''''||replace(rec.true_strain,'''','''''')||''')');
      v_corr := v_corr + 1;
    end if;
  end loop;

  with x as (
    select d.discrepancy_key, lr.strain, lr.evidence
    from discrepancy_register d
    cross join lateral f_strain_by_tag(substring(d.subject from '1A[0-9A-Z]{22}')) lr
    where d.resolved_at is null and d.class='strain'
      and lr.strain is not null
      and lower(lr.strain) = lower(btrim(regexp_replace(d.source_a_says,'^M\d+:\s*','')))
  )
  update discrepancy_register d
  set resolved_at = now(), resolved_by = p_by,
      resolution_note = 'REAL - the Metrc STRAIN FIELD is wrong. Rung 1, seed-to-sale says "'
        ||x.strain||'" ('||x.evidence||'), which matches the item name, not the strain field. '
        ||'A Metrc correction has been raised to fix it AT SOURCE (D2). Cleared here only '
        ||'because the correction now carries it.'
  from x where x.discrepancy_key = d.discrepancy_key;
  get diagnostics v_wrong = row_count;

  return query
  select 'BLEND - no single strain exists'::text, v_blend, 0
  union all select 'seed-to-sale confirms the strain field; item name is a product name', v_confirm, 0
  union all select 'REAL - strain field wrong in Metrc, correction raised at source', v_wrong, v_corr
  union all select 'still open for a person (ladder could not answer)',
    (select count(*)::int from discrepancy_register where resolved_at is null and class='strain'), 0;
end;
$$;;
