-- THE DATE DROPDOWN, QUICKBOOKS SHAPE. Owner, 8 Aug 2026:
--   "For date, as we have date range with drop down, build like QuickBooks."
--
-- Held as DATA, not code, for the same reason report_registry is: 518 report pages
-- must share ONE definition. A preset list implemented per page is 518 places for
-- "this month" to mean something slightly different, and this platform has spent a
-- night proving what happens when one rule lives in many places.
--
-- QuickBooks behaviour, which must be matched exactly:
--   * the dropdown FILLS the From and To boxes; both stay editable
--   * editing either box switches the dropdown to "Custom" - it does not fight you
--   * "-to-date" variants end TODAY, not at the period end. This is the distinction
--     people get wrong: "This Month" is the whole month including days not yet
--     happened; "This Month-to-date" stops today. On a production report those are
--     very different numbers.
--   * the choice persists while other filters change
--   * "All Dates" clears the range rather than picking a wide one
--
-- Fiscal presets read the fiscal year start from configurations, defaulting to
-- January. Do not hard-code a fiscal calendar.
-- UNDO: drop table date_range_presets.

create table if not exists public.date_range_presets (
  preset_key   text primary key,
  label        text not null,
  group_label  text not null,
  sort_order   int  not null,
  from_expr    text,          -- SQL expression for the start; null = unbounded
  to_expr      text,          -- SQL expression for the end;   null = unbounded
  is_to_date   boolean not null default false,
  is_default   boolean not null default false,
  note         text
);
alter table public.date_range_presets enable row level security;
drop policy if exists date_range_presets_read on public.date_range_presets;
create policy date_range_presets_read on public.date_range_presets for select to authenticated using (true);

insert into date_range_presets (preset_key,label,group_label,sort_order,from_expr,to_expr,is_to_date,is_default,note) values
('all','All Dates','General',10,null,null,false,true,'Clears the range entirely rather than picking a wide one.'),
('custom','Custom','General',20,null,null,false,false,'Set automatically when the user edits either box.'),
('today','Today','Day',30,'current_date','current_date',false,false,null),
('yesterday','Yesterday','Day',40,'current_date - 1','current_date - 1',false,false,null),
('this_week','This Week','Week',50,'date_trunc(''week'', current_date)','date_trunc(''week'', current_date) + interval ''6 days''',false,false,'Whole week including days not yet happened.'),
('this_week_td','This Week-to-date','Week',60,'date_trunc(''week'', current_date)','current_date',true,false,'Stops today.'),
('last_week','Last Week','Week',70,'date_trunc(''week'', current_date) - interval ''7 days''','date_trunc(''week'', current_date) - interval ''1 day''',false,false,null),
('this_month','This Month','Month',80,'date_trunc(''month'', current_date)','(date_trunc(''month'', current_date) + interval ''1 month - 1 day'')',false,false,'Whole month.'),
('this_month_td','This Month-to-date','Month',90,'date_trunc(''month'', current_date)','current_date',true,false,'Stops today. On a production report this is a very different number from This Month.'),
('last_month','Last Month','Month',100,'date_trunc(''month'', current_date) - interval ''1 month''','date_trunc(''month'', current_date) - interval ''1 day''',false,false,null),
('this_quarter','This Quarter','Quarter',110,'date_trunc(''quarter'', current_date)','(date_trunc(''quarter'', current_date) + interval ''3 months - 1 day'')',false,false,null),
('this_quarter_td','This Quarter-to-date','Quarter',120,'date_trunc(''quarter'', current_date)','current_date',true,false,null),
('last_quarter','Last Quarter','Quarter',130,'date_trunc(''quarter'', current_date) - interval ''3 months''','date_trunc(''quarter'', current_date) - interval ''1 day''',false,false,null),
('this_year','This Year','Year',140,'date_trunc(''year'', current_date)','(date_trunc(''year'', current_date) + interval ''1 year - 1 day'')',false,false,null),
('this_year_td','This Year-to-date','Year',150,'date_trunc(''year'', current_date)','current_date',true,false,null),
('last_year','Last Year','Year',160,'date_trunc(''year'', current_date) - interval ''1 year''','date_trunc(''year'', current_date) - interval ''1 day''',false,false,null),
('last_year_td','Last Year-to-date','Year',170,'date_trunc(''year'', current_date) - interval ''1 year''','current_date - interval ''1 year''',true,false,'Same point last year - the comparison that makes a year-on-year number honest.'),
('since_30','Last 30 Days','Rolling',180,'current_date - 29','current_date',true,false,null),
('since_60','Last 60 Days','Rolling',190,'current_date - 59','current_date',true,false,null),
('since_90','Last 90 Days','Rolling',200,'current_date - 89','current_date',true,false,null),
('since_180','Last 180 Days','Rolling',210,'current_date - 179','current_date',true,false,'Matches the 180-day ageing threshold.'),
('since_365','Last 365 Days','Rolling',220,'current_date - 364','current_date',true,false,null),
('fiscal_this','This Fiscal Year','Fiscal',230,'f_fiscal_year_start(current_date)','(f_fiscal_year_start(current_date) + interval ''1 year - 1 day'')',false,false,'Fiscal start read from configurations, default January.'),
('fiscal_this_td','This Fiscal Year-to-date','Fiscal',240,'f_fiscal_year_start(current_date)','current_date',true,false,null),
('fiscal_last','Last Fiscal Year','Fiscal',250,'(f_fiscal_year_start(current_date) - interval ''1 year'')','(f_fiscal_year_start(current_date) - interval ''1 day'')',false,false,null)
on conflict (preset_key) do update set label=excluded.label, from_expr=excluded.from_expr,
  to_expr=excluded.to_expr, note=excluded.note, group_label=excluded.group_label, sort_order=excluded.sort_order;

create or replace function public.f_fiscal_year_start(p_on date default current_date)
returns date language sql stable as $$
  select make_date(
    case when extract(month from p_on)::int >= coalesce((select value::int from configurations
                                                          where key='fiscal_year_start_month'), 1)
         then extract(year from p_on)::int else extract(year from p_on)::int - 1 end,
    coalesce((select value::int from configurations where key='fiscal_year_start_month'), 1),
    1);
$$;

comment on function public.f_fiscal_year_start(date) is
  'Start of the fiscal year containing the given date. Reads fiscal_year_start_month '
  'from configurations, defaulting to January. Never hard-code a fiscal calendar - it '
  'is an owner-set fact.';

comment on table public.date_range_presets is
  'The QuickBooks date dropdown, held as data so all 518 report pages share ONE '
  'definition. The dropdown FILLS the From/To boxes and both stay editable; editing '
  'either switches to Custom. "-to-date" presets end TODAY, not at period end - on a '
  'production report This Month and This Month-to-date are very different numbers.';;
