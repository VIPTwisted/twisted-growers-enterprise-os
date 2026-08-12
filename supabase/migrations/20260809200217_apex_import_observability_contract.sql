/* THE APEX IMPORT CONTRACT — owner, 9 Aug 2026: "watch for apex sync ensure all
   data imports and is handled 100% accurately."

   You cannot prove "all data imported" by looking at what arrived. What arrived
   is only ever evidence about itself. You need something that declares, ahead of
   time and independently, what the complete set IS - and then measures the gap.
   That is apex_entity below, built from Apex's own OpenAPI contract (106 paths,
   docs/apex/apex-openapi-3.1.json), not from whatever the connector happens to
   fetch. A connector that forgets an entity is then a MISSING ROW, loud, rather
   than an absence nobody can see.

   I own these tables as the observability contract. Agent G writes to them and
   builds everything downstream. Splitting it this way means the thing being
   watched cannot quietly define what counts as healthy. */

-- ---------------------------------------------------------------- registry --
create table if not exists public.apex_entity (
  entity            text primary key,
  endpoint          text not null,
  api_version       text not null default 'v1',
  kind              text not null check (kind in ('core','reference','money','crm','document')),
  required          boolean not null default true,
  supports_delta    boolean not null default false,   -- honours updated_at_from
  scope_needed      text,
  why               text not null,
  added_at          timestamptz not null default now()
);
comment on table public.apex_entity is
  'What a COMPLETE Apex import contains, declared from their OpenAPI spec rather than inferred from what the connector fetched. The denominator for every completeness figure.';

insert into public.apex_entity (entity, endpoint, api_version, kind, required, supports_delta, scope_needed, why) values
  ('company',            '/company',            'v1','core',     true,  false,'view:company',            'Root resource. The token resolves to a company; nearly every model carries company_id.'),
  ('shipping-orders',    '/shipping-orders',    'v1','money',    true,  true, 'view:shipping-orders',    'THE revenue record. Carries subtotal/total/taxes/payments AND manifest_number - the Metrc join.'),
  ('receiving-orders',   '/receiving-orders',   'v1','money',    true,  true, 'view:receiving-orders',   'Inbound purchases. Read as revenue once already - $1,317,836 of purchases. Direction must never be inferred.'),
  ('transporter-orders', '/transporter-orders', 'v1','core',     true,  true, null,                      'Transport legs. Not in the scope list the owner showed - confirm access via /welcome.'),
  ('products',           '/products',           'v1','core',     true,  true, 'view:products',           'The catalogue. Brand, category, type - none of which this platform models today.'),
  ('batches',            '/batches',            'v2','core',     true,  true, 'update:batches',          'v2, NOT v1. Batch is the bridge from an Apex product to a Metrc package tag.'),
  ('available-inventory','/available-inventory','v1','core',     true,  false,'view:available-inventory','On-hand versus committed. The oversold question the platform cannot answer today.'),
  ('brands',             '/brands',             'v1','reference',true,  false,'view:brands',             'This platform has NO concept of a brand. Twisted Buds exists only in Apex.'),
  ('buyers',             '/buyers',             'v1','core',     true,  true, 'view:buyers',             'Customers. Join on state licence, never on name - names drift, licences do not.'),
  ('buyer-leads',        '/buyer-leads',        'v1','crm',      true,  true, 'view:buyerleads',         'Top of funnel. No table for this exists anywhere.'),
  ('buyer-stages',       '/buyer-stages',       'v1','crm',      true,  false,'view:buyerstages',        'Pipeline stages. NAME THESE sales_deal_stage - pipeline_stages is manufacturing.'),
  ('buyer-groups',       '/buyer-groups',       'v1','crm',      false, false,null,                      'Customer segmentation. Not in the shown scope list.'),
  ('buyer-contact-logs', '/buyer-contact-logs', 'v1','crm',      false, true, null,                      'Who has been contacted - the one feature Apex names for reps. Not in the shown scope list.'),
  ('deal-flows',         '/deal-flows',         'v1','crm',      true,  true, 'view:dealflows',          'The deal pipeline. shipping_orders.deal_flow_id points here.'),
  ('deal-docs',          '/deal-docs',          'v1','document', true,  true, 'view:dealdocs',           'Apex-side COAs and manifests. Expect overlap with our 2,690 docs, expect disagreement, reconcile.'),
  ('net-terms',          '/net-terms',          'v1','money',    true,  false,'view:netterms',           'finalPaymentDaysAfterDelivery - the AR clock runs from DELIVERY, not invoice date.'),
  ('tags',               '/tags',               'v1','reference',true,  false,'view:tags',               'Labelling. Cheap to pull, and filters depend on it.'),
  ('operations',         '/operations',         'v1','reference',true,  false,null,                      'Licensed operations. Maps to our MC281714 / MP281909.'),
  ('usage',              '/usage',              'v1','core',     true,  false,null,                      'APEX BILLS BY CREDIT and nested resources are billable. Unwatched spend is how a sync becomes an invoice.')
on conflict (entity) do nothing;

/* The ~20 taxonomy endpoints. These ARE the owner's "many filters and fields":
   every one is a filter dimension on the inventory screen. Registered as
   reference so a missing one is visible, but not required, because a filter
   nobody uses should not hold up a revenue import. */
insert into public.apex_entity (entity, endpoint, api_version, kind, required, supports_delta, why)
select e, '/'||e, 'v1', 'reference', false, false,
       'Filter dimension on the Apex inventory screen. Drives the filter registry; a hard-coded filter list is a deploy for every new filter.'
from unnest(array[
  'cultivars','cultivar-types','cannabinoids','terpenes','flavors','product-categories','product-types',
  'product-additives','package-sizes','unit-measurements','container-types','storage-types','drying-methods',
  'trim-methods','extraction-methods','infusion-methods','grow-environments','grow-mediums','flowering-periods',
  'feminized-types','state-of-materials','crude-extract-types','distillate-extract-types','environmental-issues',
  'government-agencies'
]) e
on conflict (entity) do nothing;

-- ------------------------------------------------------------ raw landing --
create table if not exists public.apex_raw (
  id            bigserial primary key,
  entity        text not null references public.apex_entity(entity),
  apex_id       text,
  payload       jsonb not null,
  payload_hash  text generated always as (md5(payload::text)) stored,
  fetched_at    timestamptz not null default now(),
  run_id        uuid
);
create index if not exists apex_raw_entity_fetched on public.apex_raw (entity, fetched_at desc);
create index if not exists apex_raw_entity_apexid  on public.apex_raw (entity, apex_id);
comment on table public.apex_raw is
  'Apex payloads stored EXACTLY as returned - nothing coerced, renamed or filtered on the way in. Mapping before real payloads have been seen silently discards every field nobody anticipated, which is precisely what integration-settings did to unrecognised keys until 9 Aug 2026. Raw-first makes re-mapping free and costs no extra API credits.';

-- ------------------------------------------------------------- run ledger --
create table if not exists public.apex_sync_run (
  id                bigserial primary key,
  run_id            uuid not null,
  entity            text not null references public.apex_entity(entity),
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  status            text not null default 'running' check (status in ('running','ok','error','skipped','throttled')),
  http_status       int,
  rows_seen         int,
  rows_written      int,
  watermark_before  timestamptz,
  watermark_after   timestamptz,
  credits_used      int,
  error             text
);
create index if not exists apex_sync_run_entity_started on public.apex_sync_run (entity, started_at desc);
comment on table public.apex_sync_run is
  'One row per entity per pull. watermark_after MUST only advance when status = ok: a watermark advanced on a failed pull leaves a permanent hole that no later run will ever revisit, and nothing downstream can detect it.';

-- ------------------------------------------------------------- watermarks --
create table if not exists public.apex_watermark (
  entity            text primary key references public.apex_entity(entity),
  updated_at_from   timestamptz,
  last_success_at   timestamptz,
  last_attempt_at   timestamptz,
  consecutive_errors int not null default 0
);
comment on table public.apex_watermark is
  'The updated_at_from cursor per entity. Advance ONLY after a successful pull.';

-- -------------------------------------------------------------------- RLS --
/* Every new table, at creation. Postgres defaults it off and three tables
   shipped wide open on 7 Aug 2026. */
alter table public.apex_entity    enable row level security;
alter table public.apex_raw       enable row level security;
alter table public.apex_sync_run  enable row level security;
alter table public.apex_watermark enable row level security;

/* Signed-in staff may READ the operational record - they need to see whether the
   sync is healthy. Nobody writes from the client; the connector runs as
   service_role, which bypasses RLS. apex_raw is deliberately NOT readable: raw
   payloads carry buyer contact details and pricing, and there is no reason for a
   browser to hold them when typed tables will serve the screens. */
drop policy if exists apex_entity_read on public.apex_entity;
create policy apex_entity_read on public.apex_entity for select to authenticated using (true);
drop policy if exists apex_sync_run_read on public.apex_sync_run;
create policy apex_sync_run_read on public.apex_sync_run for select to authenticated using (true);
drop policy if exists apex_watermark_read on public.apex_watermark;
create policy apex_watermark_read on public.apex_watermark for select to authenticated using (true);

revoke all on public.apex_raw from authenticated, anon;;
