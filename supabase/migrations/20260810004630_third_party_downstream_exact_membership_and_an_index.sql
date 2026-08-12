-- v_third_party_downstream joined every package to every source tag with
--     (child.raw->>'SourcePackageLabels') LIKE '%' || src.tag || '%'
-- A leading-wildcard match on a value extracted from JSON at run time. No index
-- can serve it, so it is a full cross product with a substring search inside —
-- 30.9 seconds, slow in all 72 canary runs, and the cost underneath
-- v_remediation_yield's 82.9.
--
-- IT IS ALSO ONLY CORRECT BY LUCK. SourcePackageLabels is a comma-separated
-- list, and a substring match would happily match a tag that merely CONTAINS
-- another. It returns the right 444 rows today only because no Metrc tag is
-- currently a substring of another — verified, count 0. The truncated-tag
-- collisions already on record (trap B8) are the same failure with the luck run
-- out. Exact membership removes the dependence on luck.
--
-- The GIN index makes the membership test indexable rather than a scan.
create index if not exists metrc_packages_source_labels_gin
  on metrc_packages using gin (
    string_to_array(replace(coalesce(raw->>'SourcePackageLabels',''), ' ', ''), ',')
  );

create or replace view v_third_party_downstream as
select src.supplier,
       src.tag                                            as source_tag,
       src.item_name                                      as source_item,
       src.strain,
       src.received_qty,
       src.uom                                            as source_uom,
       child.tag                                          as made_into_tag,
       child.item_name                                    as made_into,
       child.raw #>> '{Item,ProductCategoryName}'         as made_into_category,
       child.quantity                                     as made_qty,
       child.uom                                          as made_uom,
       child.packaged_on                                  as made_on,
       child.raw ->> 'LabTestingState'                    as made_lab_state,
       child.license                                      as made_under
from v_third_party_chain src
join metrc_packages child
  on string_to_array(replace(coalesce(child.raw->>'SourcePackageLabels',''), ' ', ''), ',')
     @> array[src.tag]
order by src.supplier, src.received_on desc nulls last;

comment on view v_third_party_downstream is
  'What each bought-in package became. Corrected 9 Aug 2026: it matched source packages with a leading-wildcard LIKE on a JSON field — unindexable, and correct only while no Metrc tag is a substring of another. Now exact array membership against a GIN index.';;
