-- Agent I, 13 Aug 2026. DBI-103.
--
-- OWNER RULING, verbatim: "I believe it is rent not license fix zen at 6500 a month be sure i can
-- edit this and add other fees and charge Zen separated".
--
-- THIRD CLASSIFICATION IN ONE NIGHT, and each was his to make, not ours: tolling -> licensing fee
-- -> RENT. Recorded that way deliberately. The arrangement did not change; our understanding did,
-- and the audit trail should show which figure was published under which reading.
--
-- WHAT RENT SETTLES THAT LICENSING DID NOT. The direction is no longer open: rent means THEY PAY
-- US. We are the landlord. That closes the question the previous migration deliberately left
-- blank, and it lands on the better side of 280E:
--   * rent RECEIVED is ordinary income. It is not a product sale and not COGS, and it must never
--     be folded into inventory value or cost of sales.
--   * the 13,635 units were NEVER our inventory. We rent them space; the gummies are theirs
--     start to finish. Carrying them as our finished goods overstates both stock and cost of
--     sales, which is the correction still awaiting the owner.
--   * 280E disallows ordinary deductions for a trafficking business, but rent RECEIVED is income
--     rather than a deduction, so the usual trap does not apply here. Any expense we incur to
--     provide that space is a different question and is NOT settled by this ruling.
--
-- EDITABLE BY DESIGN, because he asked to add fees himself: the amount, the period and the dates
-- are rows, not code. A second fee, a rate change, a one-off charge - all are inserts. Nothing
-- here needs an agent.
--
-- NO PUBLISHED FIGURE MOVES. No revenue is recognised, no invoice is raised, nothing posts to a
-- ledger. This records the ARRANGEMENT. Whether and how it appears in the P&L is the owner's and
-- the CPA's, and it is on the list beside the seed cost.
--
-- UNDO: drop view v_client_fees_due; drop table client_fee.

create table if not exists client_fee (
  id             bigserial primary key,
  client_key     text not null references manufacturing_client(client_key) on delete cascade,
  fee_type       text not null default 'rent',
  amount_usd     numeric(12,2) not null check (amount_usd >= 0),
  period         text not null default 'monthly'
                 check (period in ('monthly','weekly','quarterly','annual','one_off','per_unit')),
  direction      text not null default 'they_pay_us'
                 check (direction in ('they_pay_us','we_pay_them')),
  effective_from date not null default current_date,
  effective_to   date,
  note           text,
  set_by         text not null default 'Owner (Vinny)',
  set_at         timestamptz not null default now(),
  constraint ends_after_it_starts check (effective_to is null or effective_to >= effective_from)
);
create index if not exists client_fee_current on client_fee (client_key, effective_from desc);

alter table client_fee enable row level security;
drop policy if exists cf_read  on client_fee;
drop policy if exists cf_write on client_fee;
create policy cf_read  on client_fee for select to authenticated using (true);
create policy cf_write on client_fee for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

comment on table client_fee is
 'What a client pays us, or we pay them, and on what cadence. Rows, not code, so the owner adds a '
 'fee or changes a rate without an agent — he asked for exactly that. A rate change is a NEW ROW '
 'with a new effective_from and an effective_to on the old one; never edit an amount in place, '
 'because a figure published last month must still be reproducible from the rate that applied '
 'then. NOTHING HERE POSTS TO A LEDGER: it records the arrangement, not the money.';

comment on column client_fee.direction is
 'Who pays whom. For Zen this is settled — rent means they pay us. It stays an explicit column '
 'because the 280E treatment turns on it and the previous classification (licensing fee) left it '
 'genuinely open for a day.';

insert into client_fee (client_key, fee_type, amount_usd, period, direction, effective_from, note)
values ('zen', 'rent', 6500.00, 'monthly', 'they_pay_us', date '2026-08-01',
        'Owner, 13 Aug 2026: "I believe it is rent not license fix zen at 6500 a month". '
        'Supersedes the licensing-fee reading recorded earlier the same day, which itself '
        'superseded tolling. effective_from is the start of the current month as a starting '
        'assumption — CORRECT IT if the arrangement began earlier, because the date decides how '
        'much has accrued.');

update manufacturing_client
   set relationship = 'rent',
       fee_direction = 'they_pay_us',
       money_treatment =
         'RENT — they pay us, $6,500 a month, from client_fee. Owner ruling 13 Aug 2026: "I '
         'believe it is rent not license". We are the landlord. Rent RECEIVED is ordinary income: '
         'not a product sale, not COGS, and never folded into inventory value or cost of sales. '
         'The 13,635 units were never our inventory — we rent them space and the product is theirs '
         'throughout, so carrying them as our finished goods overstates stock and cost of sales, '
         'and that correction is still open. 280E disallows ordinary DEDUCTIONS; rent received is '
         'income, so that trap does not apply here — but the cost of providing the space is a '
         'separate question this ruling does not settle.',
       why = why || ' | SUPERSEDED AGAIN 13 Aug 2026: RENT, not licensing. Third classification '
             'in one night, each the owner''s. Recorded in sequence so it is clear which reading '
             'any published figure was made under.'
 where client_key = 'zen';

create or replace view public.v_client_fees_due as
select f.client_key,
       mc.client_name,
       f.fee_type,
       f.amount_usd,
       f.period,
       f.direction,
       f.effective_from,
       f.effective_to,
       (f.effective_to is null or f.effective_to >= current_date) as in_force,
       case f.period
         when 'monthly'   then f.amount_usd * 12
         when 'weekly'    then f.amount_usd * 52
         when 'quarterly' then f.amount_usd * 4
         when 'annual'    then f.amount_usd
       end                                                        as annualised_usd,
       case when f.period in ('one_off','per_unit')
            then 'Not annualised — a ' || f.period || ' charge has no yearly run rate.' end
                                                                  as why_no_annual,
       greatest(0, (date_part('year',  age(current_date, f.effective_from)) * 12
                  + date_part('month', age(current_date, f.effective_from)))::int)
                                                                  as months_elapsed,
       f.note
from client_fee f
join manufacturing_client mc on mc.client_key = f.client_key
order by mc.client_name, f.effective_from desc;

comment on view public.v_client_fees_due is
 'Every fee arranged with a client we make product for, with its annual run rate and how many '
 'months have elapsed since it took effect. IT RAISES NO INVOICE AND RECOGNISES NO REVENUE — '
 'months_elapsed is elapsed time, NOT an amount owed, because nothing here knows what has been '
 'paid. Treating it as a receivable would be inventing a figure.';;
