/* THE SAME DEFECT AS THE PACKAGES, IN THE OPPOSITE DIRECTION.
 *
 * Mine again, from 20260814234146 earlier today. I loaded 1,151 plants from Metrc's
 * point-in-time export with a hand-built raw object and did not check what reads it.
 *
 * v_room_plant_counts filters:  where (raw ->> 'State') = 'Tracked'
 *
 * My rows carry no State key, so all 1,151 were SILENTLY EXCLUDED. Measured before this
 * fix, that view showed F1 1,039 · F3 1,140 · F4 1,050 and NO FLOWER ROOM #2 AT ALL -
 * the exact empty-room reading that was escalated to the owner as an operational
 * emergency two days ago, reintroduced by my own fix for it.
 *
 * Where the packages defect INVENTED inventory, this one HID it. Same cause both times:
 * a producer that never asked what consumes it.
 *
 * WHAT I AM AND AM NOT FILLING. Six keys that views read were absent. Only State changes
 * an answer, and only State is filled:
 *
 *   State           2 views, and one FILTERS on it   -> set 'Tracked'. True: Metrc's
 *                                                       point-in-time export lists only
 *                                                       tracked plants, and these are
 *                                                       standing in a flower room today.
 *   IsOnHold        4 views, all read it through CASE or coalesce(...,false), so absent
 *                   already behaves as "not on hold", which is correct. Left absent.
 *   PlantedDate     2 views  \
 *   PlantBatchName  2 views   |  NOT in the report. Absent stays absent. A view showing
 *   LastModified    2 views   |  a blank date is telling the truth; a value I invented
 *   FloweringDate   1 view   /   would be fabrication on a legal record.
 *
 * That distinction is the whole lesson: absence is only dangerous where a view turns a
 * null into an affirmative claim. `not coalesce(x,false)` did that to the packages.
 * `= 'Tracked'` does it here by exclusion. A null date rendered as blank does not.
 */

update public.metrc_plants
   set raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('State', 'Tracked')
 where provenance = 'metrc report'
   and not (coalesce(raw, '{}'::jsonb) ? 'State');

comment on column public.metrc_plants.raw is
  'The Metrc API record verbatim, EXCEPT on provenance = ''metrc report'' rows, where it is assembled from Metrc''s point-in-time export. Views read raw keys directly - v_room_plant_counts FILTERS on raw->>''State'' = ''Tracked'', so a row without it vanishes from that view entirely, which is what happened to 1,151 rows on 15 Aug 2026 and made Flower Room #2 disappear again. If you assemble this object, check every key a consumer reads and supply the ones you actually know. Do NOT invent the ones you do not: PlantedDate, PlantBatchName, LastModified and FloweringDate are absent from the report and must stay absent.';;
