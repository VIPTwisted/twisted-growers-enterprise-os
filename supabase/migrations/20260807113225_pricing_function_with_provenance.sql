/* ONE PLACE THAT ANSWERS "WHAT IS A POUND OF THIS WORTH"
   ------------------------------------------------------
   782 findings are open and 22 carry a dollar value, so nothing can be ranked
   worst-first. Most findings carry POUNDS. This turns pounds into dollars in
   one place, so every page uses the same number and every figure can say where
   it came from.

   Order of preference, best evidence first:
     1. Real transacted price per pound, from what we actually sold
     2. The rate in the standards register
     3. Nothing - and it says so rather than guessing

   Real prices are NOT available yet. The transfer exports carry a price but
   their quantity units were never mapped (shipped_uom is null on all 18,196
   rows), and joining price-at-transfer to the package's CURRENT remaining
   quantity gives nonsense - it produced $61,815 a pound for Buds, which is how
   the error was caught. When the mapping agent fills those units this function
   starts using real prices automatically. Nothing else has to change.

   A sanity band rejects any rate outside $50-$5,000 a pound. A price that
   absurd is a units bug, and a units bug must never be allowed to price a
   finding. */

create or replace function f_price_per_lb(p_category text)
returns table (rate numeric, basis text)
language plpgsql stable set search_path = public as $$
declare v_rate numeric; v_basis text; c text := lower(coalesce(p_category,''));
begin
  -- 1. real transacted price, when the units exist to compute it
  select round(sum(t.shipper_wholesale_price)/nullif(sum(f_to_pounds(t.shipped_qty, t.shipped_uom)),0),2)
    into v_rate
  from metrc_rpt_package_transfers t
  where t.shipper_wholesale_price > 0
    and t.shipped_uom is not null
    and f_is_weight(t.shipped_uom)
    and lower(coalesce(t.category,'')) = c;

  if v_rate is not null and v_rate between 50 and 5000 then
    return query select v_rate, 'measured — what we actually sold this category for'::text;
    return;
  end if;

  -- 2. the standards register
  if c like '%bud%' or c like '%flower%' then
    v_rate := f_rule_at('target_cost_per_lb'); v_basis := 'standards register — flower rate';
  elsif c like '%trim%' or c like '%shake%' then
    v_rate := 300; v_basis := 'standards register — trim rate';
  elsif c like '%fresh%' or c like '%frozen%' or c like '%biomass%' then
    v_rate := 119.77; v_basis := 'standards register — fresh frozen rate';
  elsif c like '%concentrate%' or c like '%rosin%' or c like '%vape%' then
    v_rate := f_rule_at('target_cost_per_lb'); v_basis := 'standards register — flower rate used as a stand-in; no concentrate rate is recorded';
  else
    v_rate := f_rule_at('target_cost_per_lb'); v_basis := 'standards register — general rate, category not recognised';
  end if;

  if v_rate is null or v_rate not between 50 and 5000 then
    return query select null::numeric, 'NO RATE AVAILABLE — this cannot be priced and must not be guessed'::text;
  else
    return query select v_rate, v_basis || ' (ESTIMATE, not a transacted price)';
  end if;
end $$;

grant execute on function f_price_per_lb(text) to authenticated;

/* Findings priced, with the basis attached to every figure. */
create or replace view v_findings_priced as
select f.*,
       coalesce(f.dollars, (select rate from f_price_per_lb(f.department) limit 1) * f.pounds) as value_dollars,
       case when f.dollars is not null then 'valued by the agent that raised it'
            when f.pounds is not null then (select basis from f_price_per_lb(f.department) limit 1)
            else 'CANNOT BE PRICED — no dollars and no pounds recorded' end as value_basis,
       (f.dollars is null and f.pounds is null) as unpriceable
from v_findings f;

grant select on v_findings_priced to authenticated;

comment on function f_price_per_lb(text) is
  'What a pound of a category is worth, and where that number came from. Prefers real transacted prices; falls back to the register; refuses to guess. Rejects anything outside $50-$5,000 as a units bug.';;
