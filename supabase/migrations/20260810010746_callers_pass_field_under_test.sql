-- Every caller now passes the field under test, so rung 3 can never confirm the very
-- value being questioned. Then the old one-argument signature goes, which is what made
-- the call ambiguous.

create or replace view v_strain_conflicts as
with candidate as (
  select t.manifest_number, t.package_tag, t.item,
         t.strain as strain_column_says,
         f_strain_from_item(t.item) as item_name_says,
         t.destination_facility, t.shipped_qty,
         t.shipper_wholesale_price as value_usd
  from metrc_rpt_package_transfers t
  where t.strain is not null and t.strain <> ''
    and f_strain_from_item(t.item) is not null
    and lower(replace(replace(t.strain,'.',''),',',''))
        <> lower(replace(replace(f_strain_from_item(t.item),'.',''),',',''))
    and lower(t.strain) not like '%'||lower(f_strain_from_item(t.item))||'%'
    and lower(f_strain_from_item(t.item)) not like '%'||lower(t.strain)||'%'
),
judged as (
  -- the strain field is what is under test, so rung 3 may not answer with it
  select c.*, l.strain as ladder_strain, l.verdict as ladder_verdict,
         l.decided_by_rung, l.evidence as ladder_evidence
  from candidate c
  cross join lateral f_strain_by_tag(c.package_tag, c.strain_column_says) l
)
select j.manifest_number, j.package_tag, j.item, j.strain_column_says, j.item_name_says,
       j.destination_facility, j.shipped_qty, j.value_usd,
       case
         when j.ladder_strain is not null
              and lower(j.ladder_strain) = lower(btrim(j.item_name_says))
           then 'Metrc seed-to-sale says "'||j.ladder_strain||'", which matches the ITEM NAME. '
                ||'The Metrc STRAIN FIELD is the wrong one and must be corrected at source (D2).'
         else 'Neither name is supported by seed-to-sale, and no certificate or independent '
              ||'manifest settles it. This one needs a person (A5).'
       end as what_is_wrong,
       j.ladder_verdict, j.ladder_strain, j.decided_by_rung, j.ladder_evidence
from judged j
where not (j.ladder_verdict like 'BLEND%')
  and not (j.ladder_strain is not null
           and lower(j.ladder_strain) = lower(btrim(j.strain_column_says)));

-- guard: pass the strain field under test too
create or replace function tg_guard_naming(p_by text default 'cron:guard-naming')
returns table(guard text, hits integer, note text)
language plpgsql volatile security invoker set search_path = public, pg_temp
as $$
declare n integer; s text;
begin
  select count(*) into n
  from discrepancy_register d
  cross join lateral f_strain_by_tag(
      substring(d.subject from '1A[0-9A-Z]{22}'), d.source_b_says) r
  where d.resolved_at is null and d.class = 'strain'
    and (r.verdict like 'BLEND%'
         or lower(coalesce(r.strain,'')) = lower(btrim(d.source_b_says)));
  guard := 'G-A/G-B false strain discrepancies'; hits := n;
  note := 'blends and product names wrongly raised'; return next;

  select count(*), string_agg(x.nm, ' | ')
    into n, s
  from (select distinct source_harvest as nm
        from metrc_rpt_package_transfers
        where coalesce(source_harvest,'') <> '' and source_harvest not like '%,%'
          and source_harvest like 'TG %') x
  where x.nm !~ ' - \d{8}'
     or btrim(substring(x.nm from '^(.*?)\s+-\s')) is null;
  if n > 0 then
    insert into agent_findings
      (agent, severity, headline, detail, metric, units, scope, action, drill_to, fingerprint)
    values ('Metrc & Compliance','elevated',
      n||' harvest names cannot be parsed for a strain or a date',
      'WHAT: '||left(coalesce(s,''),300)||'. The harvest name is rung 1 of the naming ladder; '
      ||'if the strain or date cannot be read, every package from it falls to a later rung. '
      ||'Room-suffix variants such as "F2 FF", "F4 H" and lower-case "f3" are LEGITIMATE and '
      ||'deliberately not flagged. This is HANDOFF defect D7.',
      n,'harvests','metrc harvests','Correct the harvest name in Metrc (D2)',
      'metrc_corrections','naming_unparseable_harvest')
    on conflict do nothing;
  end if;
  guard := 'G-C harvest name unparseable'; hits := n; note := left(coalesce(s,'none'),160); return next;

  select count(*), string_agg(x.nm, ', ') into n, s
  from (select distinct btrim(substring(source_harvest from '^(.*?)\s+-\s')) as nm
        from metrc_rpt_package_transfers
        where coalesce(source_harvest,'') <> '' and source_harvest not like '%,%'
          and source_harvest like 'TG %') x
  where x.nm is not null
    and not exists (select 1 from metrc_strains s2 where lower(btrim(s2.name)) = lower(x.nm));
  guard := 'G-D harvest names an unregistered strain'; hits := n;
  note := left(coalesce(s,'none'),160); return next;
end;
$$;

drop function if exists f_strain_by_tag(text);;
