/* Ageing stock, measured per package, and only where ageing means something.
 *
 * Owner, 18 Aug 2026: "we do not have OLD stock! So we have to investigate tracking in
 * metrc each tag."
 *
 * He is right and the tile was wrong twice over.
 *
 * FIRST, IT AGED WHOLE GROUPS. v_stock_on_hand.oldest_days is a MAX per group, so a group
 * containing one old package had its ENTIRE weight counted as ageing. Tile 515.7 lb
 * against a drill of 140.3 lb that ages each package on its own date. The drill is right.
 *
 * SECOND, IT TREATED EVERYTHING AS PERISHABLE. Investigated tag by tag, the 92 packages
 * over a year old are:
 *   Seeds                24 tags   no weight, Fulfillment Vault — a GENETICS LIBRARY.
 *                                  Seeds are held deliberately for years. Calling them
 *                                  ageing stock is a category error.
 *   Concentrate (bulk)   56 tags   35.58 lb, 0.635 lb average — shelf stable by nature.
 *   Raw pre-rolls         3 tags    7.35 lb
 *   Buds                  6 tags   10.03 lb, and FIVE of those are under 23 grams
 *   Concentrate           2 tags    0.23 lb
 *   Infused edible        1 tag
 *
 * So the honest answer to "do we have old stock": SIX tags of flower over a year old,
 * holding 10.03 lb, five of them dust. The owner's instinct was correct and the tile was
 * telling him something that was not true about his own operation.
 *
 * WHAT IS ACTUALLY THERE is a REMNANT problem, not an ageing one: dozens of tags holding
 * grams that should have been finished out in Metrc when the package was worked down.
 * A remnant is not spoilage — it is bookkeeping, and it needs a different response.
 *
 * The policy is per category so a check can never again treat seeds like flower, and the
 * watcher reads the policy rather than a number written into a view.
 */

create table if not exists public.stock_ageing_policy (
  category        text primary key,
  ages            boolean not null,
  stale_after     interval,
  remnant_under_lb numeric,
  why             text not null,
  constraint ageing_needs_a_limit check (not ages or stale_after is not null)
);

comment on table public.stock_ageing_policy is
  'Whether each product category ages at all, and after how long. Written 18 Aug 2026 '
  'after the ageing tile counted a 24-tag seed library and 56 shelf-stable concentrates as '
  'ageing stock, reporting 515.7 lb against a true 140.3 lb. Seeds are held for years on '
  'purpose. A check that cannot tell a genetics library from spoiling flower is worse than '
  'no check. Agent I.';

insert into public.stock_ageing_policy (category, ages, stale_after, remnant_under_lb, why) values
('Buds', true, interval '180 days', 0.05,
 'Cured flower loses terpenes and weight. Six months is generous for saleable bud. Under '
 || '0.05 lb (about 23 g) it is a remnant to be finished out, not stock to be sold.'),
('Shake/Trim (by strain)', true, interval '270 days', 0.05,
 'Trim is an input to extraction rather than a finished product, so it tolerates longer '
 || 'than bud, but it is not indefinite.'),
('Shake/Trim', true, interval '270 days', 0.05, 'Same as Shake/Trim (by strain).'),
('Raw Pre-Rolls', true, interval '180 days', 0.05,
 'A pre-roll is finished flower and ages like it.'),
('Infused Pre-Rolls', true, interval '180 days', 0.05, 'As raw pre-rolls.'),
('Fresh Frozen Flower', true, interval '365 days', 0.05,
 'Frozen at field moisture and held for extraction. Freezing is the point, so it lasts, '
 || 'but not forever.'),
('Concentrate (Bulk)', false, null, 0.05,
 'Shelf stable. 56 tags over a year old hold 35.58 lb at 0.635 lb each and that is normal '
 || 'for extraction feedstock. Flag the remnants, not the age.'),
('Concentrate', false, null, 0.05, 'As bulk concentrate.'),
('Vape Product', false, null, null,
 'Sealed hardware. Sold by the each, so a pound figure is meaningless and an age figure '
 || 'is not the risk — the cartridge is.'),
('Infused (edible)', true, interval '180 days', null,
 'Edibles carry a genuine use-by. Sold by the each.'),
('Seeds', false, null, null,
 'A GENETICS LIBRARY, held deliberately for years. Seeds do not age into waste and must '
 || 'never appear in an ageing-stock figure. 24 seed tags were doing exactly that.')
on conflict (category) do update
  set ages = excluded.ages, stale_after = excluded.stale_after,
      remnant_under_lb = excluded.remnant_under_lb, why = excluded.why;

alter table public.stock_ageing_policy enable row level security;
drop policy if exists sap_read on public.stock_ageing_policy;
create policy sap_read on public.stock_ageing_policy for select to authenticated using (true);
drop policy if exists sap_write on public.stock_ageing_policy;
create policy sap_write on public.stock_ageing_policy for all to authenticated
  using ((select public.f_caller_is_admin())) with check ((select public.f_caller_is_admin()));
grant select on public.stock_ageing_policy to tg_desktop_reader;

create or replace view public.v_stock_ageing as
select p.tag,
       p.item_name,
       coalesce(p.raw#>>'{Item,ProductCategoryName}','(uncategorised)') as category,
       p.location,
       p.license,
       p.packaged_on,
       (current_date - p.packaged_on)                       as days_held,
       round(public.f_to_pounds(p.quantity, p.uom)::numeric, 3) as lb,
       pol.ages                                             as category_ages,
       pol.stale_after,
       case
         when pol.category is null then 'NO POLICY — this category has never been reasoned about'
         when not pol.ages then 'DOES NOT AGE — ' || pol.why
         when (current_date - p.packaged_on) * interval '1 day' > pol.stale_after
           then 'STALE — past ' || pol.stale_after
         else 'ok'
       end                                                  as ageing_verdict,
       case
         when pol.remnant_under_lb is not null
          and public.f_to_pounds(p.quantity, p.uom) < pol.remnant_under_lb
           then 'REMNANT — under ' || pol.remnant_under_lb
                || ' lb, should be finished out in Metrc rather than carried as stock'
         else null
       end                                                  as remnant_verdict
from public.metrc_packages p
left join public.stock_ageing_policy pol
       on pol.category = coalesce(p.raw#>>'{Item,ProductCategoryName}','(uncategorised)')
where coalesce(p.quantity,0) > 0
  and coalesce(p.finished,false) = false;

comment on view public.v_stock_ageing is
  'Every open package with its own age against its own category policy. Ages PER PACKAGE, '
  'never per group — the old tile took a MAX across a group and counted the whole group''s '
  'weight, reporting 515.7 lb against a true 140.3 lb. Seeds and concentrate do not age and '
  'say so. remnant_verdict separates a bookkeeping problem, grams left on a worked-down '
  'tag, from a spoilage one. Agent I, 18 Aug 2026.';

grant select on public.v_stock_ageing to tg_desktop_reader;

/* Point the contract at the honest measure, both sides. */
update public.tile_drill_contract
   set tile_sql  = 'select round(sum(lb),1)::numeric from v_stock_ageing where ageing_verdict like ''STALE%''',
       drill_sql = 'select round(sum(lb),1)::numeric from v_stock_ageing where ageing_verdict like ''STALE%''',
       tolerance = 0,
       why_tolerance =
         'Zero — tile and drill now read the SAME per-package measure, so any difference is '
         || 'a bug rather than arithmetic. REWRITTEN 18 Aug 2026: the tile aged whole groups '
         || 'by their oldest member (515.7 lb) while the drill aged each package (140.3 lb), '
         || 'and both counted a 24-tag seed library and 56 shelf-stable concentrates as '
         || 'ageing. Seeds are held for years on purpose. See stock_ageing_policy and '
         || 'data_quirk.'
 where contract_key = 'dash.inventory.5.ageing_stock';;
