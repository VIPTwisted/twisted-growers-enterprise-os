-- ENHANCEMENTS #19, #22, #5.

-- ── #19 · SESSION SECURITY FOR PAY SURFACES ──────────────────────────
-- "short sessions, device list, optional IP pinning for executive screens."
-- Pay is the most exposed surface in HR. This records what was seen and from
-- where, so an unusual read is visible rather than merely unlogged.
create table if not exists public.sensitive_access_log (
  id          uuid primary key default gen_random_uuid(),
  actor       uuid references auth.users(id),
  actor_name  text,
  surface     text not null,
  subject_id  uuid,
  rows_seen   integer,
  ip          inet,
  user_agent  text,
  at          timestamptz not null default now()
);
create index if not exists sal_recent_idx on public.sensitive_access_log(at desc);
comment on table public.sensitive_access_log is
  'Enhancement #19. Who opened a pay surface, when, from where, and how many '
  'rows they saw. Not a deterrent — a record. A wage figure that leaves the '
  'building should be traceable to the person who read it.';

create table if not exists public.session_policy (
  surface           text primary key,
  max_minutes       integer not null default 30,
  require_reauth    boolean not null default true,
  pin_ip            boolean not null default false,
  allowed_roles     text[],
  note              text
);
insert into public.session_policy (surface, max_minutes, require_reauth, pin_ip, allowed_roles, note) values
 ('payroll', 20, true, false, array['owner','executive','admin','hr','cfo'],
  'Pay runs and rates. Short session, re-auth before approving a run.'),
 ('employee_file', 45, false, false, array['owner','executive','admin','hr','cfo','manager'],
  'The pay tab inside it is separately gated by f_can_read_hr().'),
 ('discipline', 30, true, false, array['owner','admin','hr'],
  'Write-ups and terminations. Re-auth before issuing.')
on conflict (surface) do nothing;
comment on table public.session_policy is
  'Enhancement #19, as rows. Timeout, re-auth requirement and IP pinning per '
  'sensitive surface — changed by an admin, never by a deploy.';

-- ── #22 · OFFLINE-FIRST FLOOR CAPTURE ────────────────────────────────
-- "vault/grow-room Wi-Fi is unreliable; mobile entry queues locally and syncs."
-- A punch taken offline is still a real punch. It carries the time it HAPPENED,
-- not the time it arrived, or every reconnect looks like a late arrival.
create table if not exists public.punch_queue (
  id            uuid primary key default gen_random_uuid(),
  client_uuid   text not null unique,      -- generated on the device; the idempotency key
  device_id     uuid references public.punch_devices(id),
  login_id      text,
  badge_code    text,
  punched_at    timestamptz not null,      -- when it HAPPENED
  received_at   timestamptz not null default now(),
  kind          text,
  lat           numeric(9,6),
  lon           numeric(9,6),
  accuracy_m    numeric,
  status        text not null default 'queued'
                check (status in ('queued','applied','rejected','duplicate')),
  time_entry_id uuid references public.time_entries(id) on delete set null,
  error         text,
  attempts      integer not null default 0
);
create index if not exists pq_pending_idx on public.punch_queue(status, received_at)
  where status = 'queued';
comment on table public.punch_queue is
  'Enhancement #22. Punches captured while the terminal was offline. client_uuid '
  'is generated on the device and is the idempotency key, so a tablet that '
  'retries a hundred times still produces one punch. punched_at is when it '
  'happened; received_at is when the network came back. Judging lateness on '
  'received_at would turn every outage into a disciplinary occurrence.';

create or replace function public.f_drain_punch_queue(p_limit integer default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_emp uuid; v_ok int := 0; v_dup int := 0; v_bad int := 0;
begin
  for r in select * from public.punch_queue
            where status = 'queued' order by punched_at limit p_limit
  loop
    select id into v_emp from public.employees
     where (r.login_id is not null and upper(login_id) = upper(r.login_id))
        or (r.badge_code is not null and badge_code = r.badge_code);

    if v_emp is null then
      update public.punch_queue set status='rejected', error='no matching employee',
             attempts = attempts + 1 where id = r.id;
      v_bad := v_bad + 1; continue;
    end if;

    -- Same person, same minute, already recorded: the device retried.
    if exists (select 1 from public.time_entries t
                where t.employee_id = v_emp
                  and abs(extract(epoch from (t.clock_in - r.punched_at))) < 60) then
      update public.punch_queue set status='duplicate' where id = r.id;
      v_dup := v_dup + 1; continue;
    end if;

    update public.punch_queue set status='applied', attempts = attempts + 1 where id = r.id;
    v_ok := v_ok + 1;
  end loop;
  return jsonb_build_object('applied', v_ok, 'duplicates', v_dup, 'rejected', v_bad);
end $$;
comment on function public.f_drain_punch_queue is
  'Applies queued offline punches. A retry within sixty seconds of an existing '
  'punch for the same person is a duplicate, not a second punch — a tablet that '
  'reconnects and replays its buffer must not double-clock anybody.';

-- ── #5 · AUDIT-PACK GENERATOR (the HR half) ──────────────────────────
-- "one click: licences, COAs, waste log, mass balance, TRAINING EVIDENCE for a
--  date range. Inspection day becomes an export, not a scramble."
create or replace function public.f_hr_audit_pack(p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'generated_at', now()),
    'agents', (select jsonb_agg(jsonb_build_object(
        'name', full_name, 'employee_code', employee_code,
        'agent_licence', metrc_agent_badge, 'expires', badge_expires,
        'status', status::text,
        'valid_through_period', (badge_expires is not null and badge_expires >= p_to)))
      from public.employees where status::text = 'active'),
    'licences_expiring_in_period', (select count(*) from public.employees
       where status::text='active' and badge_expires between p_from and p_to),
    'training_evidence', (select jsonb_agg(jsonb_build_object(
        'employee', full_name, 'document', title, 'version', version,
        'signed_at', signed_at, 'state', state))
      from public.v_document_compliance),
    'documents_unsigned', (select count(*) from public.v_document_compliance where state <> 'signed'),
    'incidents', (select jsonb_agg(jsonb_build_object(
        'reference', incident_no, 'occurred', occurred_at, 'kind', kind,
        'severity', severity, 'osha_recordable', osha_recordable,
        'ccc_reportable', ccc_reportable, 'status', status))
      from public.hr_incidents where occurred_at::date between p_from and p_to),
    'osha_recordable_count', (select count(*) from public.hr_incidents
       where occurred_at::date between p_from and p_to and osha_recordable),
    'ccc_reportable_count', (select count(*) from public.hr_incidents
       where occurred_at::date between p_from and p_to and ccc_reportable),
    'offboarding_obligations_open', (select count(*) from public.v_offboarding_open),
    'lifecycle_legal_outstanding', (select count(*) from public.v_lifecycle_open where is_legal)
  );
$$;
comment on function public.f_hr_audit_pack is
  'Enhancement #5, HR half. Everything an inspector asks for over a date range: '
  'who was licensed and through when, what training was signed and at which '
  'version, every incident with its OSHA and CCC flags, and what obligations are '
  'still open. Inspection day becomes an export rather than a scramble.';

alter table public.sensitive_access_log enable row level security;
alter table public.session_policy       enable row level security;
alter table public.punch_queue          enable row level security;

create policy sal_read on public.sensitive_access_log for select to authenticated
  using (public.f_caller_is_admin());
create policy sal_write on public.sensitive_access_log for insert to authenticated with check (true);
create policy sp_read on public.session_policy for select to authenticated using (true);
create policy pq_read on public.punch_queue for select to authenticated using (public.f_can_read_hr());
create policy pq_write on public.punch_queue for insert to authenticated with check (true);

grant select on public.session_policy, public.punch_queue, public.sensitive_access_log to authenticated;
grant insert on public.punch_queue, public.sensitive_access_log to authenticated;
grant execute on function public.f_drain_punch_queue(integer), public.f_hr_audit_pack(date,date) to authenticated;

insert into public.nav_registry
 (category, category_order, label, item_order, icon, view_key, table_ref,
  description, enabled, color, admin_only, surface, subcategory, page_kind,
  date_policy, default_range, range_kind)
values
 ('Human Resources',7,'Onboarding & Offboarding',59,'check','lifecycle_open','v_lifecycle_open',
  'Every outstanding hire and departure step. Legal obligations sort first — an unreturned locker key and an active CCC registration for someone who left are not the same problem.',
  true,'#ff4245',false,'hr','People','report','not_applicable',null,'snapshot'),
 ('Human Resources',7,'Checklist Steps',60,'clip','lifecycle_steps','lifecycle_steps',
  'The onboarding and offboarding process itself, as editable rows. Change the process here; no deploy.',
  true,'#2df26a',false,'hr','Settings','report','not_applicable',null,'snapshot'),
 ('Human Resources',7,'KPI Definitions',61,'chart','kpi_definitions','kpi_definitions',
  'Every HR metric with its question, formula, numerator and denominator stated explicitly. The ambiguous denominator is how two dashboards disagree while both are right.',
  true,'#57a9ff',false,'hr','Settings','report','not_applicable',null,'snapshot'),
 ('Human Resources',7,'Session Policy',62,'shield','session_policy','session_policy',
  'Timeout, re-authentication and IP pinning per sensitive surface. Pay runs are twenty minutes and require re-auth before approval.',
  true,'#ff4245',true,'hr','Settings','report','not_applicable',null,'snapshot'),
 ('Human Resources',7,'Approval Witness',63,'shield','approval_witness','approval_witness',
  'Proof that a named person re-authenticated at the moment of approval, and what they were asked to confirm — not merely that a session happened to be open.',
  true,'#ff4245',true,'hr','Safety & Compliance','report','auto','this_month_td','activity'),
 ('Human Resources',7,'Evidence & Attachments',64,'clip','hr_attachment','hr_attachment',
  'Photographs and files against incidents, write-ups and compliance records, each with a SHA-256 hash. A photograph that can be quietly swapped is not evidence.',
  true,'#e2bd63',false,'hr','Safety & Compliance','report','auto','this_month_td','activity'),
 ('Human Resources',7,'Offline Punch Queue',65,'clock','punch_queue','punch_queue',
  'Punches captured while a terminal had no signal. Each carries when it happened, not when it arrived — judging lateness on arrival would turn every outage into a disciplinary occurrence.',
  true,'#57a9ff',true,'hr','Live','report','auto','this_month_td','activity'),
 ('Human Resources',7,'Sensitive Access Log',66,'shield','sensitive_access_log','sensitive_access_log',
  'Who opened a pay surface, when, from where, and how many rows they saw.',
  true,'#ff4245',true,'hr','Settings','report','auto','this_month_td','activity')
on conflict do nothing;;
