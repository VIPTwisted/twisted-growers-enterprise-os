-- WHY THIS EXISTS.
-- f_is_ours() is correct about LICENCES. The bug is the FIELD it gets applied to.
-- ItemFromFacilityLicenseNumber names the facility that defined the ITEM, not the
-- facility that owned the MATERIAL. Repackaging received material under a new item
-- name silently flips that field to us.
--
-- Worked example, package 1A40A030000E5B2000009058 (56.84 lb, ruled "ours" 7 Aug):
--   * all 17 source packages carry ItemFromFacilityLicenseNumber = MB282344 Greater Goods
--   * 10 of them are in tag series 1A40A0300011815 - Greater Goods' own series,
--     28 of 28 packages arrived on a manifest
--   * the other 7 are OUR tags applied to THEIR received material
--   * the child reads MP281909 only because a new item, "M00004505413: Failed
--     Flower", was created at the repack
--   * none of its 7 source harvests exist in our 380 harvests (all MC281714), and
--     the names break our convention "TG <strain> - <date> <room>"
--   * the package the lab actually tested, 1A40A0300011815000000016, has never been
--     in our database at all
-- The material never changed hands. Only the item definition did.
--
-- Same root cause as the C6d breach (consigned material counted as on-hand stock).
--
-- f_material_origin walks SourcePackageLabels up to the roots and reports where the
-- material entered our custody. Depth-capped at 12; the deepest chain observed is 4.
-- UNDO: drop function f_material_origin(text) cascade; drop view v_material_ownership_conflict.

create or replace function public.f_material_origin(p_tag text)
returns jsonb
language sql stable as $$
with recursive walk as (
  select p.tag, p.raw, 0 as depth
    from metrc_packages p where p.tag = p_tag
  union all
  select c.tag, c.raw, w.depth + 1
    from walk w
    join lateral (
      select trim(s) as src
      from unnest(string_to_array(coalesce(w.raw->>'SourcePackageLabels',''), ',')) s
      where trim(s) <> ''
    ) l on true
    join metrc_packages c on c.tag = l.src
   where w.depth < 12
),
roots as (
  -- a root is where the trail stops: nothing upstream we hold, or it arrived by manifest
  select w.*,
         coalesce(nullif(w.raw->>'ReceivedFromFacilityLicenseNumber',''),
                  nullif(w.raw->>'ItemFromFacilityLicenseNumber','')) as origin_lic,
         coalesce(nullif(w.raw->>'ReceivedFromFacilityName',''),
                  nullif(w.raw->>'ItemFromFacilityName','')) as origin_name
    from walk w
   where nullif(w.raw->>'ReceivedFromManifestNumber','') is not null
      or coalesce(w.raw->>'SourcePackageLabels','') = ''
      or not exists (
           select 1 from metrc_packages c
            where c.tag = any(string_to_array(replace(w.raw->>'SourcePackageLabels',' ',''), ',')))
)
select jsonb_build_object(
  'package_tag',      p_tag,
  'lineage_packages', (select count(*) from walk),
  'max_depth',        (select max(depth) from walk),
  'origin_licences',  (select coalesce(jsonb_agg(distinct origin_lic) filter (where origin_lic is not null), '[]'::jsonb) from roots),
  'origin_names',     (select coalesce(jsonb_agg(distinct origin_name) filter (where origin_name is not null), '[]'::jsonb) from roots),
  'inbound_manifests',(select coalesce(jsonb_agg(distinct raw->>'ReceivedFromManifestNumber')
                                 filter (where nullif(raw->>'ReceivedFromManifestNumber','') is not null), '[]'::jsonb) from walk),
  'all_ours',         (select bool_and(f_is_ours(origin_lic)) from roots where origin_lic is not null),
  'any_outside',      (select bool_or(not f_is_ours(origin_lic)) from roots where origin_lic is not null),
  'item_field_says',  (select raw->>'ItemFromFacilityLicenseNumber' from metrc_packages where tag = p_tag)
);
$$;

comment on function public.f_material_origin(text) is
  'Resolves who the MATERIAL came from by walking SourcePackageLabels to its roots, '
  'rather than trusting ItemFromFacilityLicenseNumber - which names whoever defined '
  'the item and flips to us on any repack under a new item name. Use this, not the '
  'raw field, for any ours-vs-theirs question.';

create or replace view public.v_material_ownership_conflict as
select p.tag                                   as package_tag,
       left(p.item_name, 60)                   as item_name,
       p.lab_testing_state,
       p.source_state,
       p.raw->>'LocationName'                  as location,
       case when f_is_weight(p.uom) then round(f_to_pounds(p.quantity, p.uom), 2) end as pounds,
       p.raw->>'ItemFromFacilityLicenseNumber' as item_field_says,
       o->'origin_names'                       as material_actually_from,
       o->'origin_licences'                    as origin_licences,
       o->'inbound_manifests'                  as inbound_manifests,
       (o->>'lineage_packages')::int           as lineage_packages,
       'THE ISSUE: the item field names one of our licences, but the material traces '
       'to an outside licence. Counting this as our stock overstates on-hand and '
       'misattributes any loss, cost or yield derived from it.' as what_is_wrong,
       'Treat as third-party material. Ownership comes from f_material_origin, never '
       'from ItemFromFacilityLicenseNumber.' as what_to_do
from metrc_packages p
cross join lateral f_material_origin(p.tag) o
where p.source_state = any (array['active','onhold'])
  and f_is_ours(p.raw->>'ItemFromFacilityLicenseNumber')
  and (o->>'any_outside')::boolean is true;

comment on view public.v_material_ownership_conflict is
  'Active packages the item field claims are ours but whose material traces to an '
  'outside licence. Empty is the good state. This is the C6d guard.';;
