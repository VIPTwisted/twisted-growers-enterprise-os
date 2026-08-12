-- THE SEED-TO-SALE SPINE. Owner, 11 Aug 2026: every tag tracked seed to sale
-- including third-party purchases and trades, with DAYS IN EVERY LOCATION, so cash
-- is not tied up in inventory nobody is watching.
--
-- WHY A LEDGER AND NOT A STATUS COLUMN. A status field says where a tag IS. The
-- owner is asking where it has BEEN and FOR HOW LONG. Dwell is the arithmetic
-- between consecutive events, so it cannot be computed from a current-state table -
-- no amount of querying metrc_packages produces it.

create table if not exists public.tag_event (
  id            bigserial primary key,
  tag           text not null,
  event_at      timestamptz not null,
  event_type    text not null check (event_type in
                  ('packaged','received','shipped','tested','location_change','sold','trade','adjusted')),
  stage         text,
  location      text,
  manifest_number text,
  counterparty_licence text,
  qty           numeric,
  uom           text,
  ours          boolean,
  source        text not null,
  source_row    text,
  created_at    timestamptz not null default now()
);
create unique index if not exists tag_event_dedupe
  on public.tag_event (tag, event_at, event_type, source, coalesce(source_row,''));
create index if not exists tag_event_tag_time on public.tag_event (tag, event_at);
create index if not exists tag_event_manifest on public.tag_event (manifest_number) where manifest_number is not null;

comment on table public.tag_event is
  'Append-only seed-to-sale ledger: one row per movement, stage or custody change. Dwell is derived from consecutive rows and CANNOT come from a current-state table. Every row names the source it came from, so any figure walks back to its record.';

alter table public.tag_event enable row level security;
drop policy if exists tag_event_read on public.tag_event;
create policy tag_event_read on public.tag_event for select to authenticated using (true);
grant select on public.tag_event to tg_desktop_reader;

-- 1. PACKAGED
insert into public.tag_event (tag, event_at, event_type, stage, location, qty, uom, source, source_row)
select p.tag, p.packaged_on::timestamptz, 'packaged', 'packaged', p.location,
       p.quantity, p.uom, 'metrc_packages', p.id::text
from public.metrc_packages p
where p.tag is not null and p.packaged_on is not null
on conflict do nothing;

-- 2. SHIPPED / RECEIVED - where third-party purchases and resales appear.
insert into public.tag_event (tag, event_at, event_type, stage, manifest_number,
                              counterparty_licence, qty, uom, source, source_row)
select t.package_tag,
       coalesce(t.received_on::timestamptz, t.as_of_date::timestamptz),
       case when t.received_on is not null then 'received' else 'shipped' end,
       'in transit', t.manifest_number, t.destination_licence,
       coalesce(t.received_qty, t.shipped_qty), t.shipped_uom,
       'metrc_rpt_package_transfers', t.source_row::text
from public.metrc_rpt_package_transfers t
where t.package_tag is not null
  and coalesce(t.received_on, t.as_of_date) is not null
on conflict do nothing;

-- 3. TESTED. report_date is TEXT and holds PDF-parser junk - one value is
--    "6/2/2026 508-465-3470 lab-ma@greenanalyticslabs.com", a date with a phone
--    number and an email bled into it. Casting the column outright aborts the whole
--    migration, so ONLY values that are unambiguously a date are taken. The rest are
--    left out and COUNTED by v_tag_dwell_coverage below - a tag with no test event
--    is reported as unknown, never as tested-on-some-guessed-day.
--    report_date is when the certificate was ISSUED: the END of the testing dwell.
insert into public.tag_event (tag, event_at, event_type, stage, source, source_row)
select c.package_tag,
       case
         when c.report_date ~ '^\s*\d{4}-\d{2}-\d{2}' then substring(c.report_date from '\d{4}-\d{2}-\d{2}')::date::timestamptz
         when c.report_date ~ '^\s*\d{1,2}/\d{1,2}/\d{4}' then to_date(substring(c.report_date from '\d{1,2}/\d{1,2}/\d{4}'), 'FMMM/FMDD/YYYY')::timestamptz
       end,
       'tested', 'tested', 'coa_extract', c.document_id::text
from public.coa_extract c
where c.package_tag is not null
  and c.report_date is not null
  and (c.report_date ~ '^\s*\d{4}-\d{2}-\d{2}' or c.report_date ~ '^\s*\d{1,2}/\d{1,2}/\d{4}')
on conflict do nothing;

-- ------------------------------------------------------------ EDITABLE TARGETS --
create table if not exists public.turnaround_target (
  id            bigserial primary key,
  scope         text not null default 'company',
  scope_value   text,
  stage         text not null,
  target_days   int  not null check (target_days > 0),
  warn_at_pct   int  not null default 80 check (warn_at_pct between 1 and 100),
  why           text,
  set_by        text,
  updated_at    timestamptz not null default now()
);
create unique index if not exists turnaround_target_scope
  on public.turnaround_target (scope, coalesce(scope_value,''), stage);

comment on table public.turnaround_target is
  'Editable turnaround targets per stage, optionally per category or product type. Alerts READ these instead of embedding a number, so changing a target changes the alert. Placeholders are marked UNAPPROVED on purpose: 21 pay rates once shipped with exactly the confidence of rates somebody had actually approved.';

alter table public.turnaround_target enable row level security;
drop policy if exists tt_read on public.turnaround_target;
create policy tt_read on public.turnaround_target for select to authenticated using (true);
grant select on public.turnaround_target to tg_desktop_reader;

insert into public.turnaround_target (scope, scope_value, stage, target_days, why, set_by) values
  ('company', null, 'tested',     7,  'PLACEHOLDER - NOT owner-approved. Packaged to COA in hand.', 'placeholder'),
  ('company', null, 'on hand',    30, 'PLACEHOLDER - NOT owner-approved. Packaged and unsold. The cash figure.', 'placeholder'),
  ('company', null, 'in transit', 3,  'PLACEHOLDER - NOT owner-approved. Manifest created to received.', 'placeholder'),
  ('company', null, 'overall',    60, 'PLACEHOLDER - NOT owner-approved. Packaged to sold, end to end.', 'placeholder')
on conflict do nothing;;
