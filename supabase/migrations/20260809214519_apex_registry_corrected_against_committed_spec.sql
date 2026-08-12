-- Agent G, 9 Aug 2026. apex_entity corrected against docs/apex/apex-openapi-3.1.json,
-- the committed contract. Found by machine-diffing all 44 rows against the spec's own
-- 200-response schemas BEFORE the API key was uploaded, so none of these ever cost a
-- credit or a failed sync. Every before-value is recorded in the migration body.
--
-- UNDO: the five UPDATEs restore by setting the column back to the "was" value quoted
-- on each line; the two INSERTs undo with DELETE FROM apex_entity WHERE entity IN
-- ('welcome','marketplace'). Nothing here is destructive and no row is removed.

-- 1. ROOT KEY WRONG — the worker aborts the entity with "registry is wrong, not the data".
--    Spec: /v1/cannabinoids returns { "cannabinoid": [...] } (singular; Apex's own oddity).
update apex_entity set root_key = 'cannabinoid',           -- was 'data'
  why = why || ' | 9 Aug 2026: root_key corrected data -> cannabinoid against the committed OpenAPI spec.'
where entity = 'cannabinoids';

--    Spec: /v1/infusion-methods returns { "infusion_methods": [...] }.
update apex_entity set root_key = 'infusion_methods',      -- was 'data'
  why = why || ' | 9 Aug 2026: root_key corrected data -> infusion_methods against the committed OpenAPI spec.'
where entity = 'infusion-methods';

-- 2. READ DECLARED AS A WRITE SCOPE. Reading /v2/batches needs view:batches; update:batches
--    is the write grant. Declaring the write scope would misreport a 403 as "we lack write".
update apex_entity set scope_needed = 'view:batches',      -- was 'update:batches'
  why = why || ' | 9 Aug 2026: scope_needed corrected update:batches -> view:batches. A read must never declare a write scope.'
where entity = 'batches';

-- 3. REQUIRED, BUT NO SCOPE IS HELD. The owner's key carries 18 observed scopes and none
--    of them covers transporter orders, so every normal run would log a 403 on a REQUIRED
--    entity - a permanent red that trains people to stop reading the log (THE STANDARD #3,
--    "a wrong label costs more than no label"). Demoted to optional and still declared, so
--    it stays in the completeness denominator and can be proven with ?entity=transporter-orders.
--    The scope NAME is INFERRED from Apex's own pattern (view:shipping-orders,
--    view:receiving-orders) and is NOT observed - /welcome settles it when the key lands.
update apex_entity set required = false,                   -- was true
  scope_needed = 'view:transporter-orders',                -- was null
  why = why || ' | 9 Aug 2026: demoted to optional - the scope is absent from the owner''s 18 observed scopes, so a required run would 403 every time. Scope name INFERRED from Apex naming, unconfirmed until /welcome reports it.'
where entity = 'transporter-orders';

-- 4. THE EXPENSIVE ROW. /v1/available-inventory is 3 credits per item and the spec gives it
--    NO updated_at_from, so every pull is a full pull. At 142 records that is ~427 credits an
--    hour, ~307,000 a month against a 100,000 allowance. Quantity and price are already
--    reached more cheaply through /v2/batches (1 credit, delta-capable, 240 min), so this is
--    the buyer-facing listing and daily is enough.
update apex_entity set min_interval_minutes = 1440,        -- was 60
  why = why || ' | 9 Aug 2026: 60 -> 1440 min. 3 credits/item with NO delta support in the spec: hourly was ~307k credits/month against a 100k allowance. Live quantity comes from batches, which is delta-capable and 1 credit.'
where entity = 'available-inventory';

-- 5. TWO SPEC ENDPOINTS HAD NO ROW. This table is "the denominator for every completeness
--    figure", so an endpoint missing from it makes completeness unfalsifiable. Both are
--    required = false: the worker loops only over required rows, and welcome is already
--    called directly before the loop.
insert into apex_entity (entity, endpoint, api_version, kind, required, supports_delta, supports_paging, scope_needed, root_key, min_interval_minutes, nesting, why)
values
  ('welcome', '/welcome', 'v1', 'core', false, false, false, null, null, 1440, '{}'::jsonb,
   'Declared for completeness only. apex-sync calls /v1/welcome directly before the entity loop to prove the key and enumerate its scopes without touching a record; it is never pulled through the registry. required=false so the loop does not call it twice.'),
  ('marketplace', '/marketplace', 'v1', 'reference', false, false, true, null, 'data', 10080, '{}'::jsonb,
   'Other companies'' public listings, not ours - competitive visibility rather than our own record. Declared so the completeness denominator matches the spec, required=false so it is never pulled by a normal run. Same filter set as available-inventory plus company_ids[].')
on conflict (entity) do nothing;;
