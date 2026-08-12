-- TG Enterprise OS — 0006 License scoping + hot-path indexes (Deep-Scope items 1 & 24)
-- Metrc operations are per-license; operational rows must carry license context for exact reconciliation.

alter table harvests add column license_id uuid references licenses(id);
alter table lots add column license_id uuid references licenses(id);
alter table shipments add column license_id uuid references licenses(id);
alter table test_requests add column license_id uuid references licenses(id);

create index idx_lots_status on lots(status);
create index idx_lots_license on lots(license_id);
create index idx_lots_expires on lots(expires_on) where expires_on is not null;
create index idx_allocations_lot on allocations(lot_id);
create index idx_allocations_wo on allocations(work_order_id);
create index idx_time_entries_emp_date on time_entries(employee_id, work_date);
create index idx_schedule_emp_date on schedule_assignments(employee_id, work_date);
create index idx_metrc_packages_license_sync on metrc_packages(license, synced_at);
create index idx_audit_entity on audit_events(entity, entity_id);
create index idx_test_requests_status on test_requests(status);
create index idx_sales_orders_status on sales_orders(status);;
