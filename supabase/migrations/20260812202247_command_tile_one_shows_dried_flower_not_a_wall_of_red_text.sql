-- Agent I, 12 Aug 2026. DBI-079.
--
-- OWNER, looking at the deployed page: "why is there the red message fucking up the page why has
-- this not been resolved".
--
-- WHAT WENT WRONG. He approved splitting the headline tile ("AGREE SPLIT THIS") because it added
-- 418.3 lb of fresh frozen at WET weight into a figure labelled dry-equivalent — 325.3 lb
-- overstated. I built v_stock_headline and told Agent B that if it showed the dry-equivalent it
-- must show the caveat beside it. B did exactly that and dumped the whole paragraph under the
-- tile: a wall of red text, and the tile STILL READS 2,460. The wrong number with an essay
-- explaining why it is wrong. My instruction produced that, not B's judgement.
--
-- THE REAL FIX IS THE NUMBER, NOT THE FOOTNOTE. A figure that needs a paragraph to be honest is
-- the wrong figure. Show dried flower, say in one line that fresh frozen is held separately, and
-- the caveat has nothing left to explain.
--
-- WHY HERE. mv_department_dashboard is a VIEW over the matview mv_department_dashboard_base
-- despite the mv_ prefix, so create-or-replace works. The matview itself cannot be replaced and
-- guard E1 forbids dropping it, so the override lives at the view layer - the same technique used
-- for the 'Moisture loss not recorded' coalesce already in this definition.
--
-- Columns unchanged in name, order and type. Only the Command ord 1 ROW changes.
-- VERIFY: Command ord 1 must read 'Dried flower on hand' 2041.7 lb, and no other row moves.
-- UNDO: restore the prior definition (it is the same query without the CASE blocks).

create or replace view public.mv_department_dashboard as
select b.department,
       b.ord,
       case when b.department = 'Command' and b.ord = 1
            then 'Dried flower on hand'
            else b.kpi end                                        as kpi,
       case when b.department = 'Command' and b.ord = 1
            then (select dried_lb from v_stock_headline)
            when b.kpi = 'Moisture loss not recorded'
            then coalesce(b.value, 0::numeric)
            else b.value end                                      as value,
       b.unit,
       b.tone,
       case when b.department = 'Command' and b.ord = 1
            then 'Dried only. Fresh frozen ' ||
                 (select to_char(fresh_frozen_wet_lb,'FM999999.0') from v_stock_headline) ||
                 ' lb is held separately at wet weight and is never added to this.'
            else b.context end                                    as context,
       b.drill,
       b.computed_at
from mv_department_dashboard_base b

union all
select s.department, s.ord, s.kpi, s.value, s.unit, s.tone, s.context, s.drill, s.computed_at
from mv_dept_dash_supplement s;

comment on view public.mv_department_dashboard is
 'Department KPI rows. Command ord 1 is OVERRIDDEN here to show DRIED FLOWER, not the combined '
 '"total on hand, dry-equivalent" that added 418.3 lb of fresh frozen at wet weight and ran 325.3 '
 'lb high. Owner approved the split 12 Aug 2026. The context line is ONE SENTENCE by design: the '
 'first attempt rendered the full ratio caveat under the tile as a wall of red text while the '
 'tile still showed the wrong number, which is the worst of both. A figure needing a paragraph to '
 'be honest is the wrong figure — fix the figure and the paragraph has nothing to explain. The '
 'unconfirmed 4.5-vs-4.17 ratio is not used here at all; nothing on this tile is converted.';;
