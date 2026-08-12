-- Agent I (Database COO), 12 Aug 2026. DBI-053.
-- OWNER: "these do not drill down correctly and the message is wrong fully flawed."
--
-- DEFECT 1 - ONE ROOM, TWO NAMES. The tile calls it F1. Metrc calls it "Flower Room #1". The
-- counts prove they are the same room: F1 = 1,022 and Flower Room #1 = 1,022 veg-or-flowering;
-- F3 = 1,140 = Flower Room #3; F4 = 1,050 = Flower Room #4. The TILE resolves the mapping
-- internally. The DRILL does not - it asks metrc_plants for a room literally named "F1", gets
-- nothing, and prints a confident explanation OF the nothing: "an empty room between cycles is
-- the normal state after a pull." A wrong number is bad. A wrong number wearing a reassuring
-- explanation is worse, because it stops the reader looking.
--
-- DEFECT 2 - VAULTS REPORTING PLANTS. Fulfillment Vault 1,577 "plants", Cure Vault 1,067,
-- Pre Trim Storage 1,020, Dry Room #2 975. Metrc holds plants in exactly SIX locations - Flower
-- Room #1-#4, Vegetation Room, Mother Room - and no vault is one of them. Those figures are
-- harvest-derived counts wearing the word "plants". is_flower_room was true for a vault.
--
-- WHY A TABLE AND NOT A CASE STATEMENT. An alias buried in a view is invisible to the next
-- agent, so the next surface re-invents it and drifts. Owner's standing rule: a correction holds
-- for every agent now and in future. Anything translating our name to Metrc's joins THIS table.
--
-- APPEND ONLY: columns 1-21 keep their names, order and types (create-or-replace forbids
-- otherwise); is_flower_room stays but is now CORRECT; three columns appended at the end.
-- UNDO: drop view v_room_board_complete and restore from rearrangeable_widgets_and_every_room_board;
--       drop table room_alias.

create table if not exists room_alias (
  our_name     text primary key,
  metrc_name   text not null,
  holds_plants boolean not null default false,
  why          text not null,
  set_by       text not null default 'Agent I',
  set_at       timestamptz not null default now()
);

alter table room_alias enable row level security;
drop policy if exists ra_read  on room_alias;
drop policy if exists ra_write on room_alias;
create policy ra_read  on room_alias for select to authenticated using (true);
create policy ra_write on room_alias for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

comment on table room_alias is
 'Our room name to Metrc''s room name, plus whether Metrc holds PLANTS there at all. Built 12 Aug '
 '2026 after a tile reading "F1 - 1,022 plants" drilled into "No plants recorded in F1": the tile '
 'knew F1 means Flower Room #1 and the drill did not. holds_plants=false means a plant count for '
 'that room is meaningless by definition - Metrc keeps plants in six rooms and no vault is one.';

insert into room_alias (our_name, metrc_name, holds_plants, why) values
 ('F1','Flower Room #1', true,  'Verified by count 12 Aug 2026: F1 tile 1,022 = Flower Room #1 veg-or-flowering 1,022.'),
 ('F2','Flower Room #2', true,  'Between cycles - 0 standing plants today. Genuine empty state, not a naming failure.'),
 ('F3','Flower Room #3', true,  'Verified by count: 1,140 = 1,140.'),
 ('F4','Flower Room #4', true,  'Verified by count: 1,050 = 1,050.'),
 ('Veg A','Vegetation Room', true, 'Vegetative stage. 1,818 plant records, 0 currently veg-or-flowering state.'),
 ('Mother','Mother Room',   true, 'Mother stock, 33 standing.'),
 ('Fulfillment Vault','Fulfillment Vault', false, 'Post-harvest. Metrc holds no plants here; the 1,577 previously shown was a harvest-derived count mislabelled as plants.'),
 ('Cure Vault','Cure Vault', false, 'Post-harvest cure. 1,067 shown was not plants.'),
 ('Pre Trim Storage Room','Pre Trim Storage Room', false, 'Post-harvest, awaiting trim. 1,020 shown was not plants.'),
 ('Dry Room #2','Dry Room #2', false, 'Drying. Material on racks, never standing plants. 975 shown was not plants.'),
 ('Dry Room #1','Dry Room #1', false, 'Drying.'),
 ('Finish Vault','Finish Vault', false, 'Finished goods.'),
 ('Freezer/Biomass Storage','Freezer/Biomass Storage', false, 'Fresh frozen and biomass.'),
 ('Shipping & Receiving','Shipping & Receiving', false, 'In transit.'),
 ('Hydrocarbon','Hydrocarbon', false, 'Extraction.'),
 ('Solventless','Solventless', false, 'Extraction.'),
 ('Packaging Room','Packaging Room', false, 'Packaging.'),
 ('Production Room','Production Room', false, 'Production.'),
 ('Biomass Prep','Biomass Prep', false, 'Biomass preparation.')
on conflict (our_name) do nothing;

create or replace view public.v_room_board_complete as
with held as (
  select o.room,
         max(o.department) as department, max(o.room_role) as room_role, max(o.licence) as licence,
         round(sum(o.lb),1) as lb_held, sum(o.tags) as tags_held, sum(o.units) as units_held,
         round(sum(o.lb) filter (where o.ownership not ilike '%our%'),1) as third_party_lb,
         sum(o.failed) as failed_tags, sum(o.no_coa) as tags_without_coa,
         count(distinct o.category) as categories
  from v_onhand_by_room_stage o group by o.room
),
standing as (
  select coalesce(nullif(p.raw->>'LocationName',''),'(none)') as metrc_location,
         count(*) filter (where p.source_state in ('vegetative','flowering'))::numeric as plants_standing,
         count(distinct p.raw->>'StrainName')
           filter (where p.source_state in ('vegetative','flowering'))::text as strains_standing
  from metrc_plants p group by 1
)
select coalesce(h.room, r.room)                                       as room,
       coalesce(h.department, 'UNASSIGNED')                           as department,
       coalesce(h.room, r.room) || ' — ' || coalesce(h.department,'UNASSIGNED') as room_qualified,
       coalesce(h.room_role, r.room_type, 'Unclassified')             as room_role,
       h.licence                                                      as licence,
       coalesce(a.holds_plants, false)                                as is_flower_room,
       case when coalesce(a.holds_plants,false) then s.plants_standing end   as plants_now,
       case when coalesce(a.holds_plants,false) then s.strains_standing end  as strains_now,
       r.cycle_days, r.next_event, r.next_event_date, r.days_until,
       h.lb_held, h.tags_held, h.units_held, h.third_party_lb,
       h.failed_tags, h.tags_without_coa, h.categories,
       case
         when coalesce(a.holds_plants,false) and r.days_until is not null and r.days_until < 0
              then 'OVER — ' || abs(r.days_until)::int || ' days past'
         when coalesce(a.holds_plants,false) and r.days_until is not null and r.days_until <= 7
              then 'PULLING — ' || r.days_until::int || ' days'
         when coalesce(a.holds_plants,false) and coalesce(s.plants_standing,0) > 0 then 'ON PLAN'
         when coalesce(a.holds_plants,false)                                       then 'TURNING'
         when coalesce(h.lb_held,0) > 0                                            then 'HOLDING STOCK'
         else 'EMPTY'
       end                                                            as state,
       case when coalesce(h.failed_tags,0) > 0 then 'bad'
            when coalesce(a.holds_plants,false) and r.days_until is not null and r.days_until < 0 then 'bad'
            when coalesce(a.holds_plants,false) and r.days_until is not null and r.days_until <= 7 then 'watch'
            else 'good' end                                           as tone,
       -- appended 12 Aug 2026, DBI-053
       a.metrc_name                                                   as metrc_room_name,
       coalesce(a.holds_plants, false)                                as room_holds_plants,
       case when not coalesce(a.holds_plants,false) then
              'Metrc holds no plants in this room by design — it is a ' ||
              lower(coalesce(h.room_role, r.room_type, 'post-harvest area')) ||
              '. Material here is tracked by package tag, not by plant.'
            when coalesce(s.plants_standing,0) = 0 then
              'Metrc shows no vegetative or flowering plant in ' || a.metrc_name ||
              ' right now — an empty room between cycles is the normal state after a pull.'
       end                                                            as why_no_plants
from held h
full join v_room_board r on r.room = h.room
left join room_alias  a on a.our_name = coalesce(h.room, r.room)
left join standing    s on s.metrc_location = a.metrc_name;

comment on view public.v_room_board_complete is
 'EVERY room, department-qualified (J7), carrying metrc_room_name so a DRILL can find the plants '
 'the TILE counted. Before 12 Aug 2026 a tile read "F1 — 1,022 plants" and its drill read "no '
 'plants recorded in F1", because Metrc calls that room Flower Room #1. plants_now is NULL (not '
 'zero) where Metrc holds no plants by design, and why_no_plants states which of the two reasons '
 'applies. is_flower_room now comes from room_alias.holds_plants — it previously flagged '
 'Fulfillment Vault as a flower room holding 1,577 plants.';;
