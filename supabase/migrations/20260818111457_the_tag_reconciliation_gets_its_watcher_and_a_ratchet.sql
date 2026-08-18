/* The Metrc<->Apex tag reconciliation gets its watcher, and a ratchet.
 *
 * Owner, 18 Aug 2026: "THERE MUST BE AGENT THAT REVIEW AND ALSO A WATCHER ETC AS WE
 * SETUP ALREADY FOR OTHERS." Same discipline as the matview healer and the stock-ageing
 * watcher: the owner is never the detector, and a number that should only improve is
 * HELD to that by a recorded baseline, not by hope.
 *
 * Baseline at creation, 18 Aug 2026 (15,986 outbound tags):
 *   ABSENT FROM APEX            937 tags   4,587.2 lb
 *   APEX HAS IT - JOIN BROKEN 2,454 tags   1,517.0 lb
 * Fixes for both are in flight (deal-docs sync; licence-digits join). This watcher
 * raises a finding if either class GROWS above its recorded baseline - which would mean
 * new unreconciled sales are being created faster than old ones are being closed - and
 * RATCHETS the baseline DOWN as the classes shrink, so recovered ground can never be
 * silently given back.
 */

create table if not exists public.tag_reconciliation_baseline (
  verdict_class text primary key,
  max_tags      integer not null,
  measured_lb   numeric,
  set_on        date not null default current_date,
  why           text not null
);

comment on table public.tag_reconciliation_baseline is
  'The ratchet for v_metrc_apex_tag_reconciliation. Each shrinkable verdict class may '
  'never exceed its recorded ceiling; the watcher lowers the ceiling as the class '
  'shrinks, so ground recovered is never silently lost. Agent I, 18 Aug 2026.';

insert into public.tag_reconciliation_baseline (verdict_class, max_tags, measured_lb, why) values
('ABSENT FROM APEX', 937, 4587.2,
 'Baseline at creation. Expected to collapse when deal-docs syncs; must never grow — '
 || 'growth means new sales are shipping without invoices TODAY.'),
('JOIN BROKEN', 2454, 1517.0,
 'Baseline at creation. Closes when the standing match rule compares licence digits; '
 || 'must never grow.')
on conflict (verdict_class) do nothing;

alter table public.tag_reconciliation_baseline enable row level security;
drop policy if exists trb_read on public.tag_reconciliation_baseline;
create policy trb_read on public.tag_reconciliation_baseline for select to authenticated using (true);
grant select on public.tag_reconciliation_baseline to tg_desktop_reader;

create or replace function public.f_check_tag_reconciliation(p_by text default 'watcher')
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_absent int; v_broken int; v_absent_lb numeric; v_broken_lb numeric;
  b_absent int; b_broken int; v_raised int := 0;
begin
  select count(distinct package_tag), round(coalesce(sum(lb),0)::numeric,1)
    into v_absent, v_absent_lb
    from v_metrc_apex_tag_reconciliation where verdict like 'ABSENT FROM APEX%';
  select count(distinct package_tag), round(coalesce(sum(lb),0)::numeric,1)
    into v_broken, v_broken_lb
    from v_metrc_apex_tag_reconciliation where verdict like 'APEX HAS IT%';

  select max_tags into b_absent from tag_reconciliation_baseline where verdict_class='ABSENT FROM APEX';
  select max_tags into b_broken from tag_reconciliation_baseline where verdict_class='JOIN BROKEN';

  /* Ratchet DOWN on improvement — recovered ground is kept. */
  update tag_reconciliation_baseline set max_tags = v_absent, measured_lb = v_absent_lb, set_on = current_date
   where verdict_class='ABSENT FROM APEX' and v_absent < max_tags;
  update tag_reconciliation_baseline set max_tags = v_broken, measured_lb = v_broken_lb, set_on = current_date
   where verdict_class='JOIN BROKEN' and v_broken < max_tags;

  if v_absent > b_absent then
    insert into watchdog_findings (observed_at, fingerprint, severity, what, where_it_is,
      who_is_accountable, when_it_started, why_it_matters, how_it_was_detected, what_to_do,
      the_arithmetic, evidence, record_count, pounds, solutions, guard_recommendation)
    values (now(), 'tag_recon_absent_grew|' || to_char(current_date,'IYYY-IW'), 'critical',
      'Tags ABSENT FROM APEX grew to ' || v_absent || ' against a ratchet of ' || b_absent
        || '. New sales are shipping without an Apex invoice RIGHT NOW.',
      'v_metrc_apex_tag_reconciliation, verdict ABSENT FROM APEX.',
      'Agent S, Sales & Apex.', 'Detected ' || current_date || '.',
      'Every tag above the ratchet is a fresh shipment with no invoice — not backlog, new leakage.',
      'f_check_tag_reconciliation daily against tag_reconciliation_baseline.',
      'Find the manifests newer than the baseline date in the ABSENT class and invoice them.',
      v_absent || ' vs ratchet ' || b_absent || '; ' || v_absent_lb || ' lb in class.',
      jsonb_build_object('now', v_absent, 'ratchet', b_absent, 'lb', v_absent_lb),
      v_absent - b_absent, v_absent_lb,
      array['Invoice the new shipments in Apex.',
            'If deal-docs landed and closed old ones while new appeared, the net can still '
              || 'breach — read the per-manifest list, not just the count.'],
      'Never raise the baseline to quiet this. The ratchet only moves down.');
    v_raised := v_raised + 1;
  end if;

  if v_broken > b_broken then
    insert into watchdog_findings (observed_at, fingerprint, severity, what, where_it_is,
      who_is_accountable, when_it_started, why_it_matters, how_it_was_detected, what_to_do,
      the_arithmetic, evidence, record_count, solutions, guard_recommendation)
    values (now(), 'tag_recon_joinbroken_grew|' || to_char(current_date,'IYYY-IW'), 'elevated',
      'JOIN BROKEN tags grew to ' || v_broken || ' against a ratchet of ' || b_broken || '.',
      'v_metrc_apex_tag_reconciliation, verdict APEX HAS IT.',
      'Agent S, Sales & Apex.', 'Detected ' || current_date || '.',
      'Apex holds these orders; only the licence-format join loses them. Growth means the '
        || 'join repair has not shipped or has regressed.',
      'f_check_tag_reconciliation daily against tag_reconciliation_baseline.',
      'Land the licence-digits comparison in the standing match rule.',
      v_broken || ' vs ratchet ' || b_broken || '.',
      jsonb_build_object('now', v_broken, 'ratchet', b_broken),
      v_broken - b_broken,
      array['Repair the join on licence digits — digits must agree exactly.'],
      'Never widen matching beyond digits-agree: suffix-variant matching produced 163 '
        || 'false pairs from 4 licences on 9 Aug.');
    v_raised := v_raised + 1;
  end if;

  return jsonb_build_object('raised', v_raised,
    'absent', v_absent, 'absent_ratchet', b_absent,
    'join_broken', v_broken, 'join_broken_ratchet', b_broken,
    'note', case when v_raised = 0 then 'Both classes at or below their ratchets.'
                 else 'Growth detected — findings raised.' end);
end $function$;

comment on function public.f_check_tag_reconciliation(text) is
  'Daily watcher for the Metrc<->Apex per-tag reconciliation. The two shrinkable classes '
  'may only shrink: the ratchet lowers on improvement and a breach raises a finding, so '
  'the owner is never the detector. Agent I, 18 Aug 2026.';

select cron.schedule('tag-reconciliation-watch', '40 6 * * *',
  'select f_check_tag_reconciliation(''watcher'')');;
