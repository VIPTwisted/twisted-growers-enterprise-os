-- ---------------------------------------------------------------------------
-- 0026 — Strain library and product listings, for marketing.
--
-- Owner, 10 Aug 2026: "FROM OUR INVENTORY YOU SHOULD CREATE FOR MARKETING A FULL
-- STRAIN AND INVENTORY LIBRARY WHERE WE CAN UPLOAD IMAGES AND CREATE PRODUCT
-- LISTING PAGES FOR ALL THAT WE CAN SHARE WITH CUSTOMERS OR UPLOAD TO SHOPIFY OR
-- OTHER SITES", and "TERPENES VERY IMPORTANT, TYPE OF STRAIN INDICA OR WHATEVER".
-- Plus the standing rule: "COA SHOULD BE SOURCE OF RECORD FOR ALL LAB AND TESTING".
--
-- WHAT ALREADY EXISTS AND IS NOT REBUILT HERE:
--   v_package_documents  package -> COA path + manifest path, side by side
--   metrc_strains        the registered strain names
--   product_inventory    tac_pct, terpene_pct, thca_pct, description, case size
--   strain_scorecard     whether a strain sells well
-- This adds only the marketing layer on top.
--
-- STRAIN TYPE IS LEFT NULL. Indica/sativa/hybrid is NOT in Metrc, NOT on the COA,
-- and NOT derivable from anything we hold. It is a horticultural fact about the
-- genetics, and guessing it from a name would put an invented claim on a customer-
-- facing listing. Seeded rows carry type NULL and a status of 'needs_detail' until
-- a person fills it in.
-- ---------------------------------------------------------------------------

create table if not exists strain_library (
  strain            text primary key,
  display_name      text,
  strain_type       text check (strain_type in ('Indica','Sativa','Hybrid',
                                                'Indica-dominant','Sativa-dominant','Ruderalis')),
  lineage           text,
  breeder           text,
  dominant_terpenes text[],
  flavour_notes     text,
  effect_notes      text,
  short_description text,
  long_description  text,
  hero_image_path   text,
  shopify_handle    text,
  status            text not null default 'needs_detail'
                    check (status in ('needs_detail','draft','published','retired')),
  is_ours           boolean not null default true,
  detail_set_by     text,
  detail_set_on     date,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  /* A published listing goes in front of customers. It must have the facts a
     buyer asks for and a named author. */
  constraint published_needs_type_and_author
    check (status <> 'published'
           or (strain_type is not null and short_description is not null
               and detail_set_by is not null))
);

comment on table strain_library is
  'Marketing layer over the strains we actually grow. strain_type is NULL until a '
  'person sets it -- indica/sativa/hybrid is not in Metrc, not on the COA, and not '
  'derivable from anything we hold, so guessing it would put an invented claim on '
  'a customer-facing listing. Potency and terpenes come from the COA, never typed here.';

create table if not exists strain_image (
  id            bigserial primary key,
  strain        text not null references strain_library(strain) on delete cascade,
  storage_path  text not null,
  caption       text,
  kind          text not null default 'product'
                check (kind in ('product','macro','plant','lifestyle','packaging','label')),
  sort_order    integer not null default 100,
  is_hero       boolean not null default false,
  uploaded_by   text,
  uploaded_at   timestamptz not null default now(),
  unique (strain, storage_path)
);

comment on table strain_image is
  'Images per strain. storage_path is a Supabase Storage path, NEVER a pre-signed '
  'URL -- the owner ruled that nothing in this OS carries an expiry.';

create index if not exists strain_image_strain_idx on strain_image (strain, sort_order);

alter table strain_library enable row level security;
alter table strain_image   enable row level security;
drop policy if exists strain_library_read on strain_library;
create policy strain_library_read on strain_library for select to authenticated using (true);
drop policy if exists strain_library_write on strain_library;
create policy strain_library_write on strain_library for all to authenticated
  using (is_executive()) with check (is_executive());
drop policy if exists strain_image_read on strain_image;
create policy strain_image_read on strain_image for select to authenticated using (true);
drop policy if exists strain_image_write on strain_image;
create policy strain_image_write on strain_image for all to authenticated
  using (is_executive()) with check (is_executive());

/* Seed from strains we ACTUALLY have material for, not the full Metrc registry --
   a listing for a strain we do not hold is a promise we cannot keep. */
insert into strain_library (strain, display_name, status, is_ours, note)
select distinct f_strain_from_item(p.raw#>>'{Item,Name}'),
       f_strain_from_item(p.raw#>>'{Item,Name}'),
       'needs_detail', true,
       'Seeded 10 Aug 2026 from packages currently on hand. Type, lineage, terpenes and copy still to be entered.'
from metrc_packages p
where coalesce((p.raw->>'Quantity')::numeric,0) > 0
  and coalesce((p.raw->>'IsFinished')::boolean,false) = false
  and f_strain_from_item(p.raw#>>'{Item,Name}') is not null
  and btrim(f_strain_from_item(p.raw#>>'{Item,Name}')) <> ''
on conflict (strain) do nothing;

grant select, insert, update, delete on strain_library, strain_image to authenticated;
grant usage, select on sequence strain_image_id_seq to authenticated;
;
