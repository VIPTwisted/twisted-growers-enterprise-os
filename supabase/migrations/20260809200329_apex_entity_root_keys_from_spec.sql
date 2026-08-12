/* The response root key is DIFFERENT for almost every entity - orders, products,
   batches, available_inventory, leads, stages, dealflows, documents, terms, data.
   A connector that assumes one shape reads zero rows off the others and reports
   success, because an empty array is not an error. Read from the OpenAPI spec
   (docs/apex/apex-openapi-3.1.json) rather than guessed, and stored as DATA so
   the connector has nothing to get wrong.

   supports_delta is corrected here too: I had guessed several of these when
   seeding the registry, and the spec disagrees with my guesses on five of them.
   An entity marked delta-capable that is not will silently return a full set
   every run and burn credits; one marked incapable that is will re-pull the
   world forever. */
alter table public.apex_entity add column if not exists root_key text;
alter table public.apex_entity add column if not exists supports_paging boolean not null default true;

update public.apex_entity set root_key = v.rk, supports_delta = v.dl, supports_paging = v.pg
from (values
  ('company',            'company',            false, false),
  ('shipping-orders',    'orders',             true,  true),
  ('receiving-orders',   'orders',             true,  true),
  ('transporter-orders', 'orders',             true,  true),
  ('products',           'products',           true,  true),
  ('batches',            'batches',            true,  true),
  ('available-inventory','available_inventory',false, true),
  ('brands',             'brands',             true,  true),
  ('buyers',             'buyers',             true,  true),
  ('buyer-leads',        'leads',              true,  true),
  ('buyer-stages',       'stages',             false, true),
  ('buyer-groups',       'buyer_groups',       true,  true),
  ('buyer-contact-logs', 'buyer_contact_logs', true,  true),
  ('deal-flows',         'dealflows',          false, true),
  ('deal-docs',          'documents',          false, true),
  ('net-terms',          'terms',              false, true),
  ('tags',               'tags',               true,  true),
  ('operations',         'data',               false, true),
  ('usage',              'data',               false, false)
) as v(entity, rk, dl, pg)
where apex_entity.entity = v.entity;

/* The taxonomy endpoints all answer with the same {data, status} envelope. */
update public.apex_entity set root_key = 'data'
where root_key is null and kind = 'reference';

comment on column public.apex_entity.root_key is
  'The JSON key the list lives under in a 200 response. Varies per entity - orders/products/leads/stages/dealflows/documents/terms/data. A connector that assumes one shape silently reads zero rows off every other entity.';;
