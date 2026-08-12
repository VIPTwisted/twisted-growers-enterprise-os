/* ONE FINDINGS LAYER
   ------------------
   Four agents wrote their conclusions into four tables that no view joined:
   agent_findings (681), watchdog_findings (36), custody_alert_log (63) and
   inventory_alerts (13). Every page read exactly one of them, so the CEO
   dashboard and the Intelligence Briefing looked at different findings and
   neither could see the other. 674 open; eight tiles shown.

   This is the single entity every finding lands in, whatever raised it, in one
   shape - the Dynamics "one Case entity with a type" pattern. Pages become
   filters on this rather than each holding its own source.

   ADDITIVE ONLY. Nothing is dropped, no existing view or page is altered.
   Repointing pages is a separate, deliberate step. */

create or replace view v_findings as
with raw as (

  /* ---- agent_findings: the eight watching agents ---- */
  select
    'agent:'||f.id::text                       as finding_key,
    'agent'::text                              as source,
    coalesce(nullif(f.agent,''),'Unassigned')  as department,
    f.severity,
    f.headline                                 as what,
    f.scope                                    as where_it_is,
    null::text                                 as who_is_accountable,
    f.detail                                   as why_it_matters,
    f.action                                   as what_to_do,
    null::text                                 as the_arithmetic,
    null::text                                 as how_it_was_detected,
    null::text                                 as when_it_started,
    case when f.metric is not null
         then f.metric::text||' '||coalesce(f.units,'') end as evidence,
    null::integer                              as record_count,
    null::numeric                              as pounds,
    f.dollars,
    f.detected_at                              as first_raised,
    f.detected_at                              as last_seen,
    1                                          as times_seen,
    f.resolved_at,
    f.resolution                               as resolution_note,
    f.fingerprint,
    'agent:'||coalesce(f.agent,'?')            as pattern_key,
    f.drill_to                                 as drill
  from agent_findings f

  union all

  /* ---- watchdog_findings: the narrative checks ---- */
  select
    'watchdog:'||w.id::text, 'watchdog', 'Unassigned',
    w.severity, w.what, w.where_it_is, w.who_is_accountable, w.why_it_matters,
    w.what_to_do, w.the_arithmetic, w.how_it_was_detected,
    w.when_it_started,
    w.evidence::text, w.record_count, w.pounds, w.dollars,
    w.observed_at, w.observed_at, 1,
    null::timestamptz, null::text,
    w.fingerprint,
    'watchdog:'||left(coalesce(w.how_it_was_detected,'?'), 80),
    w.drill
  from watchdog_findings w

  union all

  /* ---- custody_alert_log: compliance flags straight from Metrc ---- */
  select
    'custody:'||c.id::text, 'custody', 'Compliance',
    c.severity, c.flag,
    concat_ws(' · ', nullif(c.item,''), nullif(c.location,''), nullif(c.identifier,'')),
    null::text, c.detail, null::text, null::text, null::text, null::text,
    case when c.quantity is not null
         then c.quantity::text||' '||coalesce(c.uom,'') end,
    null::integer,
    /* only call it pounds when the unit says pounds - never assume */
    case when lower(coalesce(c.uom,'')) in ('lb','lbs','pound','pounds')
         then c.quantity end,
    null::numeric,
    coalesce(c.reference_date::timestamptz, c.captured_at), c.captured_at, 1,
    c.resolved_at, c.resolution_note,
    null::text,
    'custody:'||coalesce(c.flag,'?'),
    null::text
  from custody_alert_log c

  union all

  /* ---- inventory_alerts: already the best shape of the four ---- */
  select
    'inventory:'||i.id::text, 'inventory',
    coalesce(nullif(i.area,''),'Inventory'),
    i.severity, i.headline, i.area, null::text, i.detail, i.what_to_do,
    null::text, null::text, null::text, null::text, null::integer,
    i.pounds, i.dollars,
    i.first_raised, i.last_seen, coalesce(i.times_seen,1),
    i.resolved_at, i.resolution_note,
    i.fingerprint,
    'inventory:'||coalesce(i.area,'?'),
    i.drill
  from inventory_alerts i
)
select
  r.*,
  case when r.resolved_at is null then 'open' else 'resolved' end as state,
  case r.severity when 'critical' then 1 when 'elevated' then 2
                  when 'watch' then 3 else 4 end                  as severity_rank,
  /* How many times this KIND of problem has been raised in six months. One is
     an incident; three is a broken process - a different finding, different
     owner, different fix. */
  count(*) filter (where r.first_raised >= now() - interval '6 months')
      over (partition by r.pattern_key)                           as occurrences_6mo,
  /* Money orders the queue, but anything critical outranks it: a licence
     threat never sits behind a cash figure. */
  (case r.severity when 'critical' then 1 else 2 end)             as priority_band
from raw r;

comment on view v_findings is
  'Every finding from every agent in one shape. Pages filter this rather than reading a single source table. Additive - source tables unchanged.';

grant select on v_findings to authenticated;;
