-- G-C REWRITTEN, same day. The first version demanded the room suffix be one token and so
-- rejected every legitimate "F2 FF", "F4 H" and lower-case "f3" - 82 flagged, 6 real.
--
-- The lesson, and it is the third time today: a check must measure THE THING THAT BREAKS,
-- not a shape somebody imagined. What breaks the naming ladder is (a) no readable strain
-- before the dash, or (b) no 8-digit date. Room-suffix tidiness breaks nothing, because
-- rung 1 reads the strain from before the dash and never looks at the suffix.
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
      n||' open strain discrepancies are not discrepancies - the naming ladder clears them',
      'WHAT: '||n||' open rows of class=strain resolve, by tag through Metrc seed-to-sale, to '
      ||'either a BLEND (no single strain exists) or a harvest CONFIRMING the strain field '
      ||'(so the item name is a product name). WHY IT MATTERS: a register that is mostly false '
      ||'alarms trains people to ignore all of it, which is how the real ones get missed. '
      ||'RECOMMENDATION: clear them with their evidence, and repair the check that raises them.',
      n,'discrepancies','discrepancy_register',
      'Clear them through the ladder and repair the strain check',
      'discrepancy_register','naming_false_strain_discrepancies')
    on conflict do nothing;
  end if;
  guard := 'G-A/G-B false strain discrepancies'; hits := n;
  note := 'blends and product names wrongly raised'; return next;

  ------------------------------------------------------------------ G-C (fixed)
  select count(*), string_agg(x.nm, ' | ')
    into n, s
  from (select distinct source_harvest as nm
        from metrc_rpt_package_transfers
        where coalesce(source_harvest,'') <> '' and source_harvest not like '%,%'
          and source_harvest like 'TG %') x
  where x.nm !~ ' - \d{8}'                        -- no readable harvest date
     or btrim(substring(x.nm from '^(.*?)\s+-\s')) is null;  -- no readable strain

  if n > 0 then
    insert into agent_findings
      (agent, severity, headline, detail, metric, units, scope, action, drill_to, fingerprint)
    values ('Metrc & Compliance','elevated',
      n||' harvest names cannot be parsed for a strain or a date',
      'WHAT: '||left(coalesce(s,''),300)||'. WHY IT MATTERS: the harvest name is rung 1 of the '
      ||'naming ladder; if the strain or date cannot be read, every package from that harvest '
      ||'falls through to the certificate or to a person. This is HANDOFF defect D7. '
      ||'NOTE: room-suffix variants such as "F2 FF", "F4 H" and lower-case "f3" are LEGITIMATE '
      ||'and are deliberately not flagged - an earlier version of this guard flagged 82 of them '
      ||'and was wrong. RECOMMENDATION: correct these at source in Metrc (D2).',
      n,'harvests','metrc harvests',
      'Correct the harvest name in Metrc so the strain and date can be read',
      'metrc_corrections','naming_unparseable_harvest')
    on conflict do nothing;
  end if;
  guard := 'G-C harvest name unparseable'; hits := n;
  note  := left(coalesce(s,'none'),160); return next;

  ------------------------------------------------------------------ G-D
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
      'WHAT: '||left(coalesce(s,''),300)||'. WHY IT MATTERS: rung 1 of the naming ladder cannot '
      ||'resolve a strain that does not exist. SOLUTIONS: (1) register it in Metrc if real; '
      ||'(2) correct the harvest name if it is a typo.',
      n,'strain names','metrc harvests',
      'Register the strain or correct the harvest name at source',
      'metrc_strains','naming_unregistered_harvest_strain')
    on conflict do nothing;
  end if;
  guard := 'G-D harvest names an unregistered strain'; hits := n;
  note  := left(coalesce(s,'none'),160); return next;
end;
$$;;
