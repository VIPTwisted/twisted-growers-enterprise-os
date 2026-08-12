-- metrc_packages IS NOT UNIQUE ON tag. 7 of 3,574 tags appear twice, always as
-- MC281714 + MP281909 - the same package visible in both of our own facilities.
-- That is legitimate Metrc behaviour, not a sync fault, but it silently doubles any
-- join on tag and it made the first version of this function raise 21000.
-- Every lookup here now takes one row per tag deterministically.

create or replace function public.f_material_origin(p_tag text)
returns jsonb
language sql stable as $$
with recursive seed as (
  select tag, raw from metrc_packages where tag = p_tag
  order by license limit 1                       -- dedupe: one row per tag
),
walk as (
  select s.tag, s.raw, 0 as depth from seed s
  union
  select c.tag, c.raw, w.depth + 1
    from walk w
    join lateral (
      select trim(s) as src
      from unnest(string_to_array(coalesce(w.raw->>'SourcePackageLabels',''), ',')) s
      where trim(s) <> ''
    ) l on true
    join lateral (
      select tag, raw from metrc_packages m where m.tag = l.src order by m.license limit 1
    ) c on true
   where w.depth < 12
),
roots as (
  select w.raw,
         coalesce(nullif(w.raw->>'ReceivedFromFacilityLicenseNumber',''),
                  nullif(w.raw->>'ItemFromFacilityLicenseNumber','')) as origin_lic,
         coalesce(nullif(w.raw->>'ReceivedFromFacilityName',''),
                  nullif(w.raw->>'ItemFromFacilityName','')) as origin_name
    from walk w
   where nullif(w.raw->>'ReceivedFromManifestNumber','') is not null
      or coalesce(w.raw->>'SourcePackageLabels','') = ''
      or not exists (select 1 from metrc_packages c
                      where c.tag = any(string_to_array(replace(w.raw->>'SourcePackageLabels',' ',''), ',')))
)
select jsonb_build_object(
  'package_tag',       p_tag,
  'lineage_packages',  (select count(*) from walk),
  'max_depth',         (select max(depth) from walk),
  'origin_licences',   (select coalesce(jsonb_agg(distinct origin_lic) filter (where origin_lic is not null), '[]'::jsonb) from roots),
  'origin_names',      (select coalesce(jsonb_agg(distinct origin_name) filter (where origin_name is not null), '[]'::jsonb) from roots),
  'inbound_manifests', (select coalesce(jsonb_agg(distinct raw->>'ReceivedFromManifestNumber')
                                  filter (where nullif(raw->>'ReceivedFromManifestNumber','') is not null), '[]'::jsonb) from walk),
  'source_harvests',   (select coalesce(jsonb_agg(distinct raw->>'SourceHarvestNames')
                                  filter (where nullif(raw->>'SourceHarvestNames','') is not null), '[]'::jsonb) from walk),
  'all_ours',          (select bool_and(f_is_ours(origin_lic)) from roots where origin_lic is not null),
  'any_outside',       (select bool_or(not f_is_ours(origin_lic)) from roots where origin_lic is not null),
  'item_field_says',   (select raw->>'ItemFromFacilityLicenseNumber' from seed)
);
$$;;
