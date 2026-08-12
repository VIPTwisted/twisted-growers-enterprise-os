-- ---------------------------------------------------------------------------
-- 0080 — Not every counterparty is a customer or a supplier.
--
-- Owner confirmed 11 Aug 2026: Eagle Eyes Transport WAREHOUSED OUR MATERIAL. "IT IS
-- OUR STUFF THEY WERE HOUSING FOR US AS OUR WAREHOUSE THEN WE STOPPED AND DO THAT
-- FROM OUR OWN FACILITY DUE TO ISSUES."
--
-- So 890.5 lb sent there was booked as a SALE and 372.5 lb returned as a PURCHASE.
-- Neither is either - it is our own material in storage, exactly like an internal
-- MC <-> MP transfer. Both legs must come out of the sales and purchase figures.
--
-- The same two-way signature appears on other counterparties (Flower Power Growers:
-- 745.9 lb out, 689.5 lb back). Those are NOT classified here - guessing a
-- counterparty's role from a flow pattern is exactly the inference this OS forbids.
-- They are listed as UNCLASSIFIED for the owner to rule on.
-- ---------------------------------------------------------------------------
create table if not exists counterparty_role (
  facility_name text primary key,
  licence       text,
  role          text not null check (role in
                  ('CUSTOMER','SUPPLIER','WAREHOUSE_3PL','TOLL_PROCESSOR','TRANSPORTER','UNCLASSIFIED')),
  counts_as_sale     boolean not null,
  counts_as_purchase boolean not null,
  active_from   date,
  active_to     date,
  set_by        text not null,
  note          text,
  updated_at    timestamptz not null default now()
);

comment on table counterparty_role is
  'What each counterparty actually IS. A warehouse holding our own material is '
  'neither a customer nor a supplier, and booking its legs as sales and purchases '
  'overstates both sides of the balance. counts_as_sale / counts_as_purchase drive '
  'the reconciliation directly. UNCLASSIFIED means nobody has ruled yet - it is NOT '
  'a default of "customer", and a two-way flow is a reason to ASK, never to assume.';

insert into counterparty_role (facility_name, role, counts_as_sale, counts_as_purchase,
                               active_from, active_to, set_by, note)
values
 ('Eagle Eyes Transport Solutions, LLC','WAREHOUSE_3PL', false, false,
  date '2024-08-25', date '2025-02-19','Owner (Vinny), 11 Aug 2026',
  'CONFIRMED BY OWNER: they warehoused our material for us; we then brought it back '
  'in house due to issues. 890.5 lb sent, 372.5 lb returned, across 43 manifests, '
  'ending Feb 2025 exactly as the owner described. NEITHER leg is a sale or a purchase. '
  'The 518.0 lb difference between sent and returned is an OPEN QUESTION - material '
  'that went to storage and did not come back.')
on conflict (facility_name) do update set
  role=excluded.role, counts_as_sale=excluded.counts_as_sale,
  counts_as_purchase=excluded.counts_as_purchase, note=excluded.note, updated_at=now();

-- Everyone else we have traded with, listed for the owner to rule on. Deliberately
-- UNCLASSIFIED and deliberately still counted as trade until someone says otherwise -
-- silently reclassifying on a hunch would be worse than leaving it visible.
insert into counterparty_role (facility_name, role, counts_as_sale, counts_as_purchase, set_by, note)
select x.facility, 'UNCLASSIFIED', true, true, 'auto-listed 11 Aug 2026',
       'Two-way flow: ' || round(coalesce(x.out_lb,0)::numeric,1) || ' lb sent, '
       || round(coalesce(x.in_lb,0)::numeric,1) || ' lb received. Needs an owner ruling — '
       || 'a balanced two-way flow can be storage or toll processing rather than trade.'
from (
  select coalesce(case when direction='OUTBOUND' then dest_facility else origin_facility end) as facility,
         sum(pounds) filter (where direction='OUTBOUND') as out_lb,
         sum(pounds) filter (where direction='INBOUND')  as in_lb
  from v_transfer_line
  where voided<>'True' and pounds is not null and direction in ('OUTBOUND','INBOUND')
  group by 1
  having sum(pounds) filter (where direction='INBOUND') > 20
     and sum(pounds) filter (where direction='OUTBOUND') > 20) x
where x.facility is not null
on conflict (facility_name) do nothing;

alter table counterparty_role enable row level security;
drop policy if exists counterparty_role_manage on counterparty_role;
create policy counterparty_role_manage on counterparty_role for all
  using (f_can_manage_inventory()) with check (f_can_manage_inventory());
grant select, insert, update, delete on counterparty_role to authenticated;

insert into nav_registry (category, label, view_key, table_ref, surface, page_kind,
                          archetype, report_group, module, icon, description,
                          date_policy, default_range, range_kind, enabled, item_order, admin_only)
values ('Reports','Counterparty Roles','counterparty_role','counterparty_role','reports','report',
  'rules_editor','Inventory & Audit','reports','truck',
  'What each counterparty actually is. A warehouse holding our own material is neither '
  'a customer nor a supplier — booking its legs as sales and purchases overstates both '
  'sides. UNCLASSIFIED means nobody has ruled yet.',
  'not_applicable','this_year','activity',true,19,true)
on conflict (view_key) do update set
  label=excluded.label, table_ref=excluded.table_ref, description=excluded.description, enabled=true;
;
