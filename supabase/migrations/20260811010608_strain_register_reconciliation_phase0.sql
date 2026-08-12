-- Phase 0 of the Strain & Product Library: reconcile strain_library against the
-- Metrc strain register. 250 of 272 rows are product names, not strains
-- (rule D4 corollary 1). Nothing is deleted and nothing in strain_library is
-- mutated here -- this migration only DERIVES the verdict so it can be reviewed.

------------------------------------------------------------------ the stripper
-- Removes a PRODUCT FORM from the end of a name. Suffix-anchored and
-- longest-match-first, deliberately: a mid-string word strip would destroy
-- "Bubble Gum" while trying to remove "Bubble Hash".
create or replace function public.f_strip_product_form(p_name text)
returns text
language plpgsql
immutable
set search_path to 'public','pg_temp'
as $$
declare
  forms text[] := array[
    'Live Hash Rosin Pre-?Fill','Cured Badder Pre-?Fill','Live Badder Pre-?Fill',
    'Live Rosin Pre-?Fill','Live Wax Pre-?Fill','High Terpene Extract',
    'Live Hash Rosin','Live Bubble Hash','Crude Bulk Oil','Liquid Shatter',
    'Terpene Infused','Bubble Hash','Fresh Frozen','Live Rosin','Live Crude',
    'Live Badder','Cured Badder','Crude Oil','Pre-?Fill','Terpenes','Infused',
    'Crude','Sugar','seeds','Live','Cured'
  ];
  f text; s text; prev text;
  i int := 0;
begin
  s := btrim(coalesce(p_name,''));
  if s = '' then return null; end if;
  s := regexp_replace(s, '-\s*trim$', '', 'i');   -- "Bananaconda-trim"
  -- Stacked forms exist ("Live Hash Rosin Pre-Fill"), so loop -- but bounded,
  -- because an unbounded loop over a regex is how a parser hangs on one row.
  loop
    i := i + 1; prev := s;
    foreach f in array forms loop
      s := btrim(regexp_replace(s, '\s+' || f || '\s*$', '', 'i'));
    end loop;
    exit when s = prev or i >= 3 or s = '';
  end loop;
  return nullif(s, '');
end;
$$;

comment on function public.f_strip_product_form(text) is
  'Strips a trailing PRODUCT FORM from a name so the strain underneath can be '
  'matched against the Metrc register. Suffix-anchored, longest match first. '
  'Proven by tg_selftest_strain_stripper() -- positive AND negative halves '
  '(rule K2). Built 10 Aug 2026 from the 250 real unmatched strain_library rows, '
  'not from an imagined list.';

--------------------------------------------------- what is not a strain at all
-- Brands and suppliers are read from rows, never hardcoded (rule G1): the Apex
-- brand list and the suppliers table are the authorities.
create or replace function public.f_strain_name_class(p_name text)
returns text
language sql
stable
set search_path to 'public','pg_temp'
as $$
  with n as (select btrim(coalesce(p_name,'')) v)
  select case
    when (select v from n) = '' then 'EMPTY'
    when (select v from n) ~* '^WIP_'                     then 'NOT A STRAIN - work-in-progress item name'
    when (select v from n) ~* '\mWIP\M'                   then 'NOT A STRAIN - work-in-progress item name'
    when (select v from n) ~* '^Sparq[- ]'                then 'NOT A STRAIN - third-party batch code'
    when (select v from n) ~* '^Gummy,'                   then 'NOT A STRAIN - product SKU code'
    when (select v from n) ~* '^(BHO|ETH)\s+\d+(st|nd|rd|th)\s+Pas' then 'NOT A STRAIN - process step'
    when (select v from n) ~* '^(Accumulated|Failed|Mixed|Mixed Rosin|Mixed Trim Crude|Trim/Shake|Hybrid Blend|Diamonds|Liquid Diamond|THCa Isolate Powder|Food Grade Live Rosin)$'
                                                          then 'NOT A STRAIN - process or grade label'
    when exists (select 1 from apex_raw a where a.entity='brands'
                  and lower(btrim(a.payload->>'name')) = lower((select v from n)))
                                                          then 'NOT A STRAIN - our own brand name'
    when lower(replace((select v from n),' ','')) in
         (select lower(replace(btrim(a.payload->>'name'),' ','')) from apex_raw a where a.entity='brands')
                                                          then 'NOT A STRAIN - our own brand name'
    when exists (select 1 from suppliers s
                  where lower(btrim(s.supplier_name)) = lower((select v from n)))
                                                          then 'NOT A STRAIN - a supplier name'
    when (select v from n) ~* '^(DEBUG|END TO END|TEST) '  then 'NOT A STRAIN - test data'
    else null
  end;
$$;

comment on function public.f_strain_name_class(text) is
  'Names a row that is not a strain at all, and says WHY (rule A3). Brands and '
  'suppliers are read from apex_raw and suppliers -- never hardcoded (rule G1).';

---------------------------------------------------------- the ladder, as a view
create or replace view public.v_strain_register_reconciliation as
with base as (
  select l.strain,
         btrim(l.strain)                                   as raw_name,
         public.f_strain_name_class(l.strain)               as not_a_strain,
         public.f_strip_product_form(l.strain)              as stripped
  from strain_library l
), cand as (
  select b.*,
    -- the same name with our cultivation prefix applied, since Metrc registers
    -- ours as "TG <name>" and Apex does not
    case when b.stripped ~* '^TG ' then b.stripped else 'TG ' || b.stripped end as stripped_tg
  from base b
), m as (
  select c.*,
    (select s.name from metrc_strains s
      where lower(btrim(s.name)) = lower(c.raw_name) limit 1)      as hit_exact,
    (select s.name from metrc_strains s
      where lower(btrim(s.name)) = lower(c.stripped) limit 1)      as hit_stripped,
    (select s.name from metrc_strains s
      where lower(btrim(s.name)) = lower(c.stripped_tg) limit 1)   as hit_stripped_tg,
    (select a.payload->'cultivar'->>'name' from apex_raw a
      where a.entity='products' and a.payload->'cultivar'->>'name' is not null
        and lower(btrim(a.payload->'cultivar'->>'name')) = lower(c.stripped)
      limit 1)                                                     as hit_apex
  from cand c
)
select
  raw_name                                                          as strain,
  case
    when not_a_strain is not null                       then 3
    when hit_exact       is not null                    then 1
    when hit_stripped    is not null                    then 2
    when hit_stripped_tg is not null                    then 2
    when hit_apex        is not null                    then 4
    else 5
  end                                                               as rung,
  case
    when not_a_strain    is not null                    then not_a_strain
    when hit_exact       is not null                    then 'REGISTERED STRAIN'
    when hit_stripped    is not null                    then 'STRAIN + PRODUCT FORM'
    when hit_stripped_tg is not null                    then 'STRAIN + PRODUCT FORM (TG prefix applied)'
    when hit_apex        is not null                    then 'CANDIDATE - Apex sells it, Metrc has not registered it'
    else 'UNRESOLVED - needs a person'
  end                                                               as verdict,
  coalesce(hit_exact, hit_stripped, hit_stripped_tg)                as metrc_strain,
  hit_apex                                                          as apex_cultivar,
  stripped                                                          as name_after_stripping,
  case
    when not_a_strain    is not null then 'classified by f_strain_name_class'
    when hit_exact       is not null then 'exact match in metrc_strains'
    when hit_stripped    is not null then 'matched metrc_strains after stripping the product form'
    when hit_stripped_tg is not null then 'matched metrc_strains after stripping the form and applying the TG prefix'
    when hit_apex        is not null then 'no Metrc registration; Apex products carry this cultivar'
    else 'no match in metrc_strains (any form) and no Apex cultivar. Registering it in Metrc, or retiring the row, is an owner decision (rule A5).'
  end                                                               as evidence,
  (not_a_strain is null and coalesce(hit_exact,hit_stripped,hit_stripped_tg) is not null)
                                                                    as publishable_identity
from m;

comment on view public.v_strain_register_reconciliation is
  'Phase 0 of the Strain & Product Library. One row per strain_library entry with '
  'its rung, its verdict and the evidence for it. DERIVES ONLY -- deletes nothing '
  'and mutates nothing, because a row that leaves the library must leave with a '
  'recorded reason (rule K5). Measured 10 Aug 2026: 250 of 272 rows were not '
  'registered strains.';

revoke all on public.v_strain_register_reconciliation from public, anon;
grant select on public.v_strain_register_reconciliation to authenticated;
;
