-- BP-6: the first P&L read showed cogs (pounds sold × the VALUATION rate — what the material is worth, not what it
-- cost) at $10.4M against $3.69M of certified revenue, which would print a margin that means nothing. Until a cost
-- basis posts (pay runs, purchases, overhead), gross_margin and operating_result are NULL and the row says why;
-- cogs stays as "inventory relieved at valuation" so the figure that exists is still visible and labelled.
set search_path = public;
create or replace view public.v_pnl_live as
with m as (
  select j.book, date_trunc('month', j.event_at)::date as month, a.kind, a.role, l.side, l.amount, j.indicative
    from public.journal_line l join public.journal j on j.id = l.journal_id join public.gl_account a on a.code = l.account_code),
b as (select exists (select 1 from public.journal j join public.gl_account a on a.code in (select account_code from public.journal_line where journal_id = j.id) where a.role = 'cost' and j.rule_key in ('payroll', 'purchase_received')) as has_cost_basis)
select book, month,
       coalesce(sum(amount) filter (where kind = 'revenue' and side = 'C'), 0) - coalesce(sum(amount) filter (where kind = 'revenue' and side = 'D'), 0) as revenue,
       coalesce(sum(amount) filter (where kind = 'cogs' and side = 'D'), 0) - coalesce(sum(amount) filter (where kind = 'cogs' and side = 'C'), 0) as cogs,
       coalesce(sum(amount) filter (where kind = 'expense' and side = 'D'), 0) - coalesce(sum(amount) filter (where kind = 'expense' and side = 'C'), 0) as expenses,
       case when (select has_cost_basis from b) then
         (coalesce(sum(amount) filter (where kind = 'revenue' and side = 'C'), 0) - coalesce(sum(amount) filter (where kind = 'revenue' and side = 'D'), 0))
         - (coalesce(sum(amount) filter (where kind = 'cogs' and side = 'D'), 0) - coalesce(sum(amount) filter (where kind = 'cogs' and side = 'C'), 0)) end as gross_margin,
       case when (select has_cost_basis from b) then
         (coalesce(sum(amount) filter (where kind = 'revenue' and side = 'C'), 0) - coalesce(sum(amount) filter (where kind = 'revenue' and side = 'D'), 0))
         - (coalesce(sum(amount) filter (where kind = 'cogs' and side = 'D'), 0) - coalesce(sum(amount) filter (where kind = 'cogs' and side = 'C'), 0))
         - (coalesce(sum(amount) filter (where kind = 'expense' and side = 'D'), 0) - coalesce(sum(amount) filter (where kind = 'expense' and side = 'C'), 0)) end as operating_result,
       bool_or(indicative) filter (where kind in ('cogs', 'expense')) as cogs_indicative,
       bool_or(indicative) filter (where kind = 'revenue') as revenue_indicative,
       case when (select has_cost_basis from b)
            then 'Revenue: Apex recognized totals of MATCHED orders (certified, order grain). COGS: tag cost at the moment of sale. Expenses: labour, loss, supplies as posted.'
            else 'Revenue: Apex recognized totals of MATCHED orders (certified, order grain). cogs here is INVENTORY RELIEVED AT THE VALUATION RATE — what the material is worth, not what it cost — so gross_margin and operating_result are deliberately NULL until a cost basis posts (pay runs, purchases, overhead). expenses: loss at valuation basis. See v_spine_coverage for what is and is not posted.' end as how_to_read_it
  from m group by book, month;
grant select on public.v_pnl_live to authenticated;
notify pgrst, 'reload schema';;
