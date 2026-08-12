-- ---------------------------------------------------------------------------
-- 0027 — The customer-facing product listing, assembled from the record of truth.
--
-- Owner's rule, 10 Aug 2026: "COA SHOULD BE SOURCE OF RECORD FOR ALL LAB AND
-- TESTING FOR PRODUCTS" and every item must carry a link to its COA and its
-- MANIFEST from any page.
--
-- SO POTENCY HERE COMES FROM coa_extract, NEVER FROM METRC. Metrc's feed has no
-- TAC line at all and no terpenes; the laboratory PDF has both. Where the COA is
-- missing a figure the field is NULL and the listing says so rather than falling
-- back to a Metrc number, because silently mixing two sources is how a customer
-- gets told something the certificate does not say.
-- ---------------------------------------------------------------------------

create or replace view v_product_listing as
with on_hand as (
  select f_strain_from_item(p.raw#>>'{Item,Name}')                        as strain,
         p.license                                                        as licence,
         coalesce(nullif(p.raw#>>'{Item,ProductCategoryName}',''),'(none)') as category,
         count(*)                                                         as tags,
         round(sum(f_to_pounds((p.raw->>'Quantity')::numeric,
               coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams')))
               filter (where f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams')))::numeric,2) as lb_on_hand,
         sum((p.raw->>'Quantity')::numeric)
               filter (where not f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))) as units_on_hand,
         max((p.raw->>'PackagedDate')::date)                              as newest_pack
  from metrc_packages p
  where coalesce((p.raw->>'Quantity')::numeric,0) > 0
    and coalesce((p.raw->>'IsFinished')::boolean,false) = false
  group by 1,2,3
),
/* Latest OWN COA per strain. The COA is the source of record for every lab
   figure on this listing. */
coa as (
  select strain, total_thc, total_cbd, total_cannabinoids, total_terpenes,
         terpene_profile, cannabinoid_profile, document_id, package_tag
  from (
    select f_strain_from_item(c.package_tag) as ignore_me,
           coalesce(f_strain_from_item(mp.raw#>>'{Item,Name}'), c.package_tag) as strain,
           c.total_thc, c.total_cbd, c.total_cannabinoids, c.total_terpenes,
           c.terpene_profile, c.cannabinoid_profile, c.document_id, c.package_tag,
           row_number() over (partition by coalesce(f_strain_from_item(mp.raw#>>'{Item,Name}'), c.package_tag)
                              order by c.parsed_at desc nulls last) as rn
    from coa_extract c
    left join metrc_packages mp on mp.raw->>'Label' = c.package_tag
    where f_is_ours(coalesce(c.client_license,''))
  ) z where rn = 1
)
select l.strain,
       coalesce(l.display_name, l.strain)               as display_name,
       l.strain_type,
       l.lineage,
       l.dominant_terpenes,
       l.flavour_notes,
       l.effect_notes,
       l.short_description,
       l.status                                         as listing_status,
       l.hero_image_path,
       (select count(*) from strain_image i where i.strain = l.strain) as image_count,
       l.shopify_handle,

       /* ---- LAB FACTS: COA ONLY ---- */
       coa.total_thc                                    as coa_total_thc,
       coa.total_cannabinoids                           as coa_tac,
       coa.total_terpenes                               as coa_total_terpenes,
       coa.terpene_profile                              as coa_terpene_profile,
       coa.document_id                                  as coa_document_id,
       coa.package_tag                                  as coa_package_tag,
       case when coa.document_id is null then 'NO COA ON FILE — do not publish'
            when coa.total_cannabinoids is null then 'COA on file but TAC not parsed'
            when coa.total_terpenes is null then 'COA on file, TAC present, terpenes not parsed'
            else 'COA complete' end                     as coa_state,

       /* ---- WHAT WE ACTUALLY HAVE ---- */
       oh.licence, oh.category, oh.tags, oh.lb_on_hand, oh.units_on_hand, oh.newest_pack,

       /* ---- READY TO PUBLISH? ---- */
       case
         when coa.document_id is null                     then 'BLOCKED — no COA'
         when l.strain_type is null                       then 'BLOCKED — strain type not set'
         when l.short_description is null                 then 'BLOCKED — no description'
         when (select count(*) from strain_image i where i.strain = l.strain) = 0
                                                          then 'BLOCKED — no image'
         when coalesce(oh.lb_on_hand,0) = 0
          and coalesce(oh.units_on_hand,0) = 0             then 'BLOCKED — nothing on hand'
         else 'READY' end                                as publish_readiness
from strain_library l
left join on_hand oh on oh.strain = l.strain
left join coa      on coa.strain  = l.strain;

comment on view v_product_listing is
  'Customer-facing listing per strain. EVERY LAB FIGURE COMES FROM THE COA -- the '
  'owner''s rule -- and is NULL when the certificate does not carry it, never '
  'back-filled from Metrc, which has no TAC line and no terpenes at all. '
  'publish_readiness names the single thing blocking each listing.';

grant select on v_product_listing to authenticated;
;
