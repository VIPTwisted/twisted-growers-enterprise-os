-- BP-6 The money spine, v1 — an event-sourced journal at tag grain (owner, 14 Sep 2026: "beats NetSuite";
-- TG is the book of record, QuickBooks becomes the mirror in phase 2). What this migration does:
--   · gl_account — the chart (14 accounts the Bible's posting map names); posting_rule — the map as ROWS
--     (event → debit / credit / grain / basis), so a rule is edited on the Setup form, never in code;
--   · journal + journal_line — one journal per source event (unique on source_table · source_id · event_kind,
--     so posting is idempotent), lines at tag grain with the book (licence), dims and the basis named;
--   · f_post_journals() — the engine: posts what the platform can already price, and records a journal
--     WITHOUT an amount where it cannot (weight not captured at packaging; order not matched to Apex),
--     so coverage is a figure on a page, never a silent gap. Runs every minute (cron journal-post).
--   · v_gl_trial_balance, v_pnl_live, v_inventory_value_journal, v_cost_per_pound_journal, v_spine_coverage.
-- Every money figure here is INDICATIVE unless the row says otherwise (Apex-matched revenue is the certified
-- order-grain figure; everything valued through f_rate_for carries the valuation-rate basis and its
-- confirmed flag). Nothing is invented: a stream with a $0 rate posts $0 and says so.
set search_path = public;

-- ── one definition of "which stream is this category" (v_stock_on_hand inlines the same map — debt: point it here) ──
create or replace function public.f_stream_for_category(p_category text) returns text
language sql immutable parallel safe as $$
  select case
    when p_category ilike '%fresh frozen%' then 'Fresh frozen'
    when p_category ilike '%bud%' then 'Dried flower'
    when p_category ilike '%shake%' or p_category ilike '%trim%' then 'Shake and trim'
    when p_category ilike '%concentrate%' then 'Concentrate'
    when p_category ilike '%roll%' then 'Pre-rolls'
    when p_category ilike '%vape%' then 'Vape'
    else coalesce(p_category, '(uncategorised)') end
$$;

create table if not exists public.gl_account (
  code text primary key, name text not null, kind text not null check (kind in ('asset','liability','equity','revenue','cogs','expense','memo')),
  normal_side char(1) not null check (normal_side in ('D','C')), parent_code text references public.gl_account(code), qbo_purpose text, note text,
  role text check (role in ('inventory','cogs','cost','revenue','receivable','payable','cash','memo','wip')),
  created_at timestamptz not null default now()
);
comment on table public.gl_account is 'BP-6 the chart of accounts the posting map uses. Edit on the Setup form; a code is never deleted once a line refers to it.';
insert into public.gl_account (code, name, kind, normal_side, role, note) values
 ('1000', 'Cash', 'asset', 'D', 'cash', 'Bible §6: payment received → Cash / AR'),
 ('1100', 'Accounts receivable', 'asset', 'D', 'receivable', 'Apex invoice at order grain'),
 ('1300', 'Inventory — wet / bulk', 'asset', 'D', 'inventory', 'harvest closed (wet weight at close) and bulk material'),
 ('1310', 'Inventory — finished goods (tag)', 'asset', 'D', 'inventory', 'packaged material at tag grain'),
 ('1400', 'WIP — cultivation', 'asset', 'D', 'wip', 'plant batches and clones accumulate here until the harvest closes'),
 ('1500', 'Supplies', 'asset', 'D', 'cost', 'purchases received'),
 ('2000', 'Accounts payable', 'liability', 'C', 'payable', 'purchases billed'),
 ('2100', 'Wages payable', 'liability', 'C', 'payable', 'payroll'),
 ('4000', 'Revenue', 'revenue', 'C', 'revenue', 'Apex recognized total at order grain — the certified sales measure'),
 ('5000', 'Cost of goods sold', 'cogs', 'D', 'cogs', 'tag cost at the moment of sale'),
 ('5100', 'Labour', 'expense', 'D', 'cost', 'hours × real rate, by room / zone (rates provisional today)'),
 ('5200', 'Loss — waste and destruction', 'expense', 'D', 'cost', 'waste at harvest close, negative adjustments, destruction'),
 ('5300', 'Overhead', 'expense', 'D', 'cost', 'owner-stated overhead until accounts post it'),
 ('9000', 'Memo — third-party material', 'memo', 'D', 'memo', 'never revenue (owner ruling): material moved for third parties is memo only')
on conflict (code) do nothing;
alter table public.gl_account enable row level security;
drop policy if exists gl_account_read on public.gl_account; create policy gl_account_read on public.gl_account for select to authenticated using (true);
drop policy if exists gl_account_admin on public.gl_account; create policy gl_account_admin on public.gl_account for all to authenticated using (public.f_caller_is_admin()) with check (public.f_caller_is_admin());
grant select, insert, update on public.gl_account to authenticated;

create table if not exists public.posting_rule (
  rule_key text primary key, event_kind text not null, debit_code text not null references public.gl_account(code), credit_code text not null references public.gl_account(code),
  grain text not null, basis_method text not null, source_table text, active boolean not null default true, note text, updated_at timestamptz not null default now()
);
comment on table public.posting_rule is 'BP-6 the posting map as rows — event → debit / credit / grain / basis. The engine reads it; the owner edits it on the Setup form.';
insert into public.posting_rule (rule_key, event_kind, debit_code, credit_code, grain, basis_method, source_table, active, note) values
 ('harvest_close', 'harvest_close', '1300', '1400', 'harvest · strain · room', 'wet weight at close × fresh-frozen valuation rate (indicative; accumulated cost/g waits on supplies and labour postings)', 'metrc_harvests', true, 'Bible §6 row 2'),
 ('harvest_waste', 'harvest_waste', '5200', '1300', 'harvest', 'waste weight × fresh-frozen valuation rate (indicative)', 'metrc_harvests', true, 'Bible §6 row 11'),
 ('packaged', 'packaged', '1310', '1300', 'tag', 'pounds × valuation rate for the tag''s stream (indicative); no amount where the weight was not captured at packaging', 'tag_event', true, 'Bible §6 row 3'),
 ('sold_cogs', 'sold', '5000', '1310', 'tag · manifest · counterparty licence', 'pounds sold × valuation rate for the tag''s stream (indicative tag cost)', 'tag_event', true, 'Bible §6 row 6, cost side'),
 ('sold_revenue', 'apex_order', '1100', '4000', 'order · customer · licence', 'Apex recognized total, MATCHED orders only (certified order-grain money)', 'v_apex_invoice_truth', true, 'Bible §6 row 6, revenue side'),
 ('adjusted_loss', 'adjusted', '5200', '1310', 'tag', 'negative adjustment pounds × valuation rate (indicative)', 'tag_event', true, 'Bible §6 row 11'),
 ('third_party_memo', 'received', '9000', '9000', 'tag · destination licence', 'memo only — never revenue (owner ruling 12 Sep 2026)', 'tag_event', true, 'Bible §6 row 7'),
 ('payroll', 'pay_run', '5100', '2100', 'person · shift · room', 'hours × real rate from the pay run (rates provisional until HR enters them)', 'v_payroll_journal', true, 'Bible §6 row 10'),
 ('purchase_received', 'purchase', '1500', '2000', 'PO line', 'unit cost × quantity received', 'material_purchases', true, 'Bible §6 row 9'),
 ('payment_received', 'payment', '1000', '1100', 'invoice', 'Apex payment events', 'apex_raw', false, 'Bible §6 row 8 — not posted in v1: payment events are not yet a table'),
 ('manufacturing_run', 'run_closed', '1310', '1300', 'run · tag', 'BOM + actual', 'pipeline_runs', false, 'Bible §6 row 4 — not posted in v1: runs carry no cost inputs yet')
on conflict (rule_key) do nothing;
alter table public.posting_rule enable row level security;
drop policy if exists posting_rule_read on public.posting_rule; create policy posting_rule_read on public.posting_rule for select to authenticated using (true);
drop policy if exists posting_rule_admin on public.posting_rule; create policy posting_rule_admin on public.posting_rule for all to authenticated using (public.f_caller_is_admin()) with check (public.f_caller_is_admin());
grant select, insert, update on public.posting_rule to authenticated;

create table if not exists public.journal (
  id bigint generated always as identity primary key,
  book text not null, event_kind text not null, rule_key text not null references public.posting_rule(rule_key),
  event_at timestamptz not null, source_table text not null, source_id text not null, tag text, dims jsonb not null default '{}'::jsonb,
  amount numeric, qty_lb numeric, basis_method text not null, indicative boolean not null default true, gap_reason text, memo text,
  posted_at timestamptz not null default now(),
  unique (source_table, source_id, event_kind)
);
comment on table public.journal is 'BP-6 one journal per source event (idempotent on source_table · source_id · event_kind). amount null + gap_reason = the event is known but could not be priced — a coverage figure, never a silent gap. Append-only.';
create index if not exists journal_event_at_idx on public.journal (event_at desc);
create index if not exists journal_tag_idx on public.journal (tag);
create index if not exists journal_book_kind_idx on public.journal (book, event_kind);
create table if not exists public.journal_line (
  id bigint generated always as identity primary key,
  journal_id bigint not null references public.journal(id) on delete cascade,
  account_code text not null references public.gl_account(code), side char(1) not null check (side in ('D','C')),
  amount numeric not null, qty_lb numeric, tag text, dims jsonb not null default '{}'::jsonb
);
create index if not exists journal_line_journal_idx on public.journal_line (journal_id);
create index if not exists journal_line_account_idx on public.journal_line (account_code);
alter table public.journal enable row level security; alter table public.journal_line enable row level security;
drop policy if exists journal_read on public.journal; create policy journal_read on public.journal for select to authenticated using (true);
drop policy if exists journal_line_read on public.journal_line; create policy journal_line_read on public.journal_line for select to authenticated using (true);
grant select on public.journal, public.journal_line to authenticated;
-- append-only (rule H2): no update, no delete, by anyone
create or replace function public.journal_immutable() returns trigger language plpgsql as $$
begin raise exception 'The journal is append-only (rule H2). A wrong posting is reversed by a new journal, never edited.'; end $$;
create or replace function public.journal_line_immutable() returns trigger language plpgsql as $$
begin raise exception 'Journal lines are append-only (rule H2).'; end $$;
drop trigger if exists journal_immutable on public.journal; create trigger journal_immutable before update or delete on public.journal for each row execute function public.journal_immutable();
drop trigger if exists journal_line_immutable on public.journal_line; create trigger journal_line_immutable before update or delete on public.journal_line for each row execute function public.journal_line_immutable();

-- ── the engine ────────────────────────────────────────────────────────────────────────────────
create or replace function public.f_post_journals(p_limit int default 5000) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ff numeric := public.f_rate_for('Fresh frozen'); v_n_harv int := 0; v_n_waste int := 0; v_n_pack int := 0; v_n_sold int := 0; v_n_rev int := 0; v_n_adj int := 0; v_n_memo int := 0; v_n_pay int := 0; v_n_pur int := 0;
        r record; v_j bigint; v_amt numeric; v_d text; v_c text;
begin
  -- THE MAP IS ROWS: every section reads its debit / credit codes from posting_rule and is skipped when the rule is inactive.
  -- 1 · harvest closed: wet weight at close → Inventory wet / WIP; waste → Loss
  select debit_code, credit_code into v_d, v_c from public.posting_rule where rule_key = 'harvest_close' and active;
  if found then for r in select h.id, h.license, h.name, h.harvest_start, h.wet_weight, h.waste_weight, h.flower_room, h.raw->>'StrainName' strain, public.f_to_pounds(h.wet_weight, 'g') wet_lb, public.f_to_pounds(h.waste_weight, 'g') waste_lb
             from public.metrc_harvests h
            where h.harvest_start is not null and not exists (select 1 from public.journal j where j.source_table = 'metrc_harvests' and j.source_id = h.id::text and j.event_kind = 'harvest_close')
            order by h.harvest_start limit p_limit loop
    v_amt := case when r.wet_lb is null then null else round(r.wet_lb * v_ff, 2) end;
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, tag, dims, amount, qty_lb, basis_method, indicative, gap_reason, memo)
    values (r.license, 'harvest_close', 'harvest_close', r.harvest_start::timestamptz, 'metrc_harvests', r.id::text, null,
            jsonb_build_object('harvest', r.name, 'room', r.flower_room, 'strain', r.strain), v_amt, r.wet_lb,
            'wet lb ' || coalesce(round(r.wet_lb, 1)::text, '?') || ' × fresh-frozen rate $' || v_ff || '/lb (valuation_rates, indicative)', true,
            case when r.wet_lb is null then 'no wet weight on the Metrc harvest' when v_ff = 0 then 'fresh-frozen rate is $0 (unconfirmed)' end, 'Harvest ' || r.name || ' closed')
    returning id into v_j;
    if v_amt is not null then
      insert into public.journal_line (journal_id, account_code, side, amount, qty_lb, dims) values (v_j, v_d, 'D', v_amt, r.wet_lb, jsonb_build_object('harvest', r.name, 'room', r.flower_room)), (v_j, v_c, 'C', v_amt, r.wet_lb, jsonb_build_object('harvest', r.name, 'room', r.flower_room));
    end if;
    v_n_harv := v_n_harv + 1;
    if coalesce(r.waste_lb, 0) > 0 and exists (select 1 from public.posting_rule where rule_key = 'harvest_waste' and active) then
      v_amt := round(r.waste_lb * v_ff, 2); v_j := null;
      insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, dims, amount, qty_lb, basis_method, indicative, gap_reason, memo)
      values (r.license, 'harvest_waste', 'harvest_waste', r.harvest_start::timestamptz, 'metrc_harvests', r.id::text, jsonb_build_object('harvest', r.name, 'room', r.flower_room), v_amt, r.waste_lb,
              'waste lb ' || round(r.waste_lb, 1) || ' × fresh-frozen rate $' || v_ff || '/lb (indicative)', true, case when v_ff = 0 then 'fresh-frozen rate is $0 (unconfirmed)' end, 'Waste at harvest ' || r.name)
      on conflict do nothing returning id into v_j;
      if v_j is not null then insert into public.journal_line (journal_id, account_code, side, amount, qty_lb) select v_j, debit_code, 'D', v_amt, r.waste_lb from public.posting_rule where rule_key = 'harvest_waste' union all select v_j, credit_code, 'C', v_amt, r.waste_lb from public.posting_rule where rule_key = 'harvest_waste'; v_n_waste := v_n_waste + 1; end if;
    end if;
  end loop; end if;

  -- 2 · packaged: pounds × stream rate → Inventory FG (tag) / Inventory bulk; no amount where the weight was not captured
  select debit_code, credit_code into v_d, v_c from public.posting_rule where rule_key = 'packaged' and active;
  if found then for r in select e.id, e.tag, e.event_at, public.f_to_pounds(e.qty, e.uom) lb, p.license, public.f_stream_for_category(p.raw #>> '{Item,ProductCategoryName}') stream, p.raw #>> '{Item,ProductCategoryName}' category, p.raw #>> '{Item,StrainName}' strain
             from public.tag_event e
             left join lateral (select * from public.metrc_packages m where m.tag = e.tag order by m.synced_at desc nulls last limit 1) p on true
            where e.event_type = 'packaged' and not exists (select 1 from public.journal j where j.source_table = 'tag_event' and j.source_id = e.id::text and j.event_kind = 'packaged')
            order by e.event_at limit p_limit loop
    v_amt := case when r.lb is null or r.lb <= 0 then null else round(r.lb * public.f_rate_for(r.stream, r.tag), 2) end;
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, tag, dims, amount, qty_lb, basis_method, indicative, gap_reason, memo)
    values (coalesce(r.license, 'unknown'), 'packaged', 'packaged', r.event_at, 'tag_event', r.id::text, r.tag, jsonb_build_object('stream', r.stream, 'category', r.category, 'strain', r.strain),
            v_amt, r.lb, 'lb ' || coalesce(round(r.lb, 3)::text, '?') || ' × $' || public.f_rate_for(r.stream, r.tag) || '/lb (' || coalesce(r.stream, '?') || ', valuation_rates, indicative)', true,
            case when r.lb is null or r.lb <= 0 then 'weight not captured at packaging (countable unit or zero quantity on the event)' when public.f_rate_for(r.stream, r.tag) = 0 then 'stream rate is $0 (unconfirmed)' end, 'Packaged ' || r.tag)
    returning id into v_j;
    if v_amt is not null then insert into public.journal_line (journal_id, account_code, side, amount, qty_lb, tag, dims) values (v_j, v_d, 'D', v_amt, r.lb, r.tag, jsonb_build_object('stream', r.stream)), (v_j, v_c, 'C', v_amt, r.lb, r.tag, jsonb_build_object('stream', r.stream)); end if;
    v_n_pack := v_n_pack + 1;
  end loop; end if;

  -- 3 · sold: COGS at tag cost (valuation basis) / Inventory FG
  select debit_code, credit_code into v_d, v_c from public.posting_rule where rule_key = 'sold_cogs' and active;
  if found then for r in select e.id, e.tag, e.event_at, e.manifest_number, e.counterparty_licence, public.f_to_pounds(e.qty, e.uom) lb, p.license, public.f_stream_for_category(p.raw #>> '{Item,ProductCategoryName}') stream, p.raw #>> '{Item,StrainName}' strain
             from public.tag_event e
             left join lateral (select * from public.metrc_packages m where m.tag = e.tag order by m.synced_at desc nulls last limit 1) p on true
            where e.event_type = 'sold' and not exists (select 1 from public.journal j where j.source_table = 'tag_event' and j.source_id = e.id::text and j.event_kind = 'sold')
            order by e.event_at limit p_limit loop
    v_amt := case when r.lb is null or r.lb <= 0 then null else round(r.lb * public.f_rate_for(r.stream, r.tag), 2) end;
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, tag, dims, amount, qty_lb, basis_method, indicative, gap_reason, memo)
    values (coalesce(r.license, 'unknown'), 'sold', 'sold_cogs', r.event_at, 'tag_event', r.id::text, r.tag, jsonb_build_object('stream', r.stream, 'strain', r.strain, 'manifest', r.manifest_number, 'counterparty_licence', r.counterparty_licence),
            v_amt, r.lb, 'lb ' || coalesce(round(r.lb, 3)::text, '?') || ' × $' || public.f_rate_for(r.stream, r.tag) || '/lb (' || coalesce(r.stream, '?') || ', indicative tag cost)', true,
            case when r.lb is null or r.lb <= 0 then 'no weight on the sale event' when public.f_rate_for(r.stream, r.tag) = 0 then 'stream rate is $0 (unconfirmed)' end, 'Sold ' || r.tag || coalesce(' on manifest ' || r.manifest_number, ''))
    returning id into v_j;
    if v_amt is not null then insert into public.journal_line (journal_id, account_code, side, amount, qty_lb, tag, dims) values (v_j, v_d, 'D', v_amt, r.lb, r.tag, jsonb_build_object('manifest', r.manifest_number)), (v_j, v_c, 'C', v_amt, r.lb, r.tag, jsonb_build_object('manifest', r.manifest_number)); end if;
    v_n_sold := v_n_sold + 1;
  end loop; end if;

  -- 4 · revenue at order grain: Apex MATCHED orders (the certified sales measure) → AR / Revenue; every other link status is a gap row
  select debit_code, credit_code into v_d, v_c from public.posting_rule where rule_key = 'sold_revenue' and active;
  if found then for r in select t.apex_order_id, t.order_date, t.invoice_number, t.buyer_state_license, t.recognized_total_usd, t.invoice_total_usd, t.link_status, t.cancelled, t.matched_package_tags
             from public.v_apex_invoice_truth t
            where t.apex_order_id is not null and not coalesce(t.cancelled, false)
              and not exists (select 1 from public.journal j where j.source_table = 'v_apex_invoice_truth' and j.source_id = t.apex_order_id and j.event_kind = 'apex_order')
            order by t.order_date limit p_limit loop
    v_amt := case when r.link_status = 'MATCHED' then r.recognized_total_usd else null end;
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, dims, amount, basis_method, indicative, gap_reason, memo)
    values ('MP281909', 'apex_order', 'sold_revenue', coalesce(r.order_date::timestamptz, now()), 'v_apex_invoice_truth', r.apex_order_id,
            jsonb_build_object('invoice', r.invoice_number, 'customer_licence', r.buyer_state_license, 'link_status', r.link_status, 'tags_matched', r.matched_package_tags, 'invoice_total_usd', r.invoice_total_usd),
            v_amt, 'Apex recognized_total_usd, order grain (v_apex_invoice_truth); book = MP281909, the Apex seller licence', r.link_status <> 'MATCHED',
            case when r.link_status <> 'MATCHED' then 'Apex order not matched to Metrc: ' || r.link_status end, 'Apex order ' || coalesce(r.invoice_number, r.apex_order_id))
    returning id into v_j;
    if v_amt is not null then insert into public.journal_line (journal_id, account_code, side, amount, dims) values (v_j, v_d, 'D', v_amt, jsonb_build_object('invoice', r.invoice_number, 'customer_licence', r.buyer_state_license)), (v_j, v_c, 'C', v_amt, jsonb_build_object('invoice', r.invoice_number, 'customer_licence', r.buyer_state_license)); end if;
    v_n_rev := v_n_rev + 1;
  end loop; end if;

  -- 5 · negative adjustments: Loss / Inventory FG at the valuation basis
  select debit_code, credit_code into v_d, v_c from public.posting_rule where rule_key = 'adjusted_loss' and active;
  if found then for r in select e.id, e.tag, e.event_at, e.qty, e.uom, public.f_to_pounds(abs(e.qty), e.uom) lb, p.license, public.f_stream_for_category(p.raw #>> '{Item,ProductCategoryName}') stream, e.source_row
             from public.tag_event e
             left join lateral (select * from public.metrc_packages m where m.tag = e.tag order by m.synced_at desc nulls last limit 1) p on true
            where e.event_type = 'adjusted' and e.qty < 0 and not exists (select 1 from public.journal j where j.source_table = 'tag_event' and j.source_id = e.id::text and j.event_kind = 'adjusted')
            order by e.event_at limit p_limit loop
    v_amt := case when r.lb is null then null else round(r.lb * public.f_rate_for(r.stream, r.tag), 2) end;
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, tag, dims, amount, qty_lb, basis_method, indicative, gap_reason, memo)
    values (coalesce(r.license, 'unknown'), 'adjusted', 'adjusted_loss', r.event_at, 'tag_event', r.id::text, r.tag, jsonb_build_object('stream', r.stream, 'adjustment', r.source_row), v_amt, r.lb,
            'lb ' || coalesce(round(r.lb, 3)::text, '?') || ' × $' || public.f_rate_for(r.stream, r.tag) || '/lb (indicative)', true,
            case when r.lb is null then 'adjustment in countable units — no pound figure' when public.f_rate_for(r.stream, r.tag) = 0 then 'stream rate is $0 (unconfirmed)' end, 'Negative adjustment on ' || r.tag)
    returning id into v_j;
    if v_amt is not null then insert into public.journal_line (journal_id, account_code, side, amount, qty_lb, tag) values (v_j, v_d, 'D', v_amt, r.lb, r.tag), (v_j, v_c, 'C', v_amt, r.lb, r.tag); end if;
    v_n_adj := v_n_adj + 1;
  end loop; end if;

  -- 6 · third-party material received: memo only (never revenue)
  if exists (select 1 from public.posting_rule where rule_key = 'third_party_memo' and active) then
  insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, tag, dims, amount, qty_lb, basis_method, indicative, memo)
  select 'memo', 'received', 'third_party_memo', e.event_at, 'tag_event', e.id::text, e.tag, jsonb_build_object('from_licence', e.counterparty_licence, 'manifest', e.manifest_number), null, public.f_to_pounds(e.qty, e.uom),
         'memo — third-party material, never revenue (owner ruling)', true, 'Received ' || e.tag || ' from ' || coalesce(e.counterparty_licence, '?')
    from public.tag_event e
   where e.event_type = 'received' and e.counterparty_licence is not null and not public.f_is_ours(e.counterparty_licence)
     and not exists (select 1 from public.journal j where j.source_table = 'tag_event' and j.source_id = e.id::text and j.event_kind = 'received')
   order by e.event_at limit p_limit;
  get diagnostics v_n_memo = row_count;
  end if;

  -- 7 · payroll: the HR lane's payroll journal (already sided and coded) — imported per pay run when it exists
  select debit_code, credit_code into v_d, v_c from public.posting_rule where rule_key = 'payroll' and active;
  if found then for r in select pj.pay_run_id, pj.pay_date, sum(pj.amount) filter (where pj.side = 'debit') debits, sum(pj.amount) filter (where pj.side = 'credit') credits, jsonb_agg(jsonb_build_object('code', pj.code, 'gl', pj.gl_account, 'side', pj.side, 'amount', pj.amount, 'department', pj.department, 'cost_class', pj.cost_class, 'cogs', pj.cogs)) lines
             from public.v_payroll_journal pj
            where not exists (select 1 from public.journal j where j.source_table = 'v_payroll_journal' and j.source_id = pj.pay_run_id::text and j.event_kind = 'pay_run')
            group by pj.pay_run_id, pj.pay_date limit p_limit loop
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, dims, amount, basis_method, indicative, memo)
    values ('MC281714', 'pay_run', 'payroll', r.pay_date::timestamptz, 'v_payroll_journal', r.pay_run_id::text, jsonb_build_object('lines', r.lines), r.debits, 'HR pay run (v_payroll_journal); rates provisional until HR enters them', true, 'Pay run ' || r.pay_run_id)
    returning id into v_j;
    insert into public.journal_line (journal_id, account_code, side, amount, dims) values (v_j, v_d, 'D', coalesce(r.debits, 0), jsonb_build_object('pay_run', r.pay_run_id)), (v_j, v_c, 'C', coalesce(r.credits, r.debits, 0), jsonb_build_object('pay_run', r.pay_run_id));
    v_n_pay := v_n_pay + 1;
  end loop; end if;

  -- 8 · purchases received: unit cost × quantity → Supplies / AP
  select debit_code, credit_code into v_d, v_c from public.posting_rule where rule_key = 'purchase_received' and active;
  if found then for r in select m.id, m.received_date, m.purchase_date, m.supplier, m.material_type, m.purchased_qty, m.uom, m.unit_cost, m.freight, m.other_landed_cost, m.lot_code
             from public.material_purchases m
            where coalesce(m.received_date, m.purchase_date) is not null
              and not exists (select 1 from public.journal j where j.source_table = 'material_purchases' and j.source_id = m.id::text and j.event_kind = 'purchase')
            order by coalesce(m.received_date, m.purchase_date) limit p_limit loop
    v_amt := case when r.unit_cost is null or r.purchased_qty is null then null else round(r.unit_cost * r.purchased_qty + coalesce(r.freight, 0) + coalesce(r.other_landed_cost, 0), 2) end;
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, dims, amount, qty_lb, basis_method, indicative, gap_reason, memo)
    values ('MP281909', 'purchase', 'purchase_received', coalesce(r.received_date, r.purchase_date)::timestamptz, 'material_purchases', r.id::text,
            jsonb_build_object('supplier', r.supplier, 'material', r.material_type, 'lot', r.lot_code, 'qty', r.purchased_qty, 'uom', r.uom), v_amt, public.f_to_pounds(r.purchased_qty, r.uom),
            'unit cost × quantity + freight + other landed cost (material_purchases)', false, case when v_amt is null then 'no unit cost or quantity on the purchase' end, 'Purchase from ' || coalesce(r.supplier, '?'))
    returning id into v_j;
    if v_amt is not null then insert into public.journal_line (journal_id, account_code, side, amount, dims) values (v_j, v_d, 'D', v_amt, jsonb_build_object('supplier', r.supplier)), (v_j, v_c, 'C', v_amt, jsonb_build_object('supplier', r.supplier)); end if;
    v_n_pur := v_n_pur + 1;
  end loop; end if;

  return jsonb_build_object('harvest_close', v_n_harv, 'harvest_waste', v_n_waste, 'packaged', v_n_pack, 'sold', v_n_sold, 'apex_orders', v_n_rev, 'adjusted', v_n_adj, 'third_party_memo', v_n_memo, 'pay_runs', v_n_pay, 'purchases', v_n_pur, 'at', now());
end $$;
revoke all on function public.f_post_journals(int) from public, anon;

-- ── views: every figure names its basis and says whether it is indicative ─────────────────────
create or replace view public.v_gl_trial_balance as
select j.book, date_trunc('month', j.event_at)::date as month, l.account_code, a.name as account, a.kind,
       sum(l.amount) filter (where l.side = 'D') as debits, sum(l.amount) filter (where l.side = 'C') as credits,
       sum(case when l.side = a.normal_side then l.amount else -l.amount end) as balance_change,
       count(distinct j.id) as journals, sum(l.qty_lb) filter (where l.side = a.normal_side) as pounds,
       bool_or(j.indicative) as any_indicative
  from public.journal_line l join public.journal j on j.id = l.journal_id join public.gl_account a on a.code = l.account_code
 group by j.book, date_trunc('month', j.event_at), l.account_code, a.name, a.kind;
grant select on public.v_gl_trial_balance to authenticated;

create or replace view public.v_pnl_live as
with m as (
  select j.book, date_trunc('month', j.event_at)::date as month, a.kind, l.side, l.amount, j.indicative
    from public.journal_line l join public.journal j on j.id = l.journal_id join public.gl_account a on a.code = l.account_code)
select book, month,
       coalesce(sum(amount) filter (where kind = 'revenue' and side = 'C'), 0) - coalesce(sum(amount) filter (where kind = 'revenue' and side = 'D'), 0) as revenue,
       coalesce(sum(amount) filter (where kind = 'cogs' and side = 'D'), 0) - coalesce(sum(amount) filter (where kind = 'cogs' and side = 'C'), 0) as cogs,
       coalesce(sum(amount) filter (where kind = 'expense' and side = 'D'), 0) - coalesce(sum(amount) filter (where kind = 'expense' and side = 'C'), 0) as expenses,
       (coalesce(sum(amount) filter (where kind = 'revenue' and side = 'C'), 0) - coalesce(sum(amount) filter (where kind = 'revenue' and side = 'D'), 0))
       - (coalesce(sum(amount) filter (where kind = 'cogs' and side = 'D'), 0) - coalesce(sum(amount) filter (where kind = 'cogs' and side = 'C'), 0)) as gross_margin,
       (coalesce(sum(amount) filter (where kind = 'revenue' and side = 'C'), 0) - coalesce(sum(amount) filter (where kind = 'revenue' and side = 'D'), 0))
       - (coalesce(sum(amount) filter (where kind = 'cogs' and side = 'D'), 0) - coalesce(sum(amount) filter (where kind = 'cogs' and side = 'C'), 0))
       - (coalesce(sum(amount) filter (where kind = 'expense' and side = 'D'), 0) - coalesce(sum(amount) filter (where kind = 'expense' and side = 'C'), 0)) as operating_result,
       bool_or(indicative) filter (where kind in ('cogs', 'expense')) as cogs_indicative,
       bool_or(indicative) filter (where kind = 'revenue') as revenue_indicative,
       'Revenue: Apex recognized totals of MATCHED orders (certified, order grain). COGS: pounds sold × valuation rate for the stream (INDICATIVE until actual cost posts). Expenses: loss at valuation basis, labour when pay runs exist. Overhead is not posted here — see cost per pound.' as how_to_read_it
  from m group by book, month;
grant select on public.v_pnl_live to authenticated;

create or replace view public.v_inventory_value_journal as
select j.book, coalesce(l.dims->>'stream', j.dims->>'stream', '(no stream)') as stream, l.account_code, a.name as account,
       sum(case when l.side = 'D' then l.amount else -l.amount end) as balance_usd,
       sum(case when l.side = 'D' then l.qty_lb else -l.qty_lb end) as pounds_net,
       count(distinct l.tag) as tags, max(j.event_at) as last_event_at,
       'Balance of the inventory accounts from the journal (packaged in, sold and adjusted out) at valuation rates — INDICATIVE. Compare with v_money_position (the live on-hand valued the same way): a gap is un-posted movement, most often packaging events without a captured weight (see v_spine_coverage).' as how_to_read_it
  from public.journal_line l join public.journal j on j.id = l.journal_id join public.gl_account a on a.code = l.account_code
 where a.role = 'inventory'
 group by j.book, coalesce(l.dims->>'stream', j.dims->>'stream', '(no stream)'), l.account_code, a.name;
grant select on public.v_inventory_value_journal to authenticated;

create or replace view public.v_cost_per_pound_journal as
with m as (
  select date_trunc('month', j.event_at)::date as month,
         sum(l.amount) filter (where a.role = 'cogs' and l.side = 'D') as cogs_usd,
         sum(l.qty_lb) filter (where a.role = 'cogs' and l.side = 'D') as lb_sold,
         sum(l.amount) filter (where a.role = 'cost' and l.side = 'D') as cost_posted_usd,
         sum(l.qty_lb) filter (where j.event_kind = 'packaged' and a.role = 'inventory' and l.side = 'D') as lb_packaged
    from public.journal_line l join public.journal j on j.id = l.journal_id join public.gl_account a on a.code = l.account_code group by 1)
select month, cogs_usd, lb_sold, case when coalesce(lb_sold, 0) > 0 then round(cogs_usd / lb_sold, 2) end as indicative_cost_per_lb_sold,
       cost_posted_usd, lb_packaged, case when coalesce(lb_packaged, 0) > 0 then round(cost_posted_usd / lb_packaged, 2) end as posted_cost_per_lb_packaged,
       'INDICATIVE. cogs_usd is pounds sold × valuation rate — a value, not yet a cost. posted_cost_per_lb_packaged is what the journal has actually posted as cost (labour, loss, supplies, overhead) per pound packaged that month; it becomes the true cost per pound as pay runs, purchases and overhead post. v_cost_per_pound (owner-stated overhead) remains the reference until then.' as how_to_read_it
  from m;
grant select on public.v_cost_per_pound_journal to authenticated;

create or replace view public.v_spine_coverage as
select r.rule_key, r.event_kind, r.active, r.source_table, r.basis_method,
       (select count(*) from public.journal j where j.rule_key = r.rule_key) as journals,
       (select count(*) from public.journal j where j.rule_key = r.rule_key and j.amount is not null) as priced,
       (select count(*) from public.journal j where j.rule_key = r.rule_key and j.amount is null) as unpriced,
       (select mode() within group (order by j.gap_reason) from public.journal j where j.rule_key = r.rule_key and j.gap_reason is not null) as commonest_gap,
       (select sum(j.amount) from public.journal j where j.rule_key = r.rule_key) as amount_usd,
       (select max(j.event_at) from public.journal j where j.rule_key = r.rule_key) as last_event_at,
       (select max(j.posted_at) from public.journal j where j.rule_key = r.rule_key) as last_posted_at,
       case r.rule_key when 'packaged' then (select count(*) from public.tag_event where event_type = 'packaged') when 'sold' then (select count(*) from public.tag_event where event_type = 'sold') when 'sold_cogs' then (select count(*) from public.tag_event where event_type = 'sold')
                       when 'adjusted_loss' then (select count(*) from public.tag_event where event_type = 'adjusted' and qty < 0) when 'harvest_close' then (select count(*) from public.metrc_harvests where harvest_start is not null)
                       when 'sold_revenue' then (select count(*) from public.v_apex_invoice_truth where apex_order_id is not null and not coalesce(cancelled, false)) when 'third_party_memo' then (select count(*) from public.tag_event e where event_type = 'received' and counterparty_licence is not null and not public.f_is_ours(counterparty_licence))
                       when 'purchase_received' then (select count(*) from public.material_purchases) when 'payroll' then (select count(distinct pay_run_id) from public.v_payroll_journal) end as source_events,
       (select max(event_at) from public.tag_event) as ledger_last_event_at
  from public.posting_rule r;
grant select on public.v_spine_coverage to authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'journal-post';
select cron.schedule('journal-post', '* * * * *', $cron$ select public.f_post_journals(2000); $cron$);

-- pages: Finance › Money spine (read-only views; the journal itself is append-only and not on the Setup form)
insert into public.nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, surface, page_kind, subcategory, module, archetype)
values
 ('Finance', 0, 'Live P&L (journal)', 70, 'bar-chart-2', 'pnl_live', 'v_pnl_live', 'Revenue, cost of goods and expenses by month and book from the journal at tag grain. Revenue is the Apex-matched order total (certified); cost of goods is indicative until actual cost posts. Bible §6.', true, false, 'deep', 'report', 'Cost & Margin', 'finance', 'cost_sheet'),
 ('Finance', 0, 'Trial balance (journal)', 71, 'bar-chart-2', 'gl_trial_balance', 'v_gl_trial_balance', 'Debits, credits and balance change by book, month and account from the journal. Bible §6.', true, false, 'deep', 'report', 'Cost & Margin', 'finance', 'cost_sheet'),
 ('Finance', 0, 'Inventory value (journal)', 72, 'bar-chart-2', 'inventory_value_journal', 'v_inventory_value_journal', 'Inventory account balances by stream from the journal — indicative, at valuation rates; compare with the live money position. Bible §6.', true, false, 'deep', 'report', 'Cost & Margin', 'finance', 'stock_position'),
 ('Finance', 0, 'Cost per pound (journal)', 73, 'bar-chart-2', 'cost_per_pound_journal', 'v_cost_per_pound_journal', 'What the journal has posted as cost per pound packaged and sold, by month — indicative until pay runs, purchases and overhead post. Bible §6.', true, false, 'deep', 'report', 'Cost & Margin', 'finance', 'cost_sheet'),
 ('Finance', 0, 'Money spine coverage', 74, 'shield', 'spine_coverage', 'v_spine_coverage', 'Every posting rule: how many source events it has journalled, how many carry an amount, the commonest reason one could not be priced, and how fresh the ledger is. The honesty page of the money spine. Bible §6, §16.5.', true, false, 'deep', 'report', 'Cost & Margin', 'finance', 'reconciliation'),
 ('Finance', 0, 'Posting rules', 75, 'list', 'posting_rules', 'posting_rule', 'The money spine''s posting map as rows: event → debit / credit / grain / basis. Edit here with a reason; the engine reads it every minute. Bible §6.', true, true, 'deep', 'report', 'Cost & Margin', 'finance', 'data_browser'),
 ('Finance', 0, 'Chart of accounts', 76, 'list', 'gl_accounts', 'gl_account', 'The accounts the posting map uses. Edit here with a reason. Bible §6.', true, true, 'deep', 'report', 'Cost & Margin', 'finance', 'data_browser')
on conflict (view_key) do update set label = excluded.label, description = excluded.description, table_ref = excluded.table_ref, enabled = true, module = 'finance', archetype = excluded.archetype;
notify pgrst, 'reload schema';;
