-- Owner, 14 Sep 2026: "we have a spreadsheet that breaks down our cost basis — find it and use it." It is
-- docs/source-of-truth/Manufacturing_Production_Worksheet.xlsx, already loaded on 12 Aug as rows: cost_inputs (41
-- owner inputs), manufacturing_cost_figure (23 derived figures), v_cost_of_goods / v_unit_costs. Part B makes the money
-- spine post COST from those rows instead of the valuation rate: cost_basis_rule maps a stream and an item-name pattern
-- to a figure (worksheet) or a factor (conversion_factors — flower $1,100/lb, the owner's 13 Aug ruling); a purchase on
-- file for a tag (material_purchases.package_tag) is the tag's own cost basis first. Six worksheet figures the 12 Aug
-- load did not carry (branded and infused pre-rolls, the live-rosin vape) are added with their cells. Bought-in tags
-- sit in their own inventory account (1320) so the register's stock and the ledger agree. tag_event 'received' rows are
-- our outbound deliveries being accepted — the memo rule is retired. The journal (four hours old, derived, no reader
-- yet) is rebuilt on the cost basis: recorded in audit_events, and from here the journal is on the guard's immutable
-- list. v_pnl_live prints a gross margin once COGS carries a cost basis.
set search_path = public;

-- ── the worksheet figures the first load did not carry (Summary Sheet cells) ─────────────────
insert into public.manufacturing_cost_figure (figure_key, block, label, figure_value, unit, basis, evidence_status, is_owner_editable, includes_tariff, sheet_key, source_key, source_cell_label, as_of, note)
values
 ('preroll.branded_raw.1g.total', 'PreRolls (Branded)', 'Branded raw 1 g pre-roll — cost per unit', 5.39, 'USD/unit', 'Rolling materials + labour 3.20 (59%), packaging 0.33, packaging labour 1.86; flower @ $1,200/lb.', 'derived', false, false, 'manufacturing_production_calculator', 'manufacturing_production_calculator:Summary Sheet', 'Cost Percents (1 g raw preroll) — Total $ (R13)', '2026-09-14', 'Sheet uses flower at $1,200/lb; the owner''s 13 Aug ruling sets flower cost at $1,100/lb. The figure stands as the sheet''s until the sheet is corrected.'),
 ('preroll.branded_infused_ld_30.1g.total', 'PreRolls (Branded)', 'Branded 30% liquid-diamond infused 1 g pre-roll — cost per unit', 8.59, 'USD/unit', 'Rolling materials + labour 6.40, packaging 0.33, packaging labour 1.86; flower @ $1,200/lb.', 'derived', false, false, 'manufacturing_production_calculator', 'manufacturing_production_calculator:Summary Sheet', 'Cost Percents (1 g 30% LD Infused preroll) — Total $ (U13)', '2026-09-14', null),
 ('preroll.branded_infused_md_30.1g.total', 'PreRolls (Branded)', 'Branded 30% micro-diamond infused 1 g pre-roll — cost per unit', 7.80, 'USD/unit', 'Rolling materials + labour 5.61, packaging 0.33, packaging labour 1.86; flower @ $1,200/lb.', 'derived', false, false, 'manufacturing_production_calculator', 'manufacturing_production_calculator:Summary Sheet', 'Cost Percents (1 g 30% M.D Infused preroll) — Total $ (X13)', '2026-09-14', null),
 ('preroll.economy_infused_ld_30.1g.total', 'Liquid Diamond Economy', 'Economy 30% liquid-diamond infused 1 g pre-roll — cost per unit', 5.31, 'USD/unit', '50/50 flower @ $1,200/lb, trim @ $300/lb; rolling 2.05, infusion 3.08, packaging 0.11, packaging labour 0.08.', 'derived', false, false, 'manufacturing_production_calculator', 'manufacturing_production_calculator:Summary Sheet', 'Cost Percents (1 g 30% LD Infused preroll) economy — Total $ (S37)', '2026-09-14', null),
 ('preroll.economy_infused_md_30.1g.total', 'Micro Diamond Economy', 'Economy 30% micro-diamond infused 1 g pre-roll — cost per unit', 4.73, 'USD/unit', '50/50 flower @ $1,200/lb, trim @ $300/lb; rolling 2.05, infusion 2.50, packaging 0.11, packaging labour 0.08.', 'derived', false, false, 'manufacturing_production_calculator', 'manufacturing_production_calculator:Summary Sheet', 'Cost Percents (1 g 30% M.D Infused preroll) economy — Total $ (W37)', '2026-09-14', null),
 ('vape.live_rosin.1_0g.total', 'Live Rosin Vaporizers', 'Live rosin 0.5 g vaporizer — cost per unit', 11.78, 'USD/unit', 'Base oil 8.04 (rosin at fresh frozen $909.93/lb), hardware 1.75, packaging 1.04, fill 0.05, package 0.57, compliance 0.34.', 'derived', false, false, 'manufacturing_production_calculator', 'manufacturing_production_calculator:Summary Sheet', 'Liquid Diamonds Vape Cost Summary (live rosin) — Total (G47)', '2026-09-14', null)
on conflict (figure_key) do nothing;

-- ── which figure prices which item: rows, not code ───────────────────────────────────────────
create table if not exists public.cost_basis_rule (
  id bigint generated always as identity primary key,
  stream text not null, item_pattern text, source text not null check (source in ('figure', 'factor')), key text not null,
  per text not null check (per in ('lb', 'g', 'unit')), priority int not null default 50, indicative boolean not null default false, active boolean not null default true, note text,
  updated_at timestamptz not null default now()
);
comment on table public.cost_basis_rule is 'BP-6 the cost basis map: for a stream and an item-name pattern (regex, case-insensitive, null = any), which manufacturing_cost_figure (source figure) or conversion_factors rule (source factor) prices it, and per what (lb / g / unit). First active match by priority wins. A purchase on file for the tag (material_purchases.package_tag) always wins first.';
alter table public.cost_basis_rule enable row level security;
drop policy if exists cost_basis_rule_read on public.cost_basis_rule; create policy cost_basis_rule_read on public.cost_basis_rule for select to authenticated using (true);
drop policy if exists cost_basis_rule_admin on public.cost_basis_rule; create policy cost_basis_rule_admin on public.cost_basis_rule for all to authenticated using (public.f_caller_is_admin()) with check (public.f_caller_is_admin());
grant select, insert, update on public.cost_basis_rule to authenticated;
insert into public.cost_basis_rule (stream, item_pattern, source, key, per, priority, indicative, note)
select * from (values
 ('Dried flower', null, 'factor', 'target_cost_per_lb', 'lb', 10, false, 'Owner ruling 13 Aug 2026: $1,100 to produce a saleable pound.'),
 ('Shake and trim', null, 'figure', 'moisture.target_trim_price_dry', 'lb', 10, false, 'Worksheet: trim $300/lb.'),
 ('Fresh frozen', null, 'figure', 'moisture.fresh_frozen_price', 'lb', 10, false, 'Worksheet: cost-allocated dry price × 0.2 = $161.25/lb (valuation_rates holds $119.77 from the Rosin tab''s $741 target — a second figure for the same thing; this rule uses the Summary sheet).'),
 ('Concentrate', 'liquid diamond|liquid shatter|vape oil|distillate|terpene', 'figure', 'concentrate.liquid_diamonds.per_gram', 'g', 10, false, null),
 ('Concentrate', 'rosin', 'figure', 'concentrate.rosin.per_gram', 'g', 11, false, null),
 ('Concentrate', 'bubble|hash', 'figure', 'concentrate.bubble_hash.per_gram', 'g', 12, false, null),
 ('Concentrate', 'diamond', 'figure', 'concentrate.diamonds.per_gram', 'g', 13, false, null),
 ('Concentrate', 'crude', 'figure', 'concentrate.crude.per_gram', 'g', 14, false, null),
 ('Concentrate', 'badder|budder', 'figure', 'badder.hydrocarbon_cured.1_0g.total', 'unit', 15, false, 'Cured badder 1 g unit, packaged.'),
 ('Concentrate', null, 'figure', 'concentrate.liquid_diamonds.per_gram', 'g', 90, true, 'No product word in the item name — liquid diamonds assumed; indicative.'),
 ('Vape', '0\.?5 ?g|half', 'figure', 'vape.liquid_diamond.0_5g.total', 'unit', 10, false, null),
 ('Vape', 'rosin', 'figure', 'vape.live_rosin.1_0g.total', 'unit', 11, false, null),
 ('Vape', 'cured', 'figure', 'vape.cured_resin.1_0g.total', 'unit', 12, false, null),
 ('Vape', null, 'figure', 'vape.liquid_diamond.1_0g.total', 'unit', 90, false, '1.0 g liquid-diamond cartridge unless the name says otherwise.'),
 ('Pre-rolls', 'nobrand.*infus|infus.*nobrand|economy', 'figure', 'preroll.economy_infused_ld_30.1g.total', 'g', 10, false, 'Economy infused, per 1 g pre-roll.'),
 ('Pre-rolls', 'micro.*infus|infus.*micro', 'figure', 'preroll.branded_infused_md_30.1g.total', 'g', 11, false, null),
 ('Pre-rolls', 'infus', 'figure', 'preroll.branded_infused_ld_30.1g.total', 'g', 12, false, null),
 ('Pre-rolls', 'nobrand', 'figure', 'preroll.50_50.cost_to_produce', 'g', 20, false, 'Unbranded raw 50/50, per 1 g pre-roll.'),
 ('Pre-rolls', null, 'figure', 'preroll.branded_raw.1g.total', 'g', 90, false, 'Branded raw, per 1 g pre-roll.')
) as v(stream, item_pattern, source, key, per, priority, indicative, note)
where not exists (select 1 from public.cost_basis_rule);

-- ── one definition of "what did this cost" ───────────────────────────────────────────────────
create or replace function public.f_cost_basis(p_tag text, p_stream text, p_item text, p_qty numeric, p_uom text)
returns table (amount numeric, cost_per_lb numeric, basis text, indicative boolean, source text)
language plpgsql stable as $$
declare v_lb numeric := public.f_to_pounds(p_qty, p_uom); v_g numeric; v_gpl numeric := coalesce(public.f_rule('grams_per_pound'), 453.59237); r record; v_val numeric; v_pp numeric; v_pq numeric; v_puom text; v_plb numeric; v_countable boolean;
begin
  v_countable := v_lb is null and lower(coalesce(p_uom, '')) in ('ea', 'each', 'units', 'unit');
  v_g := case when v_lb is not null then v_lb * v_gpl end;
  -- 1 · a purchase on file for this very tag: its own price, pro-rated by quantity
  select mp.unit_cost * mp.purchased_qty + coalesce(mp.freight, 0) + coalesce(mp.other_landed_cost, 0), mp.purchased_qty, mp.uom
    into v_pp, v_pq, v_puom
    from public.material_purchases mp where mp.package_tag = p_tag and mp.unit_cost is not null and coalesce(mp.purchased_qty, 0) > 0
   order by mp.purchase_date desc nulls last limit 1;
  if found then
    v_plb := public.f_to_pounds(v_pq, v_puom);
    amount := case when v_plb > 0 and v_lb is not null then round(v_pp * v_lb / v_plb, 2)
                   when v_countable and v_pq > 0 then round(v_pp * p_qty / v_pq, 2) else round(v_pp, 2) end;
    cost_per_lb := case when v_plb > 0 then round(v_pp / v_plb, 2) end;
    basis := 'purchase on file for ' || p_tag || ' ($' || round(v_pp, 2) || ' for ' || v_pq || ' ' || coalesce(v_puom, '') || ', material_purchases), pro-rated'; indicative := false; source := 'purchase';
    return next; return;
  end if;
  -- 2 · the cost-basis rules (rows): first active match by priority
  for r in select c.* from public.cost_basis_rule c where c.active and c.stream = p_stream and (c.item_pattern is null or coalesce(p_item, '') ~* c.item_pattern) order by c.priority, c.id loop
    v_val := case r.source when 'figure' then (select f.figure_value from public.manufacturing_cost_figure f where f.figure_key = r.key) else public.f_rule(r.key) end;
    if v_val is null then continue; end if;
    amount := case r.per
                when 'lb' then case when v_lb is not null then round(v_lb * v_val, 2) end
                when 'g' then case when v_g is not null then round(v_g * v_val, 2) when v_countable then round(p_qty * v_val, 2) end
                when 'unit' then case when v_countable then round(p_qty * v_val, 2) when v_g is not null then round(v_g * v_val, 2) end end;
    if amount is null then continue; end if;
    cost_per_lb := case r.per when 'lb' then v_val when 'g' then round(v_val * v_gpl, 2) else null end;
    basis := case r.per when 'lb' then round(v_lb, 3) || ' lb' when 'g' then coalesce(round(v_g, 1)::text, p_qty::text) || ' g' else coalesce(case when v_countable then p_qty end, round(v_g, 1))::text || ' units' end
             || ' × $' || v_val || '/' || r.per || ' (' || case r.source when 'figure' then 'worksheet figure ' else 'rule ' end || r.key || case when r.item_pattern is not null then ', item ~ ' || r.item_pattern else '' end || ')' || coalesce(' — ' || r.note, '');
    indicative := r.indicative; source := r.source || ':' || r.key;
    return next; return;
  end loop;
  return;
end $$;
revoke all on function public.f_cost_basis(text, text, text, numeric, text) from public, anon;
grant execute on function public.f_cost_basis(text, text, text, numeric, text) to authenticated;

-- ── accounts and rules ───────────────────────────────────────────────────────────────────────
insert into public.gl_account (code, name, kind, normal_side, role, note) values ('1320', 'Inventory — bought-in (for resale / processing)', 'asset', 'D', 'inventory', 'Owner ruling 14 Sep 2026: material bought from another licence, turned around in 30–45 days. Debited at purchase, credited at sale / consumption at its own purchase price.') on conflict (code) do nothing;
update public.posting_rule set active = false, note = 'RETIRED 14 Sep 2026: tag_event ''received'' rows are OUR outbound deliveries being accepted by the counterparty, not material we bought. Nothing to post. Bought-in material posts through purchase_bought_in / sold_cogs_bought_in.' where rule_key = 'third_party_memo';
update public.posting_rule set basis_method = 'cost basis rows (f_cost_basis): the tag''s purchase on file, else the worksheet figure / owner rule for its stream and item; no amount where no basis exists', updated_at = now() where rule_key in ('sold_cogs', 'packaged', 'adjusted_loss');
insert into public.posting_rule (rule_key, event_kind, debit_code, credit_code, grain, basis_method, source_table, active, note) values
 ('sold_cogs_bought_in', 'sold', '5000', '1320', 'tag · manifest · counterparty licence', 'the tag''s purchase on file (material_purchases.package_tag), else the stream''s cost basis, indicative', 'tag_event', true, 'Owner ruling 14 Sep 2026: bought-in material is inventory we turn around; its sale relieves the bought-in account.'),
 ('purchase_bought_in', 'purchase', '1320', '2000', 'purchase · package tag', 'unit cost × quantity + freight + other landed cost (material_purchases with a package_tag)', 'material_purchases', true, 'A purchase entered with its Metrc package tag is the tag''s cost basis.')
on conflict (rule_key) do nothing;

-- ── the engine, on the cost basis ────────────────────────────────────────────────────────────
create or replace function public.f_post_journals(p_limit int default 5000) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ff numeric; v_n_harv int := 0; v_n_waste int := 0; v_n_pack int := 0; v_n_sold int := 0; v_n_rev int := 0; v_n_adj int := 0; v_n_pay int := 0; v_n_pur int := 0; v_n_rep int := 0;
        r record; cb record; v_j bigint; v_amt numeric; v_d text; v_c text; v_d2 text; v_c2 text; v_rule text; v_bought boolean;
begin
  if not pg_try_advisory_xact_lock(hashtext('journal-post')) then return jsonb_build_object('skipped', true, 'why', 'another posting run holds the lock', 'at', now()); end if;
  -- 1 · harvest closed: wet weight at close → Inventory wet / WIP at the fresh-frozen cost basis; waste → Loss
  select debit_code, credit_code into v_d, v_c from public.posting_rule where rule_key = 'harvest_close' and active;
  if found then for r in select h.id, h.license, h.name, h.harvest_start, h.wet_weight, h.waste_weight, h.flower_room, h.raw->>'StrainName' strain, public.f_to_pounds(h.wet_weight, 'g') wet_lb, public.f_to_pounds(h.waste_weight, 'g') waste_lb
             from public.metrc_harvests h
            where h.harvest_start is not null and not exists (select 1 from public.journal j where j.source_table = 'metrc_harvests' and j.source_id = h.id::text and j.event_kind = 'harvest_close')
            order by h.harvest_start limit p_limit loop
    select * into cb from public.f_cost_basis(null, 'Fresh frozen', null, r.wet_weight, 'g');
    v_amt := cb.amount; v_j := null;
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, tag, dims, amount, qty_lb, basis_method, indicative, gap_reason, memo)
    values (r.license, 'harvest_close', 'harvest_close', r.harvest_start::timestamptz, 'metrc_harvests', r.id::text, null, jsonb_build_object('harvest', r.name, 'room', r.flower_room, 'strain', r.strain), v_amt, r.wet_lb,
            coalesce(cb.basis, 'no cost basis for fresh frozen'), coalesce(cb.indicative, true), case when v_amt is null then 'no cost basis: ' || case when r.wet_lb is null then 'no wet weight on the Metrc harvest' else 'no rule for Fresh frozen' end end, 'Harvest ' || r.name || ' closed')
    on conflict do nothing returning id into v_j;
    if v_j is null then continue; end if;
    if v_amt is not null then insert into public.journal_line (journal_id, account_code, side, amount, qty_lb, dims) values (v_j, v_d, 'D', v_amt, r.wet_lb, jsonb_build_object('harvest', r.name, 'room', r.flower_room)), (v_j, v_c, 'C', v_amt, r.wet_lb, jsonb_build_object('harvest', r.name, 'room', r.flower_room)); end if;
    v_n_harv := v_n_harv + 1;
    if coalesce(r.waste_lb, 0) > 0 and exists (select 1 from public.posting_rule where rule_key = 'harvest_waste' and active) then
      select * into cb from public.f_cost_basis(null, 'Fresh frozen', null, r.waste_weight, 'g');
      v_amt := cb.amount; v_j := null;
      insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, dims, amount, qty_lb, basis_method, indicative, gap_reason, memo)
      values (r.license, 'harvest_waste', 'harvest_waste', r.harvest_start::timestamptz, 'metrc_harvests', r.id::text, jsonb_build_object('harvest', r.name, 'room', r.flower_room), v_amt, r.waste_lb, coalesce(cb.basis, 'no cost basis'), coalesce(cb.indicative, true), case when v_amt is null then 'no cost basis for Fresh frozen' end, 'Waste at harvest ' || r.name)
      on conflict do nothing returning id into v_j;
      if v_j is not null and v_amt is not null then insert into public.journal_line (journal_id, account_code, side, amount, qty_lb) select v_j, debit_code, 'D', v_amt, r.waste_lb from public.posting_rule where rule_key = 'harvest_waste' union all select v_j, credit_code, 'C', v_amt, r.waste_lb from public.posting_rule where rule_key = 'harvest_waste'; v_n_waste := v_n_waste + 1; end if;
    end if;
  end loop; end if;

  -- 2 · packaged: Inventory FG / Inventory bulk at the cost basis
  select debit_code, credit_code into v_d, v_c from public.posting_rule where rule_key = 'packaged' and active;
  if found then for r in select e.id, e.tag, e.event_at, e.qty, e.uom, public.f_to_pounds(e.qty, e.uom) lb, p.license, public.f_tag_stream(e.tag) stream, coalesce(p.item_name, (select t.item from public.metrc_rpt_package_transfers t where t.package_tag = e.tag limit 1)) item, p.raw #>> '{Item,ProductCategoryName}' category, p.raw #>> '{Item,StrainName}' strain
             from public.tag_event e
             left join lateral (select * from public.metrc_packages m where m.tag = e.tag order by m.synced_at desc nulls last limit 1) p on true
            where e.event_type = 'packaged' and not exists (select 1 from public.journal j where j.source_table = 'tag_event' and j.source_id = e.id::text and j.event_kind = 'packaged')
            order by e.event_at limit p_limit loop
    select * into cb from public.f_cost_basis(r.tag, r.stream, r.item, r.qty, r.uom);
    v_amt := case when coalesce(r.qty, 0) <= 0 then null else cb.amount end; v_j := null;
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, tag, dims, amount, qty_lb, basis_method, indicative, gap_reason, memo)
    values (coalesce(r.license, 'unknown'), 'packaged', 'packaged', r.event_at, 'tag_event', r.id::text, r.tag, jsonb_build_object('stream', r.stream, 'category', r.category, 'strain', r.strain, 'item', r.item, 'cost_source', cb.source), v_amt, r.lb,
            coalesce(cb.basis, 'no cost basis'), coalesce(cb.indicative, true),
            case when coalesce(r.qty, 0) <= 0 then 'no weight on the packaging event (zero quantity)' when cb.amount is null then 'no cost basis for ' || coalesce(r.stream, '?') || coalesce(' / ' || r.item, '') end, 'Packaged ' || r.tag)
    on conflict do nothing returning id into v_j;
    if v_j is null then continue; end if;
    if v_amt is not null then insert into public.journal_line (journal_id, account_code, side, amount, qty_lb, tag, dims) values (v_j, v_d, 'D', v_amt, r.lb, r.tag, jsonb_build_object('stream', r.stream)), (v_j, v_c, 'C', v_amt, r.lb, r.tag, jsonb_build_object('stream', r.stream)); end if;
    v_n_pack := v_n_pack + 1;
  end loop; end if;

  -- 3 · sold: COGS at the cost basis; a bought-in tag relieves the bought-in account
  select debit_code, credit_code into v_d, v_c from public.posting_rule where rule_key = 'sold_cogs' and active;
  select debit_code, credit_code into v_d2, v_c2 from public.posting_rule where rule_key = 'sold_cogs_bought_in' and active;
  if v_d is not null then for r in select e.id, e.tag, e.event_at, e.qty, e.uom, e.manifest_number, e.counterparty_licence, public.f_to_pounds(e.qty, e.uom) lb, p.license, public.f_tag_stream(e.tag) stream, coalesce(p.item_name, (select t.item from public.metrc_rpt_package_transfers t where t.package_tag = e.tag limit 1)) item, p.raw #>> '{Item,StrainName}' strain,
                    exists (select 1 from public.v_bought_in_register b where b.package_tag = e.tag) bought_in
             from public.tag_event e
             left join lateral (select * from public.metrc_packages m where m.tag = e.tag order by m.synced_at desc nulls last limit 1) p on true
            where e.event_type = 'sold' and not exists (select 1 from public.journal j where j.source_table = 'tag_event' and j.source_id = e.id::text and j.event_kind = 'sold')
            order by e.event_at limit p_limit loop
    select * into cb from public.f_cost_basis(r.tag, r.stream, r.item, r.qty, r.uom);
    v_amt := case when coalesce(r.qty, 0) <= 0 then null else cb.amount end; v_j := null;
    v_rule := case when r.bought_in and v_d2 is not null then 'sold_cogs_bought_in' else 'sold_cogs' end;
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, tag, dims, amount, qty_lb, basis_method, indicative, gap_reason, memo)
    values (coalesce(r.license, 'unknown'), 'sold', v_rule, r.event_at, 'tag_event', r.id::text, r.tag, jsonb_build_object('stream', r.stream, 'strain', r.strain, 'item', r.item, 'manifest', r.manifest_number, 'counterparty_licence', r.counterparty_licence, 'bought_in', r.bought_in, 'cost_source', cb.source),
            v_amt, r.lb, coalesce(cb.basis, 'no cost basis'), coalesce(cb.indicative, true),
            case when coalesce(r.qty, 0) <= 0 then 'no quantity on the sale event' when cb.amount is null then 'no cost basis for ' || coalesce(r.stream, '?') || coalesce(' / ' || r.item, '') end, 'Sold ' || r.tag || coalesce(' on manifest ' || r.manifest_number, ''))
    on conflict do nothing returning id into v_j;
    if v_j is null then continue; end if;
    if v_amt is not null then
      insert into public.journal_line (journal_id, account_code, side, amount, qty_lb, tag, dims)
      values (v_j, case when v_rule = 'sold_cogs_bought_in' then v_d2 else v_d end, 'D', v_amt, r.lb, r.tag, jsonb_build_object('manifest', r.manifest_number, 'stream', r.stream)),
             (v_j, case when v_rule = 'sold_cogs_bought_in' then v_c2 else v_c end, 'C', v_amt, r.lb, r.tag, jsonb_build_object('manifest', r.manifest_number, 'stream', r.stream));
    end if;
    v_n_sold := v_n_sold + 1;
  end loop; end if;

  -- 4 · revenue at order grain: Apex MATCHED orders → AR / Revenue; every other link status is a gap row
  select debit_code, credit_code into v_d, v_c from public.posting_rule where rule_key = 'sold_revenue' and active;
  if found then for r in select t.apex_order_id, t.order_date, t.invoice_number, t.buyer_state_license, t.recognized_total_usd, t.invoice_total_usd, t.link_status, t.cancelled, t.matched_package_tags
             from public.v_apex_invoice_truth t
            where t.apex_order_id is not null and not coalesce(t.cancelled, false)
              and not exists (select 1 from public.journal j where j.source_table = 'v_apex_invoice_truth' and j.source_id = t.apex_order_id and j.event_kind = 'apex_order')
            order by t.order_date limit p_limit loop
    v_amt := case when r.link_status = 'MATCHED' then r.recognized_total_usd else null end; v_j := null;
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

  -- 5 · negative adjustments: Loss / Inventory at the cost basis
  select debit_code, credit_code into v_d, v_c from public.posting_rule where rule_key = 'adjusted_loss' and active;
  if found then for r in select e.id, e.tag, e.event_at, e.qty, e.uom, public.f_to_pounds(abs(e.qty), e.uom) lb, p.license, public.f_tag_stream(e.tag) stream, coalesce(p.item_name, (select t.item from public.metrc_rpt_package_transfers t where t.package_tag = e.tag limit 1)) item, e.source_row,
                    exists (select 1 from public.v_bought_in_register b where b.package_tag = e.tag) bought_in
             from public.tag_event e
             left join lateral (select * from public.metrc_packages m where m.tag = e.tag order by m.synced_at desc nulls last limit 1) p on true
            where e.event_type = 'adjusted' and e.qty < 0 and not exists (select 1 from public.journal j where j.source_table = 'tag_event' and j.source_id = e.id::text and j.event_kind = 'adjusted')
            order by e.event_at limit p_limit loop
    select * into cb from public.f_cost_basis(r.tag, r.stream, r.item, abs(r.qty), r.uom);
    v_amt := cb.amount; v_j := null;
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, tag, dims, amount, qty_lb, basis_method, indicative, gap_reason, memo)
    values (coalesce(r.license, 'unknown'), 'adjusted', 'adjusted_loss', r.event_at, 'tag_event', r.id::text, r.tag, jsonb_build_object('stream', r.stream, 'item', r.item, 'adjustment', r.source_row, 'bought_in', r.bought_in, 'cost_source', cb.source), v_amt, r.lb,
            coalesce(cb.basis, 'no cost basis'), coalesce(cb.indicative, true), case when cb.amount is null then 'no cost basis for ' || coalesce(r.stream, '?') || coalesce(' / ' || r.item, '') end, 'Negative adjustment on ' || r.tag)
    on conflict do nothing returning id into v_j;
    if v_j is null then continue; end if;
    if v_amt is not null then insert into public.journal_line (journal_id, account_code, side, amount, qty_lb, tag) values (v_j, v_d, 'D', v_amt, r.lb, r.tag), (v_j, case when r.bought_in then coalesce(v_c2, v_c) else v_c end, 'C', v_amt, r.lb, r.tag); end if;
    v_n_adj := v_n_adj + 1;
  end loop; end if;

  -- 7 · payroll: the HR lane's payroll journal, per pay run when it exists
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

  -- 8 · purchases: with a package tag → bought-in inventory / AP; without → supplies / AP
  select debit_code, credit_code into v_d, v_c from public.posting_rule where rule_key = 'purchase_received' and active;
  select debit_code, credit_code into v_d2, v_c2 from public.posting_rule where rule_key = 'purchase_bought_in' and active;
  if v_d is not null or v_d2 is not null then for r in select m.id, m.received_date, m.purchase_date, m.supplier, m.supplier_licence, m.material_type, m.purchased_qty, m.uom, m.unit_cost, m.freight, m.other_landed_cost, m.lot_code, m.package_tag, m.manifest_number
             from public.material_purchases m
            where coalesce(m.received_date, m.purchase_date) is not null
              and not exists (select 1 from public.journal j where j.source_table = 'material_purchases' and j.source_id = m.id::text and j.event_kind = 'purchase')
            order by coalesce(m.received_date, m.purchase_date) limit p_limit loop
    v_amt := case when r.unit_cost is null or r.purchased_qty is null then null else round(r.unit_cost * r.purchased_qty + coalesce(r.freight, 0) + coalesce(r.other_landed_cost, 0), 2) end; v_j := null;
    v_rule := case when r.package_tag is not null and v_d2 is not null then 'purchase_bought_in' when v_d is not null then 'purchase_received' else null end;
    if v_rule is null then continue; end if;
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, tag, dims, amount, qty_lb, basis_method, indicative, gap_reason, memo)
    values ('MP281909', 'purchase', v_rule, coalesce(r.received_date, r.purchase_date)::timestamptz, 'material_purchases', r.id::text, r.package_tag,
            jsonb_build_object('supplier', r.supplier, 'supplier_licence', r.supplier_licence, 'material', r.material_type, 'lot', r.lot_code, 'manifest', r.manifest_number, 'qty', r.purchased_qty, 'uom', r.uom), v_amt, public.f_to_pounds(r.purchased_qty, r.uom),
            'unit cost × quantity + freight + other landed cost (material_purchases)', false, case when v_amt is null then 'no unit cost or quantity on the purchase' end, 'Purchase from ' || coalesce(r.supplier, '?') || coalesce(' — ' || r.package_tag, ''))
    on conflict do nothing returning id into v_j;
    if v_j is null then continue; end if;
    if v_amt is not null then insert into public.journal_line (journal_id, account_code, side, amount, qty_lb, tag, dims) values (v_j, case when v_rule = 'purchase_bought_in' then v_d2 else v_d end, 'D', v_amt, public.f_to_pounds(r.purchased_qty, r.uom), r.package_tag, jsonb_build_object('supplier', r.supplier)), (v_j, case when v_rule = 'purchase_bought_in' then v_c2 else v_c end, 'C', v_amt, null, r.package_tag, jsonb_build_object('supplier', r.supplier)); end if;
    v_n_pur := v_n_pur + 1;
  end loop; end if;

  -- 9 · reprice: an earlier posting with no cost basis whose basis now exists (a purchase entered, a rule added) gets ONE correcting journal
  for r in select j.id, j.tag, j.book, j.event_kind, j.rule_key, j.event_at, j.qty_lb, j.dims, j.source_id
             from public.journal j
            where j.event_kind in ('sold', 'packaged', 'adjusted') and j.amount is null and j.gap_reason like 'no cost basis%'
              and not exists (select 1 from public.journal x where x.source_table = 'journal' and x.source_id = j.id::text and x.event_kind = 'reprice')
            order by j.event_at limit p_limit loop
    select e.qty, e.uom into v_amt, v_rule from public.tag_event e where e.id = r.source_id::bigint;   -- v_amt holds qty, v_rule the uom for a moment
    select * into cb from public.f_cost_basis(r.tag, r.dims->>'stream', r.dims->>'item', abs(v_amt), v_rule);
    if cb.amount is null or cb.amount <= 0 then continue; end if;
    select debit_code, credit_code into v_d, v_c from public.posting_rule where rule_key = r.rule_key and active;
    if not found then continue; end if;
    v_j := null;
    insert into public.journal (book, event_kind, rule_key, event_at, source_table, source_id, tag, dims, amount, qty_lb, basis_method, indicative, memo)
    values (r.book, 'reprice', r.rule_key, r.event_at, 'journal', r.id::text, r.tag, r.dims || jsonb_build_object('reprices_journal', r.id, 'cost_source', cb.source), cb.amount, r.qty_lb, 'repriced: ' || cb.basis, cb.indicative, 'Reprice of journal ' || r.id || ' (' || r.event_kind || ' ' || coalesce(r.tag, '') || ')')
    on conflict do nothing returning id into v_j;
    if v_j is null then continue; end if;
    insert into public.journal_line (journal_id, account_code, side, amount, qty_lb, tag, dims) values (v_j, v_d, 'D', cb.amount, r.qty_lb, r.tag, jsonb_build_object('stream', r.dims->>'stream')), (v_j, v_c, 'C', cb.amount, r.qty_lb, r.tag, jsonb_build_object('stream', r.dims->>'stream'));
    v_n_rep := v_n_rep + 1;
  end loop;

  return jsonb_build_object('harvest_close', v_n_harv, 'harvest_waste', v_n_waste, 'packaged', v_n_pack, 'sold', v_n_sold, 'apex_orders', v_n_rev, 'adjusted', v_n_adj, 'pay_runs', v_n_pay, 'purchases', v_n_pur, 'repriced', v_n_rep, 'at', now());
end $$;

-- ── the P&L prints a margin once COGS carries a cost basis ───────────────────────────────────
create or replace view public.v_pnl_live as
with m as (
  select j.book, date_trunc('month', j.event_at)::date as month, a.kind, a.role, l.side, l.amount, j.indicative
    from public.journal_line l join public.journal j on j.id = l.journal_id join public.gl_account a on a.code = l.account_code),
b as (select exists (select 1 from public.journal j where j.rule_key in ('sold_cogs', 'sold_cogs_bought_in') and j.amount is not null and not j.indicative) as has_cost_basis)
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
            then 'Revenue: Apex recognized totals of MATCHED orders (certified, order grain). COGS: the cost basis — the tag''s purchase on file, else the Manufacturing Production Worksheet figure / owner rule for its stream and item (cost_basis_rule). Expenses: loss at the cost basis; labour and overhead when pay runs and overhead post. Operating result therefore overstates until they do.'
            else 'Revenue: Apex recognized totals of MATCHED orders (certified, order grain). No cost basis has posted yet, so gross_margin and operating_result are NULL. See v_spine_coverage.' end as how_to_read_it
  from m group by book, month;
grant select on public.v_pnl_live to authenticated;

-- ── rebuild the journal on the cost basis (derived, four hours old, no reader) — recorded, then immutable ──
drop trigger if exists journal_line_immutable on public.journal_line;
drop trigger if exists journal_immutable on public.journal;
insert into public.audit_events (actor, actor_name, entity, entity_id, action, old_value, new_value, reason)
select null, 'Claude (Agent I)', 'journal', 'all', 'journal.rebuild', jsonb_build_object('journals', (select count(*) from public.journal), 'lines', (select count(*) from public.journal_line), 'basis', 'valuation rate (v1, 14 Sep 16:58–18:00 UTC)'), jsonb_build_object('basis', 'cost basis rows (worksheet figures, owner rules, purchases on file)'),
       'Owner, 14 Sep 2026: use the cost-basis spreadsheet. The v1 journal priced COGS and inventory at the VALUATION rate; it is derived from tag_event / metrc_harvests / Apex and nothing had read it. Rebuilt on the cost basis; append-only from here (guard list).';
truncate table public.journal_line, public.journal restart identity;
create trigger journal_immutable before update or delete on public.journal for each row execute function public.journal_immutable();
create trigger journal_line_immutable before update or delete on public.journal_line for each row execute function public.journal_line_immutable();

-- pages for the two rules tables
insert into public.nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, surface, page_kind, subcategory, module, archetype)
values ('Finance', 0, 'Cost basis rules', 77, 'list', 'cost_basis_rules', 'cost_basis_rule', 'Which worksheet figure or owner rule prices which stream and item for the money spine (first active match by priority; a purchase on file for the tag always wins). Edit here with a reason. Bible §6.', true, true, 'deep', 'report', 'Cost & Margin', 'finance', 'data_browser')
on conflict (view_key) do update set label = excluded.label, description = excluded.description, table_ref = excluded.table_ref, enabled = true, module = 'finance', archetype = excluded.archetype;
notify pgrst, 'reload schema';;
