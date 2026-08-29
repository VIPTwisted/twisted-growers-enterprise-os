-- stg_mc_tag_orders: part 1 of 1, 13 rows. NOT APPLIED, branch only.
-- Licence on every row comes from the FILE, never the filename.
create table if not exists public.stg_mc_tag_orders (
  order_number text,
  source_file text not null,
  file_sha256 text not null,
  licence text not null,
  file_window text,
  ingested_at timestamptz not null default now()
);
alter table public.stg_mc_tag_orders enable row level security;
drop policy if exists stg_mc_tag_orders_read on public.stg_mc_tag_orders;
create policy stg_mc_tag_orders_read on public.stg_mc_tag_orders for select to authenticated using (true);
insert into public.stg_mc_tag_orders (order_number,source_file,file_sha256,licence,file_window) values
('MA-2026-187-743602','Metrc-Massachusetts-MC281714-TagOrders-History (1).xlsx','bb14c3cc05b82d36f5649684d9dd2ee333f9f4f2aac5dc6ee431f8372de1a914','MC281714',null),
('MA-2026-106-720503','Metrc-Massachusetts-MC281714-TagOrders-History (1).xlsx','bb14c3cc05b82d36f5649684d9dd2ee333f9f4f2aac5dc6ee431f8372de1a914','MC281714',null),
('MA-2026-014-694301','Metrc-Massachusetts-MC281714-TagOrders-History (1).xlsx','bb14c3cc05b82d36f5649684d9dd2ee333f9f4f2aac5dc6ee431f8372de1a914','MC281714',null),
('MA-2025-325-679301','Metrc-Massachusetts-MC281714-TagOrders-History (1).xlsx','bb14c3cc05b82d36f5649684d9dd2ee333f9f4f2aac5dc6ee431f8372de1a914','MC281714',null),
('MA-2025-237-653701','Metrc-Massachusetts-MC281714-TagOrders-History (1).xlsx','bb14c3cc05b82d36f5649684d9dd2ee333f9f4f2aac5dc6ee431f8372de1a914','MC281714',null),
('MA-2025-171-632101','Metrc-Massachusetts-MC281714-TagOrders-History (1).xlsx','bb14c3cc05b82d36f5649684d9dd2ee333f9f4f2aac5dc6ee431f8372de1a914','MC281714',null),
('MA-2025-142-622101','Metrc-Massachusetts-MC281714-TagOrders-History (1).xlsx','bb14c3cc05b82d36f5649684d9dd2ee333f9f4f2aac5dc6ee431f8372de1a914','MC281714',null),
('MA-2025-073-598702','Metrc-Massachusetts-MC281714-TagOrders-History (1).xlsx','bb14c3cc05b82d36f5649684d9dd2ee333f9f4f2aac5dc6ee431f8372de1a914','MC281714',null),
('MA-2024-366-572601','Metrc-Massachusetts-MC281714-TagOrders-History (1).xlsx','bb14c3cc05b82d36f5649684d9dd2ee333f9f4f2aac5dc6ee431f8372de1a914','MC281714',null),
('MA-2024-270-540601','Metrc-Massachusetts-MC281714-TagOrders-History (1).xlsx','bb14c3cc05b82d36f5649684d9dd2ee333f9f4f2aac5dc6ee431f8372de1a914','MC281714',null),
('MA-2024-165-501101','Metrc-Massachusetts-MC281714-TagOrders-History (1).xlsx','bb14c3cc05b82d36f5649684d9dd2ee333f9f4f2aac5dc6ee431f8372de1a914','MC281714',null),
('MA-2024-081-468502','Metrc-Massachusetts-MC281714-TagOrders-History (1).xlsx','bb14c3cc05b82d36f5649684d9dd2ee333f9f4f2aac5dc6ee431f8372de1a914','MC281714',null),
('MA-2023-192-375103','Metrc-Massachusetts-MC281714-TagOrders-History (1).xlsx','bb14c3cc05b82d36f5649684d9dd2ee333f9f4f2aac5dc6ee431f8372de1a914','MC281714',null);
