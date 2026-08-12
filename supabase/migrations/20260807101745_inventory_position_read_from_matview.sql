/* Inventory Position took 84 SECONDS to return a single row.
   ----------------------------------------------------------
   v_tower_inventory is 21 union branches, each re-scanning the same base
   tables, recomputed from scratch on every page load - to produce 22 summary
   rows. Anyone opening the page assumed the site had crashed.

   Fix: compute it once into mv_tower_inventory, have the page read that.
   v_tower_inventory itself is UNCHANGED, so anything else reading it behaves
   exactly as before. The grouped view keeps the identical column list, so the
   front end needs no change at all - same page, same layout, same theme.

   Trade-off: the figures are now as fresh as the last refresh rather than
   to-the-second. For a holdings summary that is the right trade; a page nobody
   can wait 84 seconds for is not fresher, it is unread. */

grant select on mv_tower_inventory to authenticated;

create or replace view v_tower_inventory_grouped as
 SELECT grp AS section,
    label,
    value,
    drill,
    metric,
        CASE grp
            WHEN 'stock'::text THEN 'What we are holding, by product stream'::text
            WHEN 'origin'::text THEN 'Grown by us versus bought in'::text
            WHEN 'quality'::text THEN 'Testing position'::text
            WHEN 'ageing'::text THEN 'How long it has been sitting'::text
            WHEN 'control'::text THEN 'Controls and things awaiting a decision'::text
            ELSE NULL::text
        END AS section_note
   FROM mv_tower_inventory
  ORDER BY (
        CASE grp
            WHEN 'stock'::text THEN 1
            WHEN 'origin'::text THEN 2
            WHEN 'quality'::text THEN 3
            WHEN 'ageing'::text THEN 4
            ELSE 5
        END), value DESC NULLS LAST;

comment on materialized view mv_tower_inventory is
  'Precomputed Inventory Position. The live view v_tower_inventory takes ~84s for 22 rows. Refresh on a schedule; concurrently, so readers never block.';;
