drop view if exists v_stock_on_hand cascade;
create view v_stock_on_hand as
with p as (
  select
    p.license,
    p.raw#>>'{Item,StrainName}' as strain,
    p.raw->>'LabTestingState' as lab_state,
    coalesce(p.location,'(not recorded)') as location,
    p.quantity, p.packaged_on,
    case
      when p.raw#>>'{Item,ProductCategoryName}' ilike '%fresh frozen%' then 'Fresh frozen'
      when p.raw#>>'{Item,ProductCategoryName}' ilike '%bud%'          then 'Dried flower'
      when p.raw#>>'{Item,ProductCategoryName}' ilike '%shake%'
        or p.raw#>>'{Item,ProductCategoryName}' ilike '%trim%'         then 'Shake and trim'
      when p.raw#>>'{Item,ProductCategoryName}' ilike '%concentrate%'  then 'Concentrate'
      when p.raw#>>'{Item,ProductCategoryName}' ilike '%roll%'         then 'Pre-rolls'
      when p.raw#>>'{Item,ProductCategoryName}' ilike '%vape%'         then 'Vape'
      else coalesce(p.raw#>>'{Item,ProductCategoryName}','(uncategorised)')
    end as stream
  from metrc_packages p
  where coalesce(p.quantity,0) > 0
    and coalesce((p.raw->>'IsFinished')::boolean,false) = false
)
select stream, license, lab_state, location,
  count(*) as packages,
  round(sum(quantity)) as grams,
  round(sum(quantity)/453.592, 1) as pounds,
  max(current_date - packaged_on) as oldest_days,
  min(packaged_on) as oldest_packaged,
  count(distinct strain) as strains
from p group by 1,2,3,4 order by sum(quantity) desc;;
