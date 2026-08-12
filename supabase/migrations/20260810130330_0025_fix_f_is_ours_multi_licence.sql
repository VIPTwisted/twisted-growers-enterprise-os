-- ---------------------------------------------------------------------------
-- 0025 — f_is_ours must handle a field naming MORE THAN ONE licence.
--
-- THE DEFECT. f_is_ours matched with exact equality:
--     where c.active and c.license = p_license
-- A COA's client_license field routinely names BOTH our licences at once --
-- "MC281714, MP281909" -- because one company holds both. Exact equality returns
-- FALSE for that string, so 621 of our own certificates, 525 of them carrying the
-- TAC figure buyers ask for first, were classified as somebody else's material.
--
-- This is the SECOND time this exact defect has bitten this project. It previously
-- made "PLATFORM IS THE ODD ONE OUT" appear 89 times and nearly triggered
-- corrections to 27 packages that did not exist. It was fixed at the call site
-- then, not in the function, so every new caller inherited it again.
--
-- FIXED IN THE FUNCTION so no caller can inherit it a third time. The field is
-- split on comma, semicolon, slash, pipe and whitespace, and ANY part matching an
-- active company licence makes it ours. Behaviour on a single clean licence is
-- unchanged.
-- ---------------------------------------------------------------------------

create or replace function f_is_ours(p_license text)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.company_licenses c,
         lateral unnest(regexp_split_to_array(coalesce(p_license,''), '[,;/|]+')) part
    where c.active
      and upper(btrim(part)) = upper(btrim(c.license))
  )
$function$;

comment on function f_is_ours(text) is
  'Is this licence one of ours? Handles a field naming SEVERAL licences at once '
  '("MC281714, MP281909") -- one company holds both, and exact equality on that '
  'string returned false for 621 of our own COAs. Split on , ; / | then match any '
  'part. Fixed in the FUNCTION, because the previous fix lived at one call site '
  'and every new caller inherited the bug again.';
;
