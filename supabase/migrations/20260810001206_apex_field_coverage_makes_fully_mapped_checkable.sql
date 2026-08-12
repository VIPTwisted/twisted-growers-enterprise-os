-- Agent G, 10 Aug 2026. "FULLY MAPPED" MADE MACHINE-CHECKABLE.
--
-- Owner's rule: "nothing is ever omitted, sacrificed or shortened". Until now that was enforced
-- by somebody remembering it. This makes it a number.
--
-- WHY A MAP TABLE RATHER THAN READING THE TARGET SCHEMA. A column existing is not the same as a
-- field being mapped: sales_orders could gain a "total" column that nothing populates, and a
-- schema read would score it as covered. Mapping is a DECISION and it gets recorded as one,
-- with who made it and why - including the decision NOT to map something, which is the case a
-- coverage figure usually hides.
--
-- ALREADY EARNED ITS PLACE: the first real pull returned 6 keys on brands that Apex's own
-- OpenAPI document does not declare - company_id, created_at, license, logo_link, summary,
-- updated_at - and net-terms returned an `id` the spec omits, which is the field orders join
-- on. Mapping from the contract alone would have silently dropped a licence number from every
-- brand and made the net-terms join impossible. Raw-first is why we can see that at all.
--
-- UNDO: drop view v_apex_field_coverage; drop table apex_field_map;

create table if not exists apex_field_map (
  id            bigint generated always as identity primary key,
  entity        text not null,
  apex_key      text not null,
  disposition   text not null check (disposition in ('mapped','deliberately_unmapped')),
  target_table  text,
  target_column text,
  why           text not null,
  decided_by    text not null default f_actor(),
  decided_at    timestamptz not null default now(),
  unique (entity, apex_key),
  -- A mapped field must say WHERE it went; an unmapped one must not pretend to a destination.
  constraint map_target_matches_disposition check (
    (disposition = 'mapped') = (target_table is not null and target_column is not null)),
  -- 20 characters is not a high bar, but it refuses "n/a" and "not needed", which is how a
  -- deliberate omission becomes indistinguishable from an oversight six weeks later.
  constraint map_reason_is_a_reason check (length(btrim(why)) >= 20)
);
comment on table apex_field_map is
  'One row per Apex field per entity, recording whether it is mapped downstream or deliberately '
  'left unmapped, and WHY. The denominator is real traffic in apex_raw, never the OpenAPI spec: '
  'the spec under-declares - brands returned 6 keys it does not mention and net-terms returned '
  'the id that orders join on. A field with no row here is UNDECIDED, which is different from '
  'unmapped and is what the build gate fails on.';

alter table apex_field_map enable row level security;
create policy apex_field_map_read  on apex_field_map for select using (f_can_read_hr() or is_executive());
create policy apex_field_map_write on apex_field_map for all
  using (f_caller_is_admin()) with check (f_caller_is_admin());

-- Every key Apex has ever actually sent, against what we decided to do with it.
create or replace view v_apex_field_coverage as
with seen as (
  select r.entity, k.key as apex_key, count(*) as payloads_carrying_it,
         max(r.fetched_at) as last_seen
  from apex_raw r, lateral jsonb_object_keys(r.payload) k(key)
  group by 1, 2
),
totals as (select entity, count(*) as payloads from apex_raw group by 1)
select s.entity,
       s.apex_key,
       s.payloads_carrying_it,
       t.payloads as payloads_for_entity,
       round(100.0 * s.payloads_carrying_it / nullif(t.payloads, 0), 1) as pct_of_payloads,
       s.last_seen,
       coalesce(m.disposition, 'UNDECIDED') as disposition,
       m.target_table,
       m.target_column,
       m.why,
       m.decided_by
from seen s
join totals t on t.entity = s.entity
left join apex_field_map m on m.entity = s.entity and m.apex_key = s.apex_key;

-- security_invoker so the reader's own RLS applies. Sales sets this on every view it creates,
-- which is why the 285-view definer backlog stops growing today even while it is worked off.
alter view v_apex_field_coverage set (security_invoker = on);

comment on view v_apex_field_coverage is
  'Every key Apex has actually sent, how often, and whether a person decided what to do with '
  'it. disposition=UNDECIDED means nobody has looked - that is the number the build gate '
  'ratchets against. Measured from real traffic in apex_raw, never from the OpenAPI spec, '
  'because the spec under-declares what Apex returns.';;
