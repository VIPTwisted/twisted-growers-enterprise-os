-- The four guards behind the owner ruling of 9 Aug 2026.
--
-- G-A and G-B are enforced BY CONSTRUCTION: any strain comparison must go through
-- f_strain_by_tag, which returns BLEND (never a strain) for a multi-harvest package and
-- refuses to treat an unregistered name as a strain. This function catches the residue -
-- discrepancies already raised that the ladder says are not discrepancies - plus the two
-- live data faults, G-C and G-D.
create or replace function tg_guard_naming(p_by text default 'cron:guard-naming')
returns table(guard text, hits integer, note text)
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare n integer; s text;
begin
  ------------------------------------------------------------------ G-A / G-B
  -- Strain discrepancies that the ladder says are not discrepancies at all.
  select count(*) into n
  from discrepancy_register d
  cross join lateral f_strain_by_tag(substring(d.subject from '1A[0-9A-Z]{22}')) r
  where d.resolved_at is null and d.class = 'strain'
    and (r.verdict like 'BLEND%'
         or lower(coalesce(r.strain,'')) = lower(btrim(d.source_b_says)));

  if n > 0 then
    insert into agent_findings
      (agent, severity, headline, detail, metric, units, scope, action, drill_to, fingerprint)
    values ('Metrc & Compliance','elevated',
      n||' open strain discrepancies are not discrepancies - the ladder clears them',
      'WHAT: '||n||' rows in discrepancy_register class=strain resolve, by tag through Metrc '
      ||'seed-to-sale, to either a BLEND (no single strain exists) or a harvest that CONFIRMS '
      ||'the strain field (so the item name is a product name). '
      ||'WHY IT MATTERS: a register that is 84% false alarms trains people to ignore all of it, '
      ||'which is how the 16% that are real get missed. '
      ||'HOW DETECTED: f_strain_by_tag over every open strain discrepancy. '
      ||'RECOMMENDATION: run tg_apply_naming_ladder() to clear them with their evidence, and '
      ||'fix the check so it never raises a blend again.',
      n,'discrepancies','discrepancy_register',
      'Run tg_apply_naming_ladder() and repair the strain check',
      'discrepancy_register','naming_false_strain_discrepancies')
    on conflict do nothing;
  end if;
  guard := 'G-A/G-B false strain discrepancies'; hits := n;
  note := 'blends and product names wrongly raised'; return next;

  ------------------------------------------------------------------ G-C
  -- Harvest names that break the TG <strain> - <YYYYMMDD> <room> convention.
  -- This is HANDOFF defect D7, which has been open and unguarded.
  select count(distinct h.harvest_name), string_agg(distinct h.harvest_name, ', ')
    into n, s
  from (select distinct source_harvest as harvest_name
        from metrc_rpt_package_transfers
        where coalesce(source_harvest,'') <> ''
          and source_harvest not like '%,%') h
  where h.harvest_name !~ '^TG .+ - \d{8}\s*[A-Za-z0-9]*$'
    and h.harvest_name like 'TG %';

  if n > 0 then
    insert into metrc_corrections
      (title, what_is_wrong, why_it_matters, how_to_fix_in_metrc, packages_affected,
       raised_by, urgency, evidence_sql)
    select 'Harvest names off convention ('||n||')',
      n||' harvest names begin "TG " but do not match the convention '
      ||'TG <strain> - <YYYYMMDD> <room>. Examples: '||left(coalesce(s,''),400),
      'The harvest name is the seed-to-sale link that names the strain for every package '
      ||'built from it (owner ruling, 9 Aug 2026). A malformed name means those packages '
      ||'cannot be resolved by rung 1 and fall through to the certificate or to a person. '
      ||'This is HANDOFF defect D7, previously unguarded.',
      'In Metrc, rename the affected harvests to TG <strain> - <YYYYMMDD> <room>. Where the '
      ||'harvest is closed and cannot be renamed, record the correct strain against it here '
      ||'and note that the Metrc name is immutable.',
      n::text, p_by, 'normal',
      'select distinct source_harvest from metrc_rpt_package_transfers where source_harvest like ''TG %'' and source_harvest !~ ''^TG .+ - \d{8}\s*[A-Za-z0-9]*$'''
    where not exists (select 1 from metrc_corrections c
                      where c.title like 'Harvest names off convention%' and not c.fixed_in_metrc);
  end if;
  guard := 'G-C harvest names off convention'; hits := n;
  note  := left(coalesce(s,'none'),160); return next;

  ------------------------------------------------------------------ G-D
  -- A harvest naming a strain that does not exist in the strain register.
  select count(*), string_agg(x.nm, ', ')
    into n, s
  from (select distinct btrim(substring(source_harvest from '^(.*?)\s+-\s')) as nm
        from metrc_rpt_package_transfers
        where coalesce(source_harvest,'') <> '' and source_harvest not like '%,%'
          and source_harvest like 'TG %') x
  where x.nm is not null
    and not exists (select 1 from metrc_strains s2 where lower(btrim(s2.name)) = lower(x.nm));

  if n > 0 then
    insert into agent_findings
      (agent, severity, headline, detail, metric, units, scope, action, drill_to, fingerprint)
    values ('Metrc & Compliance','elevated',
      n||' harvests name a strain that is not in the Metrc strain register',
      'WHAT: '||left(coalesce(s,''),300)||'. '
      ||'WHY IT MATTERS: the harvest name is rung 1 of the naming ladder. If it names a strain '
      ||'that does not exist, every package from that harvest resolves to nothing and falls to '
      ||'the certificate or to a person. '
      ||'HOW DETECTED: harvest names in metrc_rpt_package_transfers against metrc_strains. '
      ||'SOLUTIONS: (1) register the strain in Metrc if it is real; (2) correct the harvest name '
      ||'if it is a typo. RECOMMENDATION: check each against the strain register first.',
      n,'strain names','metrc harvests',
      'Register the strain or correct the harvest name at source',
      'metrc_strains','naming_unregistered_harvest_strain')
    on conflict do nothing;
  end if;
  guard := 'G-D harvest names an unregistered strain'; hits := n;
  note  := left(coalesce(s,'none'),160); return next;
end;
$$;;
