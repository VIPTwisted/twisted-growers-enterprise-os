-- Owner, 10 Aug 2026: "you will need to be sure every item has note area where we can
-- document notes like this."
--
-- THE NOTE THAT PROVED THE NEED. 26 manifests to Eagle Eyes Transport Solutions (MT281320)
-- were classified as SALES by prefix - MT is Transporter in licence_type_prefix - and one of
-- them carried $142,736. Reclassifying them as haulage would have been just as wrong. The
-- truth is only knowable from the owner: Eagle Eyes was THIRD-PARTY STORAGE. They warehoused
-- our inventory and shipped on our behalf for a few months; the material was ours throughout,
-- and it all came back because the storage conditions were unacceptable. 12 manifests out from
-- 2024-08-26, 19 back between 2024-10-24 and 2025-02-04.
--
-- No amount of schema, prefix table or reconciliation logic could have derived that. It is
-- business history, and without somewhere to put it the same wrong conclusion gets rediscovered
-- by the next agent, every time. That is what this table is for.
--
-- Deliberately polymorphic: a note belongs on whatever the fact concerns - a licence, a
-- manifest, a package tag, an order, a customer. A note on the LICENCE explains all 31 Eagle
-- Eyes manifests at once and keeps explaining the next one.
--
-- UNDO: drop view v_entity_note_active; drop table entity_note;

create table if not exists entity_note (
  id             bigint generated always as identity primary key,
  entity_type    text not null check (entity_type in
                   ('licence','manifest','package_tag','sales_order','customer','sku',
                    'batch','invoice','harvest','room','other')),
  entity_key     text not null,
  note_kind      text not null default 'context' check (note_kind in
                   ('context','correction','dispute','decision','warning','commercial')),
  note           text not null,
  applies_from   date,
  applies_to     date,
  author         text not null default f_actor(),
  created_at     timestamptz not null default now(),
  -- Append-only in spirit: a revision SUPERSEDES rather than overwrites, so what was believed
  -- at the time survives. Same pattern as item_flag_decision (rule H2).
  superseded_by  bigint references entity_note(id),
  superseded_at  timestamptz,
  constraint note_is_a_real_note check (length(btrim(note)) >= 20),
  constraint note_dates_ordered check (applies_to is null or applies_from is null
                                       or applies_to >= applies_from),
  constraint note_supersede_is_whole check ((superseded_by is null) = (superseded_at is null))
);

create index if not exists entity_note_lookup_idx on entity_note (entity_type, entity_key)
  where superseded_at is null;

comment on table entity_note is
  'Free-text business context attached to anything: a licence, a manifest, a package tag, an '
  'order, a customer. For the facts no schema can derive. Written because 26 manifests to a '
  'TRANSPORTER licence looked like sales, then looked like haulage, and were actually '
  'third-party storage of our own inventory - knowable only from the owner. A revision '
  'supersedes rather than overwrites, so what was believed at the time survives (rule H2). '
  'applies_from / applies_to bound a note to the period it describes: a relationship that '
  'ended should stop explaining manifests dated after it ended.';

alter table entity_note enable row level security;
create policy entity_note_read  on entity_note for select using (true);
create policy entity_note_write on entity_note for all
  using (f_caller_is_admin() or is_executive()) with check (f_caller_is_admin() or is_executive());

create or replace view v_entity_note_active as
select id, entity_type, entity_key, note_kind, note, applies_from, applies_to, author, created_at
from entity_note where superseded_at is null;

alter view v_entity_note_active set (security_invoker = on);

comment on view v_entity_note_active is
  'Current notes only - superseded revisions are retained in entity_note but hidden here.';

-- THE FIRST NOTE, from the owner, 10 Aug 2026.
insert into entity_note (entity_type, entity_key, note_kind, note, applies_from, applies_to, author)
values (
 'licence', 'MT281320', 'commercial',
 'Eagle Eyes Transport Solutions, LLC — THIRD-PARTY INVENTORY STORAGE, not a customer and not '
 'simply a haulier. They warehoused our finished inventory and shipped it on our behalf for a '
 'short period. THE MATERIAL REMAINED OURS THROUGHOUT: a manifest to this licence is a '
 'movement of our own stock into storage, NOT a sale, and its declared value must never be '
 'counted as revenue. Sales made while the stock sat there shipped onward from their site. '
 'The arrangement ended because the storage conditions were not acceptable and everything was '
 'transferred back to our own warehouse. Measured in Metrc: 12 outbound manifests from '
 '2024-08-26, 19 inbound returns between 2024-10-24 and 2025-02-04, last movement 2025-02-20. '
 'Counting the outbound leg as revenue overstates sales by the value of our own stock — one '
 'manifest alone, 0002431657 on 2024-08-26, carries a declared $142,736. Owner, 10 Aug 2026.',
 date '2024-08-26', date '2025-02-20',
 'Owner via Agent G / TG-07 Sales, 10 Aug 2026');

select entity_type, entity_key, note_kind, applies_from, applies_to, left(note,80)||'…' preview
from v_entity_note_active;;
