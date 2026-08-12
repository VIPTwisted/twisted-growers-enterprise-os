-- Agent G, 9 Aug 2026. THE DEFECT THIS RECORDS.
--
-- The first real sync ran at 22:21 UTC and FIVE entities returned HTTP 422:
--   shipping-orders, receiving-orders, products, buyers, batches
--   {"message":"The updated at from field is required."}
-- Those are every money, customer, product and Metrc-tag entity in the import. 186 rows
-- landed, and not one of them was an order.
--
-- ROOT CAUSE. apex-sync treats updated_at_from as an OPTIONAL delta filter and omits it when
-- no watermark exists, on the reasoning that an absent watermark means "pull everything once".
-- For seven endpoints Apex marks the parameter required:true in its own OpenAPI document, so
-- omitting it is not a full pull - it is a hard rejection. The registry could not express the
-- difference: supports_delta=true says the endpoint ACCEPTS the parameter, and said nothing
-- about it being MANDATORY.
--
-- This is the shape of every silent failure on this platform: the assumption was reasonable,
-- the log said "error" in a table nobody was watching, and the dashboards would have shown an
-- empty Sales module that looked exactly like a company with no sales.
--
-- delta_required is read straight from the spec, so tools/checks/apex-registry-vs-spec.mjs can
-- assert it and this can never be a matter of anybody remembering again.
--
-- UNDO: alter table apex_entity drop column delta_required;

alter table apex_entity
  add column if not exists delta_required boolean not null default false;

comment on column apex_entity.delta_required is
  'TRUE when Apex marks updated_at_from required:true for this endpoint in its OpenAPI '
  'document. Distinct from supports_delta, which only says the parameter is ACCEPTED. A '
  'delta_required entity called WITHOUT updated_at_from returns HTTP 422, not a full pull - '
  'which is exactly how shipping-orders, receiving-orders, products, buyers and batches all '
  'returned zero rows on the first real sync, 9 Aug 2026. Verified by the build gate against '
  'the committed spec; never hand-edit it.';

-- The seven the spec marks required:true. Verified by machine against
-- docs/apex/apex-openapi-3.1.json, not typed from reading it.
update apex_entity set delta_required = true
where (api_version, endpoint) in (
  ('v2', '/batches'),
  ('v1', '/buyer-contact-logs'),
  ('v1', '/buyer-groups'),
  ('v1', '/buyers'),
  ('v1', '/receiving-orders'),
  ('v1', '/shipping-orders'),
  ('v1', '/products')
);

select entity, supports_delta, delta_required from apex_entity where delta_required order by entity;;
