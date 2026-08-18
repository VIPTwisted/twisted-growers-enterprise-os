/* Material held on purpose is not ageing, and the watcher now owns this.
 *
 * Owner, 18 Aug 2026: "we do not have OLD stock!" and "OS and agents watchers fix and
 * handle."
 *
 * Investigated tag by tag and he is right. Of 80.6 lb the corrected measure called stale:
 *   Quarantine              1 tag   49.66 lb   ON HOLD BY DECISION
 *   Freezer/Biomass Storage 1 tag    9.99 lb   EXTRACTION FEEDSTOCK, frozen on purpose
 *   Fulfillment Vault      11 tags  12.83 lb   the genuine problem, up to 658 days
 *   Raw pre-rolls, various  5 tags   8.16 lb
 *   Infused edible          4 tags       —     404 days, Production Room
 *
 * 59.65 lb of the 80.6 is material somebody DECIDED to hold. Quarantine is a decision.
 * A freezer full of biomass awaiting extraction is a decision. Reporting either as ageing
 * tells the owner his operation is failing at something it is deliberately doing.
 *
 * The genuine finding is small and specific: eleven flower tags in the Fulfillment Vault
 * holding 12.83 lb, the oldest 658 days. That is worth a person looking at. 515.7 lb of
 * imaginary ageing was not.
 *
 * ROOM NOW CARRIES INTENT. A holding room suspends the ageing clock and says why. This is
 * not an exemption to make a number look better — a package in Quarantine is still fully
 * visible, still counted in stock, and still has its age shown. It simply is not called a
 * failure to sell something nobody was trying to sell.
 *
 * AND THE WATCHER OWNS IT. f_check_stock_ageing runs daily, raises one finding for
 * genuinely stale material and one for remnants, and stays silent when there is nothing —
 * so the owner is not the detector.
 */

create table if not exists public.holding_room (
  room       text primary key,
  why_held   text not null,
  suspends_ageing boolean not null default true
);

comment on table public.holding_room is
  'Rooms where material sits by DECISION rather than by neglect. The ageing clock is '
  'suspended in them and the reason is recorded. Quarantine and the biomass freezer held '
  '59.65 lb of the 80.6 lb an earlier check reported as ageing stock. Agent I, 18 Aug 2026.';

insert into public.holding_room (room, why_held, suspends_ageing) values
('Quarantine', 'Material is here because somebody put it on hold — a failed test, a '
  || 'dispute, an investigation. It is not for sale and its age is not a sales failure. '
  || 'One tag holds 49.66 lb.', true),
('Freezer/Biomass Storage', 'Frozen biomass awaiting extraction. Freezing is precisely so '
  || 'it can be held; calling it ageing inverts the purpose of the room.', true),
('Biomass Prep', 'Staging for extraction. Material is mid-process, not sitting unsold.', true)
on conflict (room) do update
  set why_held = excluded.why_held, suspends_ageing = excluded.suspends_ageing;

alter table public.holding_room enable row level security;
drop policy if exists hr_read on public.holding_room;
create policy hr_read on public.holding_room for select to authenticated using (true);
drop policy if exists hr_write on public.holding_room;
create policy hr_write on public.holding_room for all to authenticated
  using ((select public.f_caller_is_admin())) with check ((select public.f_caller_is_admin()));
grant select on public.holding_room to tg_desktop_reader;

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
         when hold.room is not null then 'HELD ON PURPOSE — ' || hold.why_held
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
       end                                                  as remnant_verdict,
       hold.room is not null                                as in_a_holding_room,
       hold.why_held
from public.metrc_packages p
left join public.stock_ageing_policy pol
       on pol.category = coalesce(p.raw#>>'{Item,ProductCategoryName}','(uncategorised)')
left join public.holding_room hold
       on hold.suspends_ageing and hold.room = p.location
where coalesce(p.quantity,0) > 0
  and coalesce(p.finished,false) = false;

comment on view public.v_stock_ageing is
  'Every open package with its own age against its own category policy, and its room. Ages '
  'PER PACKAGE, never per group. Seeds and concentrate do not age. Quarantine and the '
  'biomass freezer suspend the clock because material is there by decision — they held '
  '59.65 lb of the 80.6 lb an earlier check called ageing. Nothing is hidden: a held '
  'package still shows its age and its weight, it is simply not reported as a failure to '
  'sell something nobody was selling. Agent I, 18 Aug 2026.';

grant select on public.v_stock_ageing to tg_desktop_reader;;
