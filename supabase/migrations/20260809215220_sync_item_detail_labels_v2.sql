/* Owner, 9 Aug 2026: "FIX ALL WITH TITLE OF WHAT IS BEING SYNCED FROM WHERE APEX,
   METRC SPREADSHEET AND NAME OF SPREADSHEET MAKE THIS DETAILED ITS TOO VAGUE."

   Correct. "shipping-orders" tells you nothing - not which system it comes from, not
   what it contains, not where it lands. On a screen mixing three systems, a Google
   Sheet tab and a state-regulator endpoint looked identical.

   Four fields so every row says WHAT, FROM WHERE, and TO WHERE.

   NOTE ON THE VIEW: the new columns are APPENDED, never inserted. create or replace
   view cannot rename or reorder columns, and my first attempt tried to slot them in
   the middle and was correctly rejected. Append-only is the rule here. */
alter table public.sync_item add column if not exists system_label text;
alter table public.sync_item add column if not exists source_name  text;
alter table public.sync_item add column if not exists pulls        text;
alter table public.sync_item add column if not exists target       text;
alter table public.apex_entity add column if not exists label text;

update public.sync_item set
  system_label = 'Metrc',
  source_name  = 'Metrc API — Massachusetts state seed-to-sale record',
  target       = 'metrc_' || item_key
where source_key = 'metrc';

update public.sync_item set pulls = v.p from (values
  ('packages',     'Every package with its 24-character tag, quantity, unit of measure, room and lab-testing state.'),
  ('plants',       'Live plants by room and growth phase.'),
  ('plantbatches', 'Immature plant batches — clones and seeds, before they become plants.'),
  ('harvests',     'Harvest records with wet and dry weights. Yield here is grams per plant.'),
  ('transfers',    'Transfer manifests — what left, where it went, what the recipient confirmed. Apex orders reconcile against this.'),
  ('items',        'The Metrc product catalogue — item names and categories.'),
  ('strains',      'Registered strains. Reference data, rarely changes.'),
  ('locations',    'Rooms and locations. Reference data, rarely changes.'),
  ('sales',        'Retail sales receipts. NOT wholesale revenue — that lives in Apex.')
) as v(k, p) where sync_item.item_key = v.k and sync_item.source_key = 'metrc';

update public.sync_item set
  system_label = 'Google Sheet',
  source_name  = 'Finished Goods workbook (Google Sheets) — the live sheet the crew works in',
  target       = case when item_key = '3rd Party Material' then 'third_party_material' else 'product_inventory' end,
  pulls        = case when item_key = '3rd Party Material'
                   then 'Third-party material held for other companies — company, Metrc tag, strain, weight, location.'
                   else 'Finished-goods rows from the "' || trim(item_key) || '" tab: batch, strain or flavour, size, bulk and packaged totals, cases available, potency and dates.'
                 end
where source_key = 'sheet_fg';

update public.sync_item set
  system_label = 'ClickUp',
  source_name  = 'ClickUp workspace (TG)',
  pulls        = 'Every space, list and task — open and closed, including subtasks and custom fields.',
  target       = 'clickup_*'
where source_key = 'clickup';

update public.apex_entity set label = v.l from (values
  ('company','Company profile'), ('shipping-orders','Sales orders (outbound)'),
  ('receiving-orders','Purchase orders (inbound)'), ('transporter-orders','Transporter orders'),
  ('products','Product catalogue'), ('batches','Batches'), ('available-inventory','Available inventory'),
  ('brands','Brands'), ('buyers','Buyers (customers)'), ('buyer-leads','Leads'),
  ('buyer-stages','Deal stages'), ('buyer-groups','Buyer groups'),
  ('buyer-contact-logs','Contact log — who has been contacted'), ('deal-flows','Deal flows (pipeline)'),
  ('deal-docs','Deal documents — COAs and manifests'), ('net-terms','Net terms'), ('tags','Tags'),
  ('operations','Licensed operations'), ('usage','API credit usage'),
  ('cultivars','Cultivars'), ('cultivar-types','Cultivar types'), ('cannabinoids','Cannabinoids'),
  ('terpenes','Terpenes'), ('flavors','Flavours'), ('product-categories','Product categories'),
  ('product-types','Product types'), ('product-additives','Product additives'),
  ('package-sizes','Package sizes'), ('unit-measurements','Units of measure'),
  ('container-types','Container types'), ('storage-types','Storage types'),
  ('drying-methods','Drying methods'), ('trim-methods','Trim methods'),
  ('extraction-methods','Extraction methods'), ('infusion-methods','Infusion methods'),
  ('grow-environments','Grow environments'), ('grow-mediums','Grow mediums'),
  ('flowering-periods','Flowering periods'), ('feminized-types','Feminized types'),
  ('state-of-materials','State of material'), ('crude-extract-types','Crude extract types'),
  ('distillate-extract-types','Distillate extract types'),
  ('environmental-issues','Environmental issues'), ('government-agencies','Government agencies')
) as v(e, l) where apex_entity.entity = v.e;

update public.apex_entity set label = initcap(replace(entity, '-', ' ')) where label is null;

create or replace view public.v_sync_item as
select source_key, source_label, fn, item_key, item_label, query_param, extra_params,
       note, enabled, supported, sort,
       null::bigint as rows_stored, null::timestamptz as last_success_at,
       null::text as last_status, null::boolean as due, null::text as due_text,
       system_label, source_name, pulls, target
from public.sync_item
union all
select 'apex', 'Apex Trading (sales)', 'apex-sync', s.entity,
       coalesce(e.label, s.entity), 'entity', '{"force":"1"}'::jsonb,
       null, true, true,
       70 + (case s.kind when 'money' then 0 when 'core' then 1 when 'crm' then 2 when 'document' then 3 else 4 end),
       s.rows_stored, s.last_success_at, s.last_status, s.due, s.due_text,
       'Apex Trading',
       'Apex Trading API — app.apextrading.com, the sales source of record',
       coalesce(e.why, 'Apex ' || s.entity),
       'apex_raw (entity = ' || s.entity || ')'
from public.v_apex_entity_status s
join public.apex_entity e on e.entity = s.entity;

grant select on public.v_sync_item to authenticated;;
