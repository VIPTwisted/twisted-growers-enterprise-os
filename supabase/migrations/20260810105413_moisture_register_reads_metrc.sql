-- FIX, 10 Aug 2026. The Cultivation Dashboard tile "Moisture loss not recorded" read
-- 21,935.4 lb across 269 closed harvests, in red. It was wrong.
--
-- needs_recording was defined as "no row exists in moisture_loss_entries" - OUR OWN internal
-- register, which holds ZERO rows. So it was true for every harvest ever, by construction:
-- a check that cannot fail, flagging 100% because the table it consults is empty.
--
-- What is actually true: Metrc HOLDS the moisture loss on 271 of 276 closed dried harvests,
-- in the Harvests-Inactive export. Only 5 genuinely lack it. The 72 zero-moisture rows are
-- fresh frozen, which is packaged wet and never dries, so zero is correct for them.
--
-- The register now asks METRC FIRST and falls back to our internal entry. Column names,
-- order and types are unchanged, so the dashboard, theme and templates are untouched - the
-- tile self-corrects because its source now tells the truth.

create or replace view v_moisture_loss_register as
with r as (
  select (f_rule('expected_moisture_pct_min') + f_rule('expected_moisture_pct_max')) / 200.0 as loss
)
select
  h.harvest_name,
  h.harvest_started,
  h.harvest_closed,
  h.drying_room,
  h.strain,
  round(h.wet_lb, 1)              as wet_lb,
  round(h.packaged_lb, 1)         as packaged_lb,
  round(h.waste_lb, 1)            as waste_lb,
  round(h.still_in_room_lb, 1)    as metrc_shows_remaining_lb,
  round(h.wet_lb * (select r.loss from r), 1) as expected_moisture_loss_lb,
  greatest(round(h.wet_lb * (1 - (select r.loss from r)) - h.packaged_lb, 1), 0) as really_left_lb,

  -- phantom weight only exists where METRC HAS NO MOISTURE FIGURE. Where Metrc holds one,
  -- the API's remaining weight is just the residual and nothing is phantom.
  case when mx.moisture_loss_lb is not null and mx.moisture_loss_lb > 0 then 0::numeric
       else greatest(round(h.still_in_room_lb
              - greatest(h.wet_lb * (1 - (select r.loss from r)) - h.packaged_lb, 0), 1), 0)
  end                             as phantom_lb,

  case when h.harvest_closed is not null then 'CLOSED' else 'OPEN' end as harvest_state,

  -- Metrc's own figure wins; our internal entry is the fallback
  coalesce(mx.moisture_loss_lb, e.moisture_loss_lb)                    as recorded_loss_lb,
  coalesce(e.method,
           case when mx.moisture_loss_lb is not null
                then 'Metrc Harvests-Inactive report' end)             as recorded_method,
  coalesce(e.entered_by,
           case when mx.moisture_loss_lb is not null then 'recorded in Metrc' end) as entered_by,
  coalesce(e.entered_at::date, mx.finished_on)                         as recorded_on,
  coalesce(e.recorded_in_metrc, mx.moisture_loss_lb is not null)       as recorded_in_metrc,
  e.metrc_adjustment_ref,
  e.note                                                               as recorded_note,

  -- NOTHING needs recording if Metrc already holds it
  (e.id is null and coalesce(mx.moisture_loss_lb,0) = 0)               as needs_recording,

  case
    when mx.moisture_loss_lb is not null and mx.moisture_loss_lb > 0
      then 'RECORDED IN METRC — ' || round(mx.moisture_loss_lb,1)
           || ' lb of moisture loss on the Harvests-Inactive report ('
           || round(coalesce(mx.moisture_pct,0),1) || '%). Nothing to do. The Metrc API carries '
           || 'no moisture field, only a residual, which is why the remaining weight still shows.'
    when mx.harvest_batch is not null and h.harvest_name ~* '(^|[^a-z])FF([^a-z]|$)'
      then 'FRESH FROZEN — packaged wet and never dried, so zero moisture loss is CORRECT. '
           || 'Not a gap.'
    when e.id is null and h.harvest_closed is not null
      then 'NOT IN METRC — closed harvest with no moisture loss on the Harvests-Inactive '
           || 'report. Record it in Metrc against this harvest.'
    when e.id is null
      then 'OPEN HARVEST — still packaging off, so remaining weight is expected. Moisture is '
           || 'only recorded when the harvest closes.'
    when not e.recorded_in_metrc
      then 'RECORDED HERE, NOT YET IN METRC — ' || e.moisture_loss_lb || ' lb entered by '
           || e.entered_by || ' on ' || e.entered_at::date || ' by ' || e.method || '.'
    else 'DONE — ' || e.moisture_loss_lb || ' lb by ' || e.method || ', entered by '
         || e.entered_by || ' on ' || e.entered_at::date || ', Metrc adjustment '
         || e.metrc_adjustment_ref || '.'
  end                                                                  as status
from v_harvest_forensic h
left join lateral (
  select m.harvest_batch, m.moisture_loss_lb, m.moisture_pct, m.finished_on
  from metrc_rpt_harvest_moisture m
  where m.harvest_batch = h.harvest_name
  order by m.imported_at desc limit 1
) mx on true
left join lateral (
  select m.id, m.harvest_name, m.wet_lb_at_entry, m.packaged_lb_at_entry, m.metrc_showed_lb,
         m.moisture_loss_lb, m.method, m.recorded_in_metrc, m.metrc_adjustment_ref,
         m.entered_by, m.entered_at, m.note
  from moisture_loss_entries m
  where m.harvest_name = h.harvest_name
  order by m.entered_at desc limit 1
) e on true
where h.still_in_room_lb > 0 and h.wet_lb > 0
order by (case when h.harvest_closed is not null then 0 else 1 end),
         (e.id is null) desc,
         (h.still_in_room_lb - greatest(h.wet_lb * (1 - (select r.loss from r)) - h.packaged_lb, 0)) desc;

comment on view v_moisture_loss_register is
  'Asks METRC first. needs_recording is true only where the Harvests-Inactive export genuinely '
  'holds no moisture loss - 5 harvests, not 269. The previous definition tested only whether a '
  'row existed in moisture_loss_entries, our own register, which has ZERO rows: a check that '
  'could not fail and flagged every harvest ever. Fresh-frozen harvests are labelled correct '
  'rather than flagged.';;
