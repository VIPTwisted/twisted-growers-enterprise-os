-- ---------------------------------------------------------------------------
-- 0036 — THE LICENCE IS THE LEGAL ENTITY. THE COMPANY NAME IS NOT.
--
-- Owner ruling, 10 Aug 2026: "one company under multiple licenses -- all their own
-- entity legally and for tax purposes."
--
-- THIS INVERTS AN EARLIER NOTE OF MINE. I described Solar Therapeutics appearing
-- under two licences as a nuisance that "any grouping by name will split". That
-- was backwards. The split is CORRECT. Grouping by NAME is the error, because it
-- merges separate legal and tax entities into one.
--
-- IT APPLIES TO US MOST OF ALL. MC281714 and MP281909 are two legal entities, so
-- the 1,214.0 lb of 2024 "affiliated transfers" are not merely internal logistics
-- -- they are transactions BETWEEN TWO ENTITIES, with cost-basis and 280E
-- consequences. "Not a sale to a customer" and "not a transaction" are different
-- statements and only the first is true.
--
-- FOUR COMPANIES SPAN TWO LICENCES in current inventory: Twisted Growers
-- (752 tags, 1,702.92 lb), Jushi MA (20, 180.69), LC Square (8, 82.64) and Solar
-- Therapeutics (12, 39.48). Name-grouping would collapse eight entities into four.
-- Solar Therapeutics also appears under TWO SPELLINGS, so a name join would both
-- merge entities and fail to match them consistently.
-- ---------------------------------------------------------------------------

create or replace view v_legal_entity as
with seen as (
  select coalesce(nullif(p.raw->>'ItemFromFacilityLicenseNumber',''),'(none)') as licence,
         coalesce(nullif(p.raw->>'ItemFromFacilityName',''),'(none)')          as name_seen,
         count(*)                                                             as tags,
         sum(case when f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
                  then f_to_pounds((p.raw->>'Quantity')::numeric,
                       coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams')) end) as lb
  from metrc_packages p
  where coalesce((p.raw->>'Quantity')::numeric,0) > 0
  group by 1,2
)
select s.licence                                          as entity_licence,
       string_agg(distinct s.name_seen, ' | ')             as names_seen,
       count(distinct s.name_seen)                         as spellings,
       case when s.licence like 'MC%' then 'Cultivator'
            when s.licence like 'MP%' then 'Product Manufacturer'
            when s.licence like 'MR%' or s.licence like 'MRN%' then 'Retailer'
            when s.licence like 'MT%' then 'Transporter'
            when s.licence like 'MB%' then 'Microbusiness'
            when s.licence like 'IL%' then 'Independent Laboratory'
            when s.licence like 'RMD%' then 'Registered Medical Dispensary'
            else 'other' end                               as licence_type,
       f_is_ours(s.licence)                                as is_ours,
       sum(s.tags)                                         as tags_on_hand,
       round(sum(s.lb)::numeric,2)                         as lb_on_hand,
       /* How many OTHER licences share this entity's name -- the merge risk. */
       (select count(distinct t.licence) - 1
          from seen t
         where t.name_seen in (select u.name_seen from seen u where u.licence = s.licence))
                                                           as sibling_licences_same_name
from seen s
group by s.licence;

comment on view v_legal_entity is
  'ONE ROW PER LICENCE, because THE LICENCE IS THE LEGAL AND TAX ENTITY -- owner '
  'ruling 10 Aug 2026. A company name may span several licences (Twisted Growers, '
  'Jushi MA, LC Square and Solar Therapeutics all do), so grouping by name merges '
  'separate entities. sibling_licences_same_name counts how many other licences '
  'share this one''s name -- anything above zero is a merge risk. spellings > 1 '
  'means the name is not even stable within one entity.';

grant select on v_legal_entity to authenticated;
;
