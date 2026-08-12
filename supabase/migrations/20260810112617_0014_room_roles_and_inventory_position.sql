-- ---------------------------------------------------------------------------
-- 0014 — What is in every room, and what it MEANS.
--
-- WHY. Metrc's harvest CurrentWeight is wet - waste - packaged. It is a RESIDUAL,
-- not a measurement, and it carries evaporated water forever. Company-wide it
-- reads 29,412 lb against 2,554.7 lb of physical inventory: a 65% dry yield,
-- which does not exist. Read literally it overstates held flower by ~12x.
--
-- A second trap: the room on a harvest is DryingLocationName -- a label that does
-- not move with the material. Only PACKAGES carry a location that moves. So
-- "what is in room X" must come from packages, and held-but-unpackaged product
-- must come from OPEN harvests only.
--
-- Room ROLE is business practice, not data. It was supplied by the owner and is
-- recorded with attribution. Anything he has not confirmed is marked unconfirmed
-- and must not be presented as fact.
-- ---------------------------------------------------------------------------

create table if not exists room_roles (
  room_name     text primary key,
  role          text not null,
  holds_product boolean not null default true,
  is_drying     boolean not null default false,
  stage         text,
  confirmed_by  text,
  confirmed_on  date,
  note          text
);

comment on table room_roles is
  'What each Metrc location is FOR. Business practice, not derivable from data. '
  'confirmed_by names who said so; NULL means nobody has confirmed it and it '
  'must be shown as unconfirmed rather than asserted.';

insert into room_roles (room_name, role, holds_product, is_drying, stage, confirmed_by, confirmed_on, note) values
  ('Flower Room #1','Flowering canopy',          false,false,'cultivation','owner','2026-08-10','Live plants, not weight'),
  ('Flower Room #2','Flowering canopy',          false,false,'cultivation','owner','2026-08-10','Live plants, not weight'),
  ('Flower Room #3','Flowering canopy',          false,false,'cultivation','owner','2026-08-10','Live plants, not weight'),
  ('Flower Room #4','Flowering canopy',          false,false,'cultivation','owner','2026-08-10','Live plants, not weight'),
  ('Mother Room','Mother stock',                 false,false,'cultivation','owner','2026-08-10','Live plants, not weight'),
  ('Dry Room #1','Drying',                       true, true, 'post-harvest','owner','2026-08-10','Water leaves here'),
  ('Dry Room #2','Drying',                       true, true, 'post-harvest','owner','2026-08-10','Water leaves here'),
  ('Pre Trim Storage Room','Dried, awaiting trim',true,false,'post-harvest','owner','2026-08-10',
     'Owner: finished harvest, dried, going into trim process. Product, not water.'),
  ('Pre-Trim Storage','Dried, awaiting trim',    true, false,'post-harvest','owner','2026-08-10',
     'Manufacturing-side spelling of the same role.'),
  ('Packaging Room','Staged for packaging',      true, false,'packaging','owner','2026-08-10',
     'Owner: weight to be packaged as 3.5g flower jars and pre-rolls.'),
  ('Fulfillment Vault','Bulk flower and outbound',true,false,'storage','owner','2026-08-10',
     'Owner: could be bulk flower.'),
  ('Finish Vault','Finished goods',              true, false,'finished','owner','2026-08-10',
     'Jars, pre-rolls, vapes, edibles ready for sale.'),
  ('Freezer/Biomass Storage','Fresh frozen and biomass',true,false,'storage','owner','2026-08-10',
     'Fresh frozen never dries. Residual here is ~2%, which is the control that '
     'proves the residual elsewhere is evaporation.'),
  ('Cure Vault','Curing / bulk storage',         true, false,'post-harvest',null,null,
     'UNCONFIRMED. Owner asked whether this is the drying room; he has not yet said. '
     'Carries 8,462 lb of harvest residual and ZERO packages.'),
  ('Hydrocarbon','Extraction — hydrocarbon',     true, false,'manufacturing',null,null,'Inferred from contents.'),
  ('Solventless','Extraction — solventless',     true, false,'manufacturing',null,null,'Inferred from contents.'),
  ('Production Room','Production / infusion',    true, false,'manufacturing',null,null,'Inferred from contents.'),
  ('Biomass Prep','Biomass preparation',         true, false,'manufacturing',null,null,'Inferred from contents.'),
  ('BDA/Storage Room','Storage',                 true, false,'storage',null,null,'Inferred from contents.'),
  ('Quarantine','Quarantine hold',               true, false,'hold',null,null,'Inferred from name.'),
  ('Shipping & Receiving','In transit',           true, false,'transit',null,null,'Inferred from name.')
on conflict (room_name) do update set
  role = excluded.role, holds_product = excluded.holds_product,
  is_drying = excluded.is_drying, stage = excluded.stage,
  confirmed_by = excluded.confirmed_by, confirmed_on = excluded.confirmed_on,
  note = excluded.note;

alter table room_roles enable row level security;
drop policy if exists room_roles_read on room_roles;
create policy room_roles_read on room_roles for select to authenticated using (true);
;
