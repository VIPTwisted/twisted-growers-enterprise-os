/* Owner, 9 Aug 2026: "DO NOT ABUSE CALLS. ALWAYS SETUP FOR FEWEST CALLS SO WE CAN
   HANDLE THE CHEAPEST WAY POSSIBLE."

   Apex bills by credit and nested resources are billable, so the cost of this
   integration is decided by four things. All four are DATA here rather than code,
   because a cost control buried in a deployed function needs a deploy to tune and
   will therefore never be tuned.

   1. min_interval_minutes - do not re-pull an entity that was pulled recently.
      This is the largest saving by far: 25 of the 44 entities are taxonomy
      (cultivars, terpenes, container types) that change a few times a year. At a
      weekly interval they cost 25 calls a WEEK instead of 25 calls a RUN.
   2. nesting - opt-in per entity. with_items on shipping orders is the revenue
      picture and is not optional. with_pricing_tier is off: pricing_tier_id
      arrives free on the order and the tier detail can wait until something needs
      it. Every nested resource is a billable line.
   3. supports_delta - already set from the spec. A delta pull after the first is
      nearly free.
   4. required - reference data is excluded from a normal run entirely.

   Default 1440 (once a day) is deliberately conservative for money entities and
   is overridden below for the ones that actually move. */
alter table public.apex_entity add column if not exists min_interval_minutes int not null default 1440;
alter table public.apex_entity add column if not exists nesting jsonb not null default '{}'::jsonb;

/* Money and stock move during the day; everything else does not. */
update public.apex_entity set min_interval_minutes = 60
  where entity in ('shipping-orders','receiving-orders','available-inventory');
update public.apex_entity set min_interval_minutes = 240
  where entity in ('buyers','products','batches','deal-flows','buyer-leads','deal-docs','transporter-orders');
update public.apex_entity set min_interval_minutes = 1440
  where entity in ('brands','net-terms','buyer-stages','buyer-groups','buyer-contact-logs','tags','operations','company');
/* Taxonomy: weekly. These are the filter dimensions and they are nearly static.
   Pulling 25 of them on every sync is the definition of abusing the call budget. */
update public.apex_entity set min_interval_minutes = 10080 where kind = 'reference';

/* Nesting, opt-in, per entity. with_items is the whole reason to pull an order at
   all - without it there is no revenue, no package tag and therefore no Metrc
   reconciliation. with_payments is AR. with_pricing_tier stays OFF until a screen
   needs it, because pricing_tier_id already arrives on the order for free. */
update public.apex_entity set nesting = '{"with_items":"true","with_payments":"true"}'::jsonb
  where entity = 'shipping-orders';
update public.apex_entity set nesting = '{"with_items":"true"}'::jsonb
  where entity = 'receiving-orders';

comment on column public.apex_entity.min_interval_minutes is
  'Do not re-pull inside this window. The main cost control: taxonomy at 10080 (weekly) costs 25 calls a week instead of 25 every run. Tunable without a deploy, on purpose.';
comment on column public.apex_entity.nesting is
  'Opt-in query params for nested resources. EACH NESTED RESOURCE IS BILLABLE. Add one only when something downstream genuinely needs it.';;
