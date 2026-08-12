-- ONE PLACE TO RESOLVE OWNERSHIP, instead of the same wrong expression in 21 views.
--
-- Today 21 views each ask f_is_ours(raw->>'ItemFromFacilityLicenseNumber'). That
-- field describes the ITEM DEFINITION, not the material. When a package is
-- repackaged in Metrc the child does not inherit its parent's provenance, so the
-- expression books other people's material as our own production. Measured: it
-- disagrees with the package lineage on 21.4% of on-hand pounds.
--
-- Fixing that by editing 21 views would be 21 chances to get it slightly
-- different, and the next view written would make it 22. So the resolution moves
-- into one function that every view can call.
--
-- Returns THREE states, not two, because two would force a lie. A package
-- blended from several origins is neither ours nor theirs, and nothing records
-- the proportions — 264 packages holding 354.2 lb are in exactly that position.
create or replace function public.f_package_is_ours(p_tag text)
returns text
language sql
stable
as $$
  select case
    when g is null                                          then 'unknown'
    when (g->>'all_ours')::boolean                          then 'ours'
    when (g->>'any_outside')::boolean
         and jsonb_array_length(coalesce(g->'origin_licences','[]'::jsonb)) <= 1
                                                            then 'third_party'
    when (g->>'any_outside')::boolean                       then 'blended'
    else 'unknown'
  end
  from (select f_material_origin(p_tag) as g) x;
$$;

comment on function public.f_package_is_ours is
  'Ownership resolved through the package lineage: ours | third_party | blended | unknown. Replaces f_is_ours(raw->>''ItemFromFacilityLicenseNumber''), which reads the item definition rather than the material and is wrong on 21.4% of on-hand pounds. Returns four states deliberately — a package blended from several origins with no recorded proportions cannot honestly be called either.';

grant execute on function public.f_package_is_ours(text) to authenticated;;
