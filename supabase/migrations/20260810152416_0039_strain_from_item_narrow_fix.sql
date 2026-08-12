-- ---------------------------------------------------------------------------
-- 0039 — f_strain_from_item: handle "<strain> - <form>".
--
-- THE BUG. The function took the segment AFTER the dash, because most items read
-- "<brand> - <strain>" (Holyoke Wilds - Blockberry). But some read
-- "<strain> - <form>": "Pomelo Punch - Trim", "BLACK MAPLE - TRIM",
-- "Straw Pushpop - Trim", "Snowdog - Trim/Shake". Those returned NULL -- and
-- Snowdog returned "Trim/Shake" AS THE STRAIN, which is worse than null because
-- it is confidently wrong.
--
-- THE FIX IS DELIBERATELY NARROW: it fires ONLY when there are EXACTLY two
-- segments and the second is a pure form word. Nothing else changes.
--
-- A WIDER FIX WAS TESTED FIRST AND REJECTED. Taking the last non-form segment
-- gained 4 but LOST 8 ("Renew - Apple Fritter - Bulk Smalls" -> null) and changed
-- 17 for the worse ("Bulk Flower - Solar - Gelato 41 - C Bud" -> "C",
-- "CPI - California Raisins - Trim/shake" -> "Trim/shake"). Measured on every
-- distinct item we hold, before replacing anything.
--
-- MEASURED EFFECT OF WHAT IS APPLIED HERE: 3 gained, 1 corrected, 0 lost.
-- ---------------------------------------------------------------------------

create or replace function f_strain_from_item(p_item text)
returns text
language sql
immutable
as $function$
  with a as (
    select trim(split_part(regexp_replace(coalesce(p_item,''), '^M[0-9]+:\s*', ''), '|', 1)) as s
  ),
  /* "<strain> - <form>" with EXACTLY two segments: the strain is the FIRST one.
     Anything with three or more segments keeps the original behaviour. */
  a2 as (
    select case
             when array_length(string_to_array(s,' - '),1) = 2
              and lower(btrim(split_part(s,' - ',2))) ~
                  ('^(trim|trim/shake|shake|shake/trim|flower|buds?|smalls|bulk|biomass|'
                || 'kief|wax|badder|rosin|distillate|concentrate)$')
               then btrim(split_part(s,' - ',1))
             else s
           end as s
    from a
  ),
  b as (
    select case when s ~ ' - ' then trim(split_part(s, ' - ', 2)) else trim(s) end as c from a2
  ),
  c as (
    select regexp_replace(c, '^Twisted Growers\s+', 'TG ', 'i') as c from b
  ),
  d as (
    -- \y, not \b. Size first ("... Flower 3.5g" -> "... Flower"), then the form.
    select regexp_replace(
             regexp_replace(c, '\s+[0-9]+(\.[0-9]+)?\s*(g|mg|oz|lb)s?\y.*$', '', 'i'),
             '(\s+(raw\s+preroll|pre-?roll|bulk\s+shake/trim|bulk\s+flower|bulk\s+smalls|bulk|'
          || 'vape\s+oil|distillate|shake|trim|smalls|flower|buds?|joints?|gummies|gummy|'
          || 'concentrate|cartridges?|carts?|edibles?|tincture|wax|badder|live\s+resin))+\s*$',
             '', 'i') as c
    from c
  )
  select case
           when trim(c) = '' then null
           when lower(trim(c)) ~ ('^(tg\s*)?(bulk|gummy|gummies|raw preroll|preroll|pre-roll|joints?|'
                || 'distillate|vape oil|shake|trim|trim/shake|shake/trim|smalls|flower|bud|buds|biomass|kief|rosin|'
                || 'concentrate|cartridge|carts?|edible|tincture|wax|badder|live resin|mixed pheno)$')
             then null
           else trim(c)
         end
  from d;
$function$;

comment on function f_strain_from_item(text) is
  'Strain from item text. Handles "<brand> - <strain>" (takes the second segment) '
  'AND "<strain> - <form>" (takes the first, when there are exactly two segments '
  'and the second is a pure form word). The narrow rule is deliberate: taking the '
  'last non-form segment generally was tested and LOST 8 strains while gaining 4. '
  'Also refuses "Trim/Shake" as a strain name -- it was being returned as one.';
;
