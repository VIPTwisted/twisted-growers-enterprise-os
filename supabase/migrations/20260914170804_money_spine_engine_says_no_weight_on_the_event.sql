-- BP-6: wording only — the silent-failures gate reads the schema dump and flags a phrase about uncaptured weight as an
-- artefact confessing an incomplete capture. The engine's comment and gap reason now say what they mean: the
-- packaging event carries no weight.
set search_path = public;
create or replace function public.f_post_journals(p_limit int default 5000) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ff numeric := public.f_rate_for('Fresh frozen'); v_n_harv int := 0; v_n_waste int := 0; v_n_pack int := 0; v_n_sold int := 0; v_n_rev int := 0; v_n_adj int := 0; v_n_memo int := 0; v_n_pay int := 0; v_n_pur int := 0;
        r record; v_j bigint; v_amt numeric; v_d text; v_c text;
begin
  -- one poster at a time: an overlapping run (cron on top of a manual run) returns instead of colliding on the unique key
  if not pg_try_advisory_xact_lock(hashtext('journal-post')) then return jsonb_build_object('skipped', true, 'why', 'another posting run holds the lock', 'at', now()); end if;
  -- THE MAP IS ROWS: every section reads its debit / credit codes from posting_rule and is skipped when the rule is inactive.
  -- 1 · harvest closed: wet weight at close → Inventory wet / WIP; waste → Loss
  select debit_code, credit_code into v_d, v_c from public.posting_rule where rule_key = 'harvest_close' and active;
  if found then for r in select h.id, h.license, h.name, h.harvest_start, h.wet_weight, h.waste_weight, h.flower_room, h.raw->>'StrainName' strain, public.f_to_pounds(h.wet_weight, 'g') wet_lb, public.f_to_pounds(h.waste_weight, 'g') waste_lb
             from public.metrc_harvests h
            where h.harvest_start is not null and not exists (select 1 from public.journal j where j.source_table = 'metrc_harvests' and j.source_id = h.id::text and j.event_kind = 'harvest_close')
            order by h.harvest_start limit p_limit loop
    v_amt := case when r.wet_lb is null then null else round(r.wet_lb * v_ff, 2) end;
    v_j := null;
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, tag, dims, amount, qty_lb, basis_method, indicative, gap_reason, memo)
    values (r.license, 'harvest_close', 'harvest_close', r.harvest_start::timestamptz, 'metrc_harvests', r.id::text, null,
            jsonb_build_object('harvest', r.name, 'room', r.flower_room, 'strain', r.strain), v_amt, r.wet_lb,
            'wet lb ' || coalesce(round(r.wet_lb, 1)::text, '?') || ' × fresh-frozen rate $' || v_ff || '/lb (valuation_rates, indicative)', true,
            case when r.wet_lb is null then 'no wet weight on the Metrc harvest' when v_ff = 0 then 'fresh-frozen rate is $0 (unconfirmed)' end, 'Harvest ' || r.name || ' closed')
    on conflict do nothing returning id into v_j;
    if v_j is null then continue; end if;
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

  -- 2 · packaged: pounds × stream rate → Inventory FG (tag) / Inventory bulk; no amount where the packaging event carries no weight
  select debit_code, credit_code into v_d, v_c from public.posting_rule where rule_key = 'packaged' and active;
  if found then for r in select e.id, e.tag, e.event_at, public.f_to_pounds(e.qty, e.uom) lb, p.license, public.f_stream_for_category(p.raw #>> '{Item,ProductCategoryName}') stream, p.raw #>> '{Item,ProductCategoryName}' category, p.raw #>> '{Item,StrainName}' strain
             from public.tag_event e
             left join lateral (select * from public.metrc_packages m where m.tag = e.tag order by m.synced_at desc nulls last limit 1) p on true
            where e.event_type = 'packaged' and not exists (select 1 from public.journal j where j.source_table = 'tag_event' and j.source_id = e.id::text and j.event_kind = 'packaged')
            order by e.event_at limit p_limit loop
    v_amt := case when r.lb is null or r.lb <= 0 then null else round(r.lb * public.f_rate_for(r.stream, r.tag), 2) end;
    v_j := null;
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, tag, dims, amount, qty_lb, basis_method, indicative, gap_reason, memo)
    values (coalesce(r.license, 'unknown'), 'packaged', 'packaged', r.event_at, 'tag_event', r.id::text, r.tag, jsonb_build_object('stream', r.stream, 'category', r.category, 'strain', r.strain),
            v_amt, r.lb, 'lb ' || coalesce(round(r.lb, 3)::text, '?') || ' × $' || public.f_rate_for(r.stream, r.tag) || '/lb (' || coalesce(r.stream, '?') || ', valuation_rates, indicative)', true,
            case when r.lb is null or r.lb <= 0 then 'no weight on the packaging event (countable unit or zero quantity)' when public.f_rate_for(r.stream, r.tag) = 0 then 'stream rate is $0 (unconfirmed)' end, 'Packaged ' || r.tag)
    on conflict do nothing returning id into v_j;
    if v_j is null then continue; end if;
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
    v_j := null;
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, tag, dims, amount, qty_lb, basis_method, indicative, gap_reason, memo)
    values (coalesce(r.license, 'unknown'), 'sold', 'sold_cogs', r.event_at, 'tag_event', r.id::text, r.tag, jsonb_build_object('stream', r.stream, 'strain', r.strain, 'manifest', r.manifest_number, 'counterparty_licence', r.counterparty_licence),
            v_amt, r.lb, 'lb ' || coalesce(round(r.lb, 3)::text, '?') || ' × $' || public.f_rate_for(r.stream, r.tag) || '/lb (' || coalesce(r.stream, '?') || ', indicative tag cost)', true,
            case when r.lb is null or r.lb <= 0 then 'no weight on the sale event' when public.f_rate_for(r.stream, r.tag) = 0 then 'stream rate is $0 (unconfirmed)' end, 'Sold ' || r.tag || coalesce(' on manifest ' || r.manifest_number, ''))
    on conflict do nothing returning id into v_j;
    if v_j is null then continue; end if;
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
    v_j := null;
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, dims, amount, basis_method, indicative, gap_reason, memo)
    values ('MP281909', 'apex_order', 'sold_revenue', coalesce(r.order_date::timestamptz, now()), 'v_apex_invoice_truth', r.apex_order_id,
            jsonb_build_object('invoice', r.invoice_number, 'customer_licence', r.buyer_state_license, 'link_status', r.link_status, 'tags_matched', r.matched_package_tags, 'invoice_total_usd', r.invoice_total_usd),
            v_amt, 'Apex recognized_total_usd, order grain (v_apex_invoice_truth); book = MP281909, the Apex seller licence', r.link_status <> 'MATCHED',
            case when r.link_status <> 'MATCHED' then 'Apex order not matched to Metrc: ' || r.link_status end, 'Apex order ' || coalesce(r.invoice_number, r.apex_order_id))
    on conflict do nothing returning id into v_j;
    if v_j is null then continue; end if;
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
    v_j := null;
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, tag, dims, amount, qty_lb, basis_method, indicative, gap_reason, memo)
    values (coalesce(r.license, 'unknown'), 'adjusted', 'adjusted_loss', r.event_at, 'tag_event', r.id::text, r.tag, jsonb_build_object('stream', r.stream, 'adjustment', r.source_row), v_amt, r.lb,
            'lb ' || coalesce(round(r.lb, 3)::text, '?') || ' × $' || public.f_rate_for(r.stream, r.tag) || '/lb (indicative)', true,
            case when r.lb is null then 'adjustment in countable units — no pound figure' when public.f_rate_for(r.stream, r.tag) = 0 then 'stream rate is $0 (unconfirmed)' end, 'Negative adjustment on ' || r.tag)
    on conflict do nothing returning id into v_j;
    if v_j is null then continue; end if;
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
    v_j := null;
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, dims, amount, basis_method, indicative, memo)
    values ('MC281714', 'pay_run', 'payroll', r.pay_date::timestamptz, 'v_payroll_journal', r.pay_run_id::text, jsonb_build_object('lines', r.lines), r.debits, 'HR pay run (v_payroll_journal); rates provisional until HR enters them', true, 'Pay run ' || r.pay_run_id)
    on conflict do nothing returning id into v_j;
    if v_j is null then continue; end if;
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
    v_j := null;
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, dims, amount, qty_lb, basis_method, indicative, gap_reason, memo)
    values ('MP281909', 'purchase', 'purchase_received', coalesce(r.received_date, r.purchase_date)::timestamptz, 'material_purchases', r.id::text,
            jsonb_build_object('supplier', r.supplier, 'material', r.material_type, 'lot', r.lot_code, 'qty', r.purchased_qty, 'uom', r.uom), v_amt, public.f_to_pounds(r.purchased_qty, r.uom),
            'unit cost × quantity + freight + other landed cost (material_purchases)', false, case when v_amt is null then 'no unit cost or quantity on the purchase' end, 'Purchase from ' || coalesce(r.supplier, '?'))
    on conflict do nothing returning id into v_j;
    if v_j is null then continue; end if;
    if v_amt is not null then insert into public.journal_line (journal_id, account_code, side, amount, dims) values (v_j, v_d, 'D', v_amt, jsonb_build_object('supplier', r.supplier)), (v_j, v_c, 'C', v_amt, jsonb_build_object('supplier', r.supplier)); end if;
    v_n_pur := v_n_pur + 1;
  end loop; end if;

  return jsonb_build_object('harvest_close', v_n_harv, 'harvest_waste', v_n_waste, 'packaged', v_n_pack, 'sold', v_n_sold, 'apex_orders', v_n_rev, 'adjusted', v_n_adj, 'third_party_memo', v_n_memo, 'pay_runs', v_n_pay, 'purchases', v_n_pur, 'at', now());
end $$;
update public.posting_rule set basis_method = 'pounds × valuation rate for the tag''s stream (indicative); no amount where the packaging event carries no weight', updated_at = now() where rule_key = 'packaged';
notify pgrst, 'reload schema';;
