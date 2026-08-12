-- v2. The v1 test scored 78.6% WRONG, which is why it was tested before use.
-- Reading the failures showed most were nearly right and wrapped in packaging:
--   item "Twisted Growers Lemon Drop Flower 3.5g"  ->  strain "TG Lemon Drop"
-- The brand is spelled out where the strain column abbreviates it, and the form
-- and pack size trail the name. So: normalise the brand, strip the form and size.
--
-- Still returns NULL rather than guessing when the item names only a product
-- form ("Bulk Distillate"), because 534 lines genuinely carry no strain and a
-- function that always answers is a function that invents.
create or replace function public.f_strain_from_item(p_item text)
returns text
language sql
immutable
as $$
  with a as (
    select trim(split_part(regexp_replace(coalesce(p_item,''), '^M[0-9]+:\s*', ''), '|', 1)) as s
  ),
  b as (
    -- "Brand - Strain" and "Brand - Strain - Form" both put the strain second.
    select case when s ~ ' - ' then trim(split_part(s, ' - ', 2)) else trim(s) end as c from a
  ),
  c as (
    -- The strain column abbreviates the house brand; the item spells it out.
    select regexp_replace(c, '^Twisted Growers\s+', 'TG ', 'i') as c from b
  ),
  d as (
    -- Strip pack size and trailing product form, repeatedly: "Flower 3.5g",
    -- "Bulk Shake/Trim", "Raw PreRoll", "1g Joints".
    select regexp_replace(
             regexp_replace(c, '\s+[0-9]+(\.[0-9]+)?\s*(g|mg|oz|lb)s?\b.*$', '', 'i'),
             '\s+(raw\s+preroll|pre-?roll|bulk\s+shake/trim|bulk\s+flower|bulk\s+smalls|bulk|'
          || 'vape\s+oil|distillate|shake|trim|smalls|flower|buds?|joints?|gummies|gummy|'
          || 'concentrate|cartridges?|carts?|edibles?|tincture|wax|badder|live\s+resin)+\s*$',
             '', 'i') as c
    from c
  )
  select case
           when trim(c) = '' then null
           when lower(trim(c)) ~ ('^(tg\s*)?(bulk|gummy|gummies|raw preroll|preroll|pre-roll|joints?|'
                || 'distillate|vape oil|shake|trim|smalls|flower|bud|buds|biomass|kief|rosin|'
                || 'concentrate|cartridge|carts?|edible|tincture|wax|badder|live resin|mixed pheno)$')
             then null
           else trim(c)
         end
  from d;
$$;

comment on function public.f_strain_from_item is
  'Best-effort strain read out of a free-text Metrc item name. Returns NULL rather than guessing when the item names only a product form. A CANDIDATE, never an authority: where metrc_rpt_package_transfers.strain is populated, that column wins. Accuracy is measured against the 8,220 lines that already carry a known strain — see the migration that introduced v2.';

grant execute on function public.f_strain_from_item(text) to authenticated;;
