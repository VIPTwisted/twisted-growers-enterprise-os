/* Loosen the duplicate test: match on figures, not wording.
   ---------------------------------------------------------
   Matching on wording missed five pairs because the two agents describe the
   same thing differently - "78.0 lb of concentrate never submitted for
   testing" against "78.0 lb of concentrate has never been submitted for
   laboratory testing". Same dollars to the penny, same pounds to the tenth,
   $241,560 counted twice.

   The figures are the stronger signal. Two genuinely different findings
   agreeing to the penny AND to a tenth of a pound AND on severity would be
   indistinguishable in substance anyway. Wording is dropped from the key.

   Still conservative: a finding missing either figure is never merged, and
   nothing is deleted - every copy stays visible in the drill-down. */

create or replace view v_findings as
with raw as (
  select 'agent:'||f.id::text as finding_key, 'agent'::text as source,
    coalesce(nullif(f.agent,''),'Unassigned') as department, f.severity,
    f.headline as what, f.scope as where_it_is, null::text as who_is_accountable,
    f.detail as why_it_matters, f.action as what_to_do, null::text as the_arithmetic,
    null::text as how_it_was_detected, null::text as when_it_started,
    case when f.metric is not null then f.metric::text||' '||coalesce(f.units,'') end as evidence,
    null::integer as record_count, null::numeric as pounds, f.dollars,
    f.detected_at as first_raised, f.detected_at as last_seen, 1 as times_seen,
    f.resolved_at, f.resolution as resolution_note, f.fingerprint,
    'agent:'||coalesce(f.agent,'?') as pattern_key, f.drill_to as drill
  from agent_findings f
  union all
  select 'watchdog:'||w.id::text, 'watchdog', 'Unassigned',
    w.severity, w.what, w.where_it_is, w.who_is_accountable, w.why_it_matters,
    w.what_to_do, w.the_arithmetic, w.how_it_was_detected, w.when_it_started,
    w.evidence::text, w.record_count, w.pounds, w.dollars,
    w.observed_at, w.observed_at, 1, null::timestamptz, null::text, w.fingerprint,
    'watchdog:'||left(coalesce(w.how_it_was_detected,'?'),80), w.drill
  from watchdog_findings w
  union all
  select 'custody:'||c.id::text, 'custody', 'Compliance', c.severity, c.flag,
    concat_ws(' · ', nullif(c.item,''), nullif(c.location,''), nullif(c.identifier,'')),
    null::text, c.detail, null::text, null::text, null::text, null::text,
    case when c.quantity is not null then c.quantity::text||' '||coalesce(c.uom,'') end,
    null::integer,
    case when lower(coalesce(c.uom,'')) in ('lb','lbs','pound','pounds') then c.quantity end,
    null::numeric,
    coalesce(c.reference_date::timestamptz, c.captured_at), c.captured_at, 1,
    c.resolved_at, c.resolution_note, null::text,
    'custody:'||coalesce(c.flag,'?'), null::text
  from custody_alert_log c
  union all
  select 'inventory:'||i.id::text, 'inventory',
    coalesce(nullif(i.area,''),'Inventory'), i.severity, i.headline, i.area,
    null::text, i.detail, i.what_to_do, null::text, null::text, null::text, null::text,
    null::integer, i.pounds, i.dollars, i.first_raised, i.last_seen,
    coalesce(i.times_seen,1), i.resolved_at, i.resolution_note, i.fingerprint,
    'inventory:'||coalesce(i.area,'?'), i.drill
  from inventory_alerts i
),
marked as (
  select r.*,
    case when r.dollars is not null and r.pounds is not null
         then r.severity||'|'||r.dollars::text||'|'||r.pounds::text
    end as merge_key
  from raw r
),
ranked as (
  select m.*,
    case when m.merge_key is null then m.finding_key
         else first_value(m.finding_key) over (
                partition by m.merge_key order by m.first_raised, m.finding_key)
    end as canon
  from marked m
)
select
  k.finding_key, k.source, k.department, k.severity, k.what, k.where_it_is,
  k.who_is_accountable, k.why_it_matters, k.what_to_do, k.the_arithmetic,
  k.how_it_was_detected, k.when_it_started, k.evidence, k.record_count,
  k.pounds, k.dollars, k.first_raised, k.last_seen, k.times_seen,
  k.resolved_at, k.resolution_note, k.fingerprint, k.pattern_key, k.drill,
  case when k.resolved_at is null then 'open' else 'resolved' end as state,
  case k.severity when 'critical' then 1 when 'elevated' then 2
                  when 'watch' then 3 else 4 end as severity_rank,
  count(*) filter (where k.first_raised >= now() - interval '6 months')
      over (partition by k.pattern_key) as occurrences_6mo,
  (case k.severity when 'critical' then 1 else 2 end) as priority_band,
  k.canon                          as canonical_key,
  (k.canon <> k.finding_key)       as is_duplicate,
  case when k.canon <> k.finding_key then k.canon end as duplicate_of
from ranked k;

grant select on v_findings to authenticated;;
