-- SUBSTRING MATCHING ON LICENCE NUMBERS IS FRAGILE. Replace it with membership.
--
-- The verdict used position(platform_license in cert_license) > 0 to cope with a
-- certificate naming several licences ('MC281714, MP281909'). It gives the right
-- answer today, but it is a SUBSTRING test: any licence that happened to contain
-- another as a substring would match, and it would do so silently. That is the same
-- class of failure as f_is_ours() on a list - correct-looking, never erroring,
-- answering a slightly different question.
--
-- f_licence_in_set does exact membership after splitting and trimming.
-- UNDO: previous definition in countable_items_must_carry_their_count.

create or replace function public.f_licence_in_set(p_licence text, p_set text)
returns boolean language sql immutable as $$
  select case when p_licence is null or p_set is null then false
         else exists (
           select 1 from unnest(string_to_array(p_set, ',')) x
           where btrim(x) = btrim(p_licence))
         end;
$$;

comment on function public.f_licence_in_set(text, text) is
  'Exact membership of one licence in a comma-separated set. Use instead of '
  'position()/LIKE on licence numbers - a substring test matches silently and '
  'answers a different question. Certificates hold sets: 666 name more than one '
  'licence, 621 of them ours.';

create or replace view public.v_ownership_verdict as
with conflicted as (
  select p.tag, p.item_name, p.uom, p.quantity, p.source_state, p.lab_testing_state,
         p.raw->>'ItemFromFacilityLicenseNumber' as platform_license,
         p.raw->>'ItemFromFacilityName'          as platform_name,
         o.origin                                as lineage
  from (select distinct on (tag) tag, item_name, uom, quantity, source_state,
               lab_testing_state, raw
        from metrc_packages order by tag, license) p
  cross join lateral (select f_material_origin(p.tag) as origin) o
  where p.source_state = any (array['active','onhold'])
    and f_is_ours(p.raw->>'ItemFromFacilityLicenseNumber')
    and (o.origin->>'any_outside')::boolean is true
),
certed as (
  select c.*, r.cert_license, r.cert_client, r.found_at_depth, r.certificate_on_package
  from conflicted c
  left join v_certificate_resolved r on r.package_tag = c.tag
)
select tag                                            as package_tag,
       left(item_name, 50)                            as item_name,
       source_state,
       lab_testing_state,
       case when f_is_weight(uom) then round(f_to_pounds(quantity, uom), 2) end as pounds,
       platform_license                               as platform_says,
       lineage->'origin_names'                        as lineage_says,
       lineage->'origin_licences'                     as lineage_licences,
       lineage->'inbound_manifests'                   as inbound_manifests,
       cert_client                                    as certificate_says,
       cert_license                                   as certificate_license,
       case when found_at_depth is null then null
            when found_at_depth = 0 then 'direct'
            else 'inherited via ' || found_at_depth end as certificate_link,
       certificate_on_package,
       case
         when cert_license is null and cert_client is null
           then 'UNPROVEN - no certificate in the lineage. Ownership doubt raised, not settled.'
         when cert_license is not null and f_licence_in_set(platform_license, cert_license)
           then 'INCONCLUSIVE - the certificate names us, but the lineage says the '
                || 'material came from outside. Consistent with us paying for a '
                || 'retest after buying it. NOT proof we grew it.'
         when cert_license is not null
           then 'CONFIRMED NOT OURS - the laboratory names ' || coalesce(cert_client,'another licensee')
                || '. The certificate is independent and it wins.'
         else 'NAME ONLY - the certificate names ' || coalesce(cert_client,'?')
              || ' but prints no licence (MCR Labs does not). Judge on the name.'
       end                                            as verdict,
       'THE ISSUE: this package is counted as ours. Ownership drives yield, cost, '
       'loss and on-hand, and every one of those is wrong if this is somebody '
       'else''s material.'                            as what_is_wrong,
       case when not f_is_weight(uom) then quantity end as units,
       uom                                              as unit_of_measure,
       f_quantity_text(quantity, uom)                   as how_much
from certed;;
