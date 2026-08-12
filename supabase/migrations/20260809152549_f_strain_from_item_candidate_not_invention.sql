-- 11,036 of 19,256 manifest lines (57%) have no strain in the strain column.
-- The strain is usually in the item text, but my first attempt read the WRONG
-- SEGMENT: it took what follows the pipe, which is the product FORM, and so it
-- reported "Gummy" 788 times, "Raw PreRoll" 488 times and "Bulk" 324 times as
-- strain names. Manufacturing 11,036 wrong strain names is worse than leaving
-- them blank, and it is exactly the failure the agent brief warns about.
--
-- The real shapes, counted:
--   9,550  CODE: Brand - Strain | Form     "Mello Farms - Lembrule | Bulk Flower"
--     952  CODE: Brand - Strain            "Bud - Mac 1", "Renew - Apple Fritter - Bulk Smalls"
--     534  CODE: Form only                 "Bulk Distillate"  <- NO STRAIN EXISTS
--
-- So the last group must return NULL. A function that always returns something
-- is a function that invents.
--
-- This returns a CANDIDATE read out of a free-text field, never an authority.
-- Where the strain column is populated, that column wins.
create or replace function public.f_strain_from_item(p_item text)
returns text
language sql
immutable
as $$
  with stripped as (
    -- Drop the "M00002996524: " catalogue code, then drop the form after the pipe.
    select trim(split_part(regexp_replace(coalesce(p_item,''), '^M[0-9]+:\s*', ''), '|', 1)) as s
  ),
  parts as (
    select s,
           -- "Brand - Strain" and "Brand - Strain - Form" both put the strain second.
           case when s ~ ' - '
                then trim(split_part(s, ' - ', 2))
                else trim(s) end as candidate
    from stripped
  )
  select case
           when candidate = '' then null
           -- A product form is not a strain. These are the words that appeared as
           -- "strains" when the wrong segment was read.
           when lower(candidate) ~ ('^(bulk|gummy|gummies|raw preroll|preroll|pre-roll|joints?|'
                || 'distillate|vape oil|shake|trim|smalls|flower|bud|buds|biomass|kief|rosin|'
                || 'concentrate|cartridge|carts?|edible|tincture|wax|badder|live resin|'
                || 'bulk distillate|bulk flower|bulk shake/trim|mixed pheno)$')
             then null
           -- Trailing form words on an otherwise real name: "Fruit Salad Raw PreRoll".
           when regexp_replace(candidate,
                  '\s+(raw preroll|preroll|pre-roll|bulk flower|bulk shake/trim|bulk smalls|'
               || 'bulk|vape oil|distillate|shake|trim|smalls|flower|joints?)$', '', 'i') = '' then null
           else regexp_replace(candidate,
                  '\s+(raw preroll|preroll|pre-roll|bulk flower|bulk shake/trim|bulk smalls|'
               || 'bulk|vape oil|distillate|shake|trim|smalls|flower|joints?)$', '', 'i')
         end
  from parts;
$$;

comment on function public.f_strain_from_item is
  'Best-effort strain read out of a free-text Metrc item name. Returns NULL rather than guessing when the item names only a product form. A CANDIDATE, never an authority: where metrc_rpt_package_transfers.strain is populated, that column wins.';

grant execute on function public.f_strain_from_item(text) to authenticated;;
