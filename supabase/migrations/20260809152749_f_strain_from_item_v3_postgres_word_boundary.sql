-- v3. v2 scored 70.3% "partial" - every one of them the right name with "Flower
-- 3.5g" still attached. The size-strip never fired because it used \b for a word
-- boundary. Postgres regular expressions are POSIX ARE: \b is BACKSPACE, and the
-- word boundary is \y. The pattern was silently matching nothing.
--
-- A regex that quietly matches nothing looks exactly like a regex that had
-- nothing to match, which is why this was only caught by scoring the function
-- against 8,220 rows whose answer is already known.
create or replace function public.f_strain_from_item(p_item text)
returns text
language sql
immutable
as $$
  with a as (
    select trim(split_part(regexp_replace(coalesce(p_item,''), '^M[0-9]+:\s*', ''), '|', 1)) as s
  ),
  b as (
    select case when s ~ ' - ' then trim(split_part(s, ' - ', 2)) else trim(s) end as c from a
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
                || 'distillate|vape oil|shake|trim|smalls|flower|bud|buds|biomass|kief|rosin|'
                || 'concentrate|cartridge|carts?|edible|tincture|wax|badder|live resin|mixed pheno)$')
             then null
           else trim(c)
         end
  from d;
$$;

grant execute on function public.f_strain_from_item(text) to authenticated;;
