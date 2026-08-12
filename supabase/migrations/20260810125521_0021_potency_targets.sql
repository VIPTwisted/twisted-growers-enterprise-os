-- ---------------------------------------------------------------------------
-- 0021 — Potency targets on the company's OWN product lines, owner-managed.
--
-- Owner, 10 Aug 2026:
--   "ALL FLOWER OVER 30% THC ... WE WILL HAVE ADD HUMAN FOR ALL AND CHANGE AS NEEDED"
--   "WE ONLY TRACK OURS NOT THIRD PARTY PURCHASED"
--   "WE TRACK SEPERATELY FLOWER 3.5G, BULK, INFUSED PRE-ROLLS (ECONOMY),
--    PRE-ROLLS (ECONOMY), INFUSED PRE-ROLLS (PREMIUM), PRE-ROLLS (PREMIUM),
--    VAPES, CONCENTRATES"
--   "ALSO MAKE SURE IT HAVE FILTERS BY STRAIN, DATE ETC"
--
-- THE CATEGORIES ARE HIS, NOT METRC'S. Metrc has ONE "Raw Pre-Rolls" bucket; this
-- business runs four pre-roll lines at different price points, and averaging them
-- hides the difference that matters.
--
-- ONLY THE STATED TARGET IS SEEDED. The rest are 'awaiting_target' with NO number,
-- deliberately -- an invented benchmark in front of the people measured by it is
-- the 130 g/plant mistake, and the phantom 796.9 lb shortfall earlier in this
-- same audit.
-- ---------------------------------------------------------------------------

create table if not exists potency_target (
  category        text not null,
  analyte         text not null default 'Total THC',
  target_min      numeric,
  target_max      numeric,
  stretch_min     numeric,
  unit            text not null default '%',
  sort_order      integer not null default 100,
  status          text not null default 'awaiting_target'
                  check (status in ('active','awaiting_target','retired')),
  set_by          text,
  set_on          date,
  note            text,
  updated_at      timestamptz not null default now(),
  primary key (category, analyte),
  constraint active_target_has_a_number_and_an_author
    check (status <> 'active'
           or (set_by is not null and set_on is not null
               and (target_min is not null or target_max is not null))),
  constraint min_below_max
    check (target_min is null or target_max is null or target_min <= target_max)
);

comment on table potency_target is
  'Owner-managed potency targets on the company''s OWN product lines. status '
  'awaiting_target means NO number ON PURPOSE -- nobody may invent one. An active '
  'target must name its author and date. Targets measure OUR material only.';

insert into potency_target (category, analyte, target_min, sort_order, status, set_by, set_on, note) values
 ('Flower 3.5g','Total THC', 30.0, 10, 'active','owner (Vinny)','2026-08-10',
  'Owner-stated: "ALL FLOWER OVER 30% THC". Above the 2026 mean of 27.67%, so a stretch target by design.'),
 ('Bulk Flower','Total THC', 30.0, 20, 'active','owner (Vinny)','2026-08-10',
  'Owner-stated "ALL FLOWER" -- applied to both flower lines. Change either independently if they should differ.')
on conflict (category, analyte) do update set
  target_min=excluded.target_min, sort_order=excluded.sort_order, status=excluded.status,
  set_by=excluded.set_by, set_on=excluded.set_on, note=excluded.note, updated_at=now();

insert into potency_target (category, analyte, sort_order, status, note) values
 ('Pre-Rolls (Economy)','Total THC',        30,'awaiting_target','No target stated. Economy line uses trim.'),
 ('Infused Pre-Rolls (Economy)','Total THC',40,'awaiting_target','No target stated.'),
 ('Pre-Rolls (Premium)','Total THC',        50,'awaiting_target','No target stated.'),
 ('Infused Pre-Rolls (Premium)','Total THC',60,'awaiting_target','No target stated.'),
 ('Vapes','Total THC',                      70,'awaiting_target','No target stated. Concentrate scale, not flower scale.'),
 ('Concentrates','Total THC',               80,'awaiting_target','No target stated. Concentrate scale, not flower scale.'),
 ('Shake / Trim','Total THC',               90,'awaiting_target','No target stated. Feeds economy pre-rolls and manufacturing.'),
 ('Flower 3.5g','Total CBD',                11,'awaiting_target','No target stated.'),
 ('Bulk Flower','Total CBD',                21,'awaiting_target','No target stated.')
on conflict (category, analyte) do nothing;

alter table potency_target enable row level security;
drop policy if exists potency_target_read on potency_target;
create policy potency_target_read on potency_target for select to authenticated using (true);
drop policy if exists potency_target_write on potency_target;
create policy potency_target_write on potency_target for all to authenticated
  using (is_executive()) with check (is_executive());
grant select, insert, update, delete on potency_target to authenticated;


create or replace function f_product_line(p_item text, p_category text, p_test_name text)
returns text language sql immutable as $$
  select case
    when p_test_name ilike '%Inhalable Concentrate%' or p_category ilike '%Concentrate%' then
      case when p_item ilike '%vape%' or p_item ilike '%cart%' or p_category ilike '%Vape%'
           then 'Vapes' else 'Concentrates' end
    when p_category ilike '%Vape%' then 'Vapes'
    when p_category ilike '%Pre-Roll%' or p_item ilike '%pre%roll%' then
      case
        when (p_category ilike '%Infused%' or p_item ilike '%infused%')
             and (p_item ilike '%econom%' or p_item ilike '%value%') then 'Infused Pre-Rolls (Economy)'
        when  p_category ilike '%Infused%' or p_item ilike '%infused%'  then 'Infused Pre-Rolls (Premium)'
        when  p_item ilike '%econom%' or p_item ilike '%value%'         then 'Pre-Rolls (Economy)'
        else 'Pre-Rolls (Premium)'
      end
    when p_category ilike '%Shake%' or p_category ilike '%Trim%' then 'Shake / Trim'
    when p_category ilike '%Bud%' or p_test_name ilike '%Raw Plant Material%' then
      case when p_item ~* '(3\.5\s*g|eighth|1/8)' then 'Flower 3.5g' else 'Bulk Flower' end
    else coalesce(nullif(p_category,''),'(uncategorised)')
  end
$$;

comment on function f_product_line(text,text,text) is
  'Maps a lab result to the owner''s product lines. Metrc has ONE Raw Pre-Rolls '
  'bucket for four lines at different price points, so economy/premium is read '
  'from the item text -- the same place strain lives when the column is blank.';


-- ROW LEVEL, so the UI can filter by strain, date, line, lab, licence.
create or replace view v_potency_results as
select r.package_tag,
       r.item,
       f_strain_from_item(r.item)                              as strain,
       f_product_line(r.item, r.category, r.test_name)          as product_line,
       r.category                                               as metrc_category,
       r.packaged_licence                                       as licence,
       r.lab_facility                                           as lab,
       r.test_date,
       extract(year  from r.test_date)::int                     as yr,
       to_char(r.test_date, 'YYYY-MM')                          as month,
       extract(quarter from r.test_date)::int                   as quarter,
       r.test_name,
       r.result                                                 as pct,
       r.overall_passed,
       r.source_harvests,
       t.target_min,
       t.status                                                 as target_status,
       t.set_by                                                 as target_set_by,
       case when t.target_min is null then null
            else (r.result >= t.target_min) end                 as hits_target,
       case when t.target_min is null then 'no target set'
            when r.result >= t.target_min then 'at or above target'
            else 'below target' end                             as target_verdict
from metrc_rpt_lab_results r
left join potency_target t
       on t.category = f_product_line(r.item, r.category, r.test_name)
      and t.analyte  = 'Total THC'
/* OURS ONLY -- the owner's rule. Bought-in material is somebody else's grow;
   measuring our people against it is unfair in both directions. */
where f_is_ours(r.packaged_licence)
  and r.test_name ilike '%Total THC%'
  and r.result is not null;

comment on view v_potency_results is
  'One row per Total THC result on OUR OWN material, with strain, product line, '
  'lab, date parts and the owner target. Filter by any of them.';


create or replace view v_potency_vs_target as
select product_line                                       as category,
       'Total THC'::text                                  as analyte,
       yr,
       coalesce(max(target_status),'not registered')      as target_status,
       max(target_min)                                    as target_min,
       max(target_set_by)                                 as target_set_by,
       count(*)                                           as tests,
       count(distinct strain)                             as strains,
       round(avg(pct)::numeric,2)                         as mean_pct,
       round((percentile_cont(0.5) within group (order by pct))::numeric,2) as median_pct,
       round(min(pct)::numeric,2)                         as min_pct,
       round(max(pct)::numeric,2)                         as max_pct,
       count(*) filter (where hits_target)                as at_or_above_target,
       case when max(target_min) is null then null
            else round(100.0*count(*) filter (where hits_target)/count(*),1) end as pct_hitting_target,
       case when max(target_min) is null
              then 'NO TARGET SET — ' || coalesce(max(target_status),'category not registered')
            else 'target ' || max(target_min) || '% set by ' || coalesce(max(target_set_by),'?') end as verdict
from v_potency_results
group by 1,2,3;

comment on view v_potency_vs_target is
  'Potency against the owner-set target, OUR MATERIAL ONLY. Where no target is set '
  'the row says so rather than scoring against an invented number.';

grant select on v_potency_results, v_potency_vs_target to authenticated;
grant execute on function f_product_line(text,text,text) to authenticated;
;
