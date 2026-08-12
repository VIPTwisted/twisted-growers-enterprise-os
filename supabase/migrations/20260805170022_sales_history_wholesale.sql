-- What actually sold: for a wholesale operation the sale is the outbound manifest.
create or replace view v_sales_history as
select
  t.created_on as sold_on,
  to_char(t.created_on, 'YYYY-MM') as month,
  t.manifest_number,
  t.recipient as customer,
  t.raw->>'RecipientFacilityLicenseNumber' as customer_license,
  coalesce((t.raw->>'PackageCount')::numeric,0) as packages_sent,
  coalesce((t.raw->>'ReceivedPackageCount')::numeric,0) as packages_received,
  t.raw->>'ShipmentTypeName' as shipment_type,
  (t.raw->>'ReceivedDateTime')::date as received_on,
  case when (t.raw->>'ReceivedDateTime') is not null then 'Delivered'
       when t.created_on < current_date - 3 then 'NOT CONFIRMED RECEIVED'
       else 'In transit' end as delivery_status,
  case when t.raw->>'Id' is not null
    then 'https://ma.metrc.com/reports/transfers/'||(t.raw->>'Id')||'/manifest' end as manifest_link,
  t.license
from metrc_transfers t
where t.direction = 'outgoing'
order by t.created_on desc nulls last;

-- Monthly sales history with customers and volume.
create or replace view v_sales_history_monthly as
select license, to_char(created_on,'YYYY-MM') as month,
  (date_trunc('month', created_on))::date as month_date,
  count(*)::numeric as manifests_sent,
  count(distinct recipient)::numeric as customers,
  sum(coalesce((raw->>'PackageCount')::numeric,0)) as packages_sold,
  sum(coalesce((raw->>'ReceivedPackageCount')::numeric,0)) as packages_confirmed,
  count(*) filter (where raw->>'ReceivedDateTime' is null)::numeric as manifests_unconfirmed,
  string_agg(distinct recipient, ', ') as customer_list
from metrc_transfers where direction = 'outgoing' and created_on is not null
group by license, to_char(created_on,'YYYY-MM'), date_trunc('month', created_on)
order by month_date desc;

-- Customer history: who buys, how much, how often, and when they last bought.
create or replace view v_customer_history as
select coalesce(recipient,'(not recorded)') as customer,
  raw->>'RecipientFacilityLicenseNumber' as customer_license,
  count(*)::numeric as manifests,
  sum(coalesce((raw->>'PackageCount')::numeric,0)) as packages_bought,
  min(created_on) as first_order, max(created_on) as last_order,
  (current_date - max(created_on))::numeric as days_since_last_order,
  count(*) filter (where raw->>'ReceivedDateTime' is null)::numeric as unconfirmed_manifests,
  license
from metrc_transfers where direction = 'outgoing'
group by coalesce(recipient,'(not recorded)'), raw->>'RecipientFacilityLicenseNumber', license
order by packages_bought desc;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Sales & Cash', (select category_order from nav_registry where category='Sales & Cash' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, false
from (values
  ('Sales History (every manifest)', 1, 'truck', 'sales_history', 'v_sales_history', 'Every outbound manifest as a sale: date, manifest number, customer and their license, packages sent and confirmed received, delivery status, and a link to the manifest in Metrc.'),
  ('Sales History by Month', 2, 'dollar', 'sales_monthly', 'v_sales_history_monthly', 'Month by month: manifests sent, how many customers, packages sold and confirmed, manifests still unconfirmed, and the customer list.'),
  ('Customer History', 3, 'users', 'customer_history', 'v_customer_history', 'Every customer: manifests, packages bought, first and last order, days since their last order, and unconfirmed manifests.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
select month, manifests_sent, customers, packages_sold, packages_confirmed, manifests_unconfirmed from v_sales_history_monthly limit 6;;
