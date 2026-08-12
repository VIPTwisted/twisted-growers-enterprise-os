-- QUICKBOOKS DEFAULTS. Owner, 8 Aug 2026: "Let's say QuickBooks."
--
-- QuickBooks does not use one default. It splits on a distinction that matters more
-- than the dates themselves:
--
--   ACTIVITY reports - Profit & Loss, Sales, Transaction Detail. Things that HAPPEN
--     over a period.                                    -> This Month-to-date
--   SNAPSHOT reports - Balance Sheet, Inventory Valuation, A/R Aging. Things that
--     ARE, at a moment.                                 -> Today (as of)
--
-- "-to-date" on the activity side, never the whole month: a P&L that includes days
-- which have not happened is not a P&L.
--
-- The distinction is not cosmetic. Applying a date RANGE to a stock level is the same
-- category error as asking what the bank balance was between March and June. On this
-- platform that error is already live: the Command tile sums three years of packages
-- and presents it as a current position.
--
-- default_range is stored per page so a dashboard cannot invent its own, and it is
-- only the STARTING point - every user overrides it via f_date_default.
-- UNDO: alter table nav_registry drop column default_range, drop column range_kind.

alter table nav_registry
  add column if not exists default_range text references date_range_presets(preset_key),
  add column if not exists range_kind text not null default 'activity';

comment on column nav_registry.range_kind is
  'activity - the page reports things that HAPPENED over a period (production, sales, '
  'movements, tests). Defaults to This Month-to-date. '
  'snapshot - the page reports what IS, at a moment (stock on hand, ageing, open '
  'issues, registries). Defaults to Today. Applying a range to a snapshot silently '
  'changes what the number means.';
comment on column nav_registry.default_range is
  'Where this page OPENS before the user expresses a preference. f_date_default '
  'overrides it per user, per page. Never "all data".';

-- SNAPSHOT: what IS, right now. QuickBooks Balance Sheet / Inventory Valuation shape.
update nav_registry set range_kind = 'snapshot', default_range = 'today'
where table_ref ~ '(inventory|stock|on_hand|room_content|countable|tower|ageing|aging|position|registry|directory|catalogue|catalog|profile|config|permission|role|licence|license|vendor|supplier|sku|machine|widget|nav_|report_)'
   or view_key  ~ '(inventory|stock|tower|ageing|aging)';

-- ACTIVITY: what HAPPENED. QuickBooks P&L / Sales shape.
update nav_registry set range_kind = 'activity', default_range = 'this_month_td'
where range_kind <> 'snapshot'
  and (table_ref ~ '(harvest|package|transfer|manifest|sale|wholesale|adjust|waste|destroy|lab_|test|production|yield|payroll|schedule|task|finding|run|movement|plant)'
       or view_key ~ '(harvest|sale|production|yield|manifest|transfer)');

-- CULTIVATION AND MANUFACTURING: a full room cycle, not a calendar month.
-- The cycle is 56 days and harvest-to-availability is 28. A shorter window shows
-- half-finished work and reads as underperformance - the maturity-censoring trap
-- that once manufactured a fake 40% decline here.
update nav_registry set default_range = 'since_90'
where range_kind = 'activity'
  and category in ('Cultivation','Manufacturing','Infused Pre-Rolls & Flower');

-- QUALITY AND COMPLIANCE: match the 180-day ageing threshold so "what is about to go
-- stale" is the default view rather than something you go looking for.
update nav_registry set default_range = 'since_180'
where category = 'Quality' and range_kind = 'activity';

-- Anything still unset gets the QuickBooks default rather than "all data".
update nav_registry set default_range = case when range_kind = 'snapshot' then 'today'
                                             else 'this_month_td' end
where default_range is null and page_kind = 'report';

-- Pages where a date is meaningless carry no default at all.
update nav_registry set default_range = null, range_kind = 'snapshot'
where date_policy = 'not_applicable';;
