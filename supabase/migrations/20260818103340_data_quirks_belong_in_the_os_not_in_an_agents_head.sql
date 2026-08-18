/* Data quirks belong in the OS, not in an agent's head.
 *
 * Owner, 18 Aug 2026, on being told why eleven packages were counted twice:
 * "information like this should be noted in OS so users know!"
 *
 * He is right and it is the recurring failure of this platform. Every one of the
 * explanations below was worked out from scratch tonight, by measurement, because it
 * existed nowhere a person could read it. Each one had already cost somebody an hour at
 * some point, and each was about to cost the next person the same hour.
 *
 * A figure that looks wrong and is not is worse than one that is wrong, because the
 * reasonable reaction — challenge it — produces nothing, and the person learns to stop
 * challenging. That is how a real defect later goes unquestioned.
 *
 * These are not page help; section_help already covers "how to read this panel". These
 * are properties of the DATA that survive whichever page you look at it from.
 */

create table if not exists public.data_quirk (
  quirk_key      text primary key,
  headline       text not null,
  what_you_see   text not null,
  why_it_happens text not null,
  is_it_a_defect text not null,
  the_measurement text not null,
  affects        text[] not null default '{}',
  found_on       date not null default current_date,
  found_by       text not null default 'Agent I',
  constraint quirk_actually_explains check (length(btrim(why_it_happens)) >= 60)
);

comment on table public.data_quirk is
  'Properties of the data that look like defects and are not, each with the measurement '
  'that settles it. Written because every one of them was rediscovered from scratch on '
  '18 Aug 2026 having cost somebody an hour before. A figure that looks wrong and is not '
  'is worse than one that is wrong: challenging it produces nothing, and people stop '
  'challenging. Owner instruction. Agent I.';

alter table public.data_quirk enable row level security;
drop policy if exists dq_read on public.data_quirk;
create policy dq_read on public.data_quirk for select to authenticated using (true);
drop policy if exists dq_write on public.data_quirk;
create policy dq_write on public.data_quirk for all to authenticated
  using ((select public.f_caller_is_admin())) with check ((select public.f_caller_is_admin()));
grant select on public.data_quirk to tg_desktop_reader;

insert into public.data_quirk
  (quirk_key, headline, what_you_see, why_it_happens, is_it_a_defect, the_measurement, affects) values

('cross_licence_in_flight',
 'A package moving between our own two licences is recorded on BOTH sides at once',
 'The same tag appears twice — once under MC281714 and once under MP281909 — with the '
 || 'SAME quantity on each. One side reads intransit, the other active. Summed naively, a '
 || '168 g package reports as 336 g.',
 'Metrc opens the receiving record before the sending record closes, so while a transfer '
 || 'is in flight both licences legitimately hold the tag. Metrc is correct. The question '
 || 'is which row is the CURRENT position, and every view that reads packages has to '
 || 'answer it. Five of ours had not.',
 'NO. The data is right. Counting it twice was the defect, fixed 18 Aug 2026 by taking one '
 || 'row per tag: the accepted row wins, then the freshest sync, per the owner ruling that '
 || 'in-transit is ours until the destination accepts.',
 '11 tags affected. 9.5 lb double counted across all streams, 2.4 lb of it dried flower. '
 || 'Package count fell from 1,308 to 1,297 in every stock view.',
 array['v_stock_packages','v_stock_on_hand','v_onhand_by_room_stage','v_stock_headline',
       'v_room_board_complete','24 tile_drill_contract drill queries']),

('grouped_rounding',
 'A tile and its drilldown can differ by a few tenths of a pound and both be right',
 'Totals like 2,489.1 against 2,488.8 — a gap of 0.3 lb that never goes away.',
 'The tile rounds each GROUP and then adds the rounded parts; the drill adds every package '
 || 'and rounds ONCE at the end. Across 73 groups and 1,297 packages the two orders of '
 || 'operation land a few tenths apart. Neither is wrong — they are different arithmetic '
 || 'answering the same question.',
 'NO, up to the tolerance recorded on each contract. It becomes a defect the moment the '
 || 'gap exceeds what rounding can produce, which is why the tolerance is a measured '
 || 'number and not a shrug. Widening a tolerance to silence a real gap is expressly '
 || 'forbidden.',
 'Observed at 0.3 lb on Sellable right now, Total on hand dry-equivalent and Concentrate '
 || 'on hand, against tolerances of 0.2 lb.',
 array['tile_drill_contract.tolerance','v_stock_summary','v_stock_on_hand']),

('import_rerun_double_counts',
 'Importing the same file twice makes the rejected count look higher than the rejections on record',
 'The headline says 959 rejections; the reject log holds 894. It looks like 65 rejections '
 || 'were counted but never explained.',
 'import_run keeps one row per RUN, so a source imported twice contributes its rejections '
 || 'twice to a naive sum. import_rejects keeps one row per rejected ROW, so a re-import of '
 || 'the same file does not create new ones. Solventless was deliberately re-imported on '
 || '12 Aug 2026 as an idempotency test and its 65 rejections were counted in both runs.',
 'NO. Every rejection IS individually recorded — unexplained is zero on all eleven runs. '
 || 'The tile was summing runs instead of taking the latest run per source. Corrected '
 || '18 Aug 2026.',
 'Sum across every run 959. Latest run per source 894. Rejections on record 894. Exactly '
 || 'one source was imported twice.',
 array['import_run','import_rejects','fg.import.rejections_are_all_recorded']),

('fresh_frozen_is_wet',
 'Fresh frozen is held at WET weight and is not comparable to cured product',
 '418.3 lb of fresh frozen sitting beside cured flower in the same total.',
 'Fresh frozen is weighed at field moisture. Adding it to dried product overstates '
 || 'saleable weight by the water. At the owner ruling of 4.5:1 it is 93.0 lb dry '
 || 'equivalent, so a total that includes it raw carries 325.3 lb of water.',
 'NOT a defect in the data, but a defect in any figure that calls itself dry-equivalent '
 || 'while including it raw. Use v_stock_on_hand.pounds_dry_equivalent for those.',
 '418.3 lb wet, 93.0 lb dry at 4.5:1, 325.3 lb of water. Owner ruled the ratio 17 Aug 2026.',
 array['v_stock_on_hand.pounds','v_stock_on_hand.pounds_dry_equivalent','conversion_factors']),

('lab_sample_size_changed',
 'Flower lab samples were 7 g and are now 12 g — both are correct for their period',
 'Sample weights that do not match a single standard.',
 'The size changed when the laboratory changed. 7 g while SafeTiva, ProVerde, MCR and '
 || 'Assured were used to Q1 2025; 12 g from Q3 2025 with Green Valley Analytics. The '
 || 'changeover in Q2 2025 shows both.',
 'NO. A check written against one figure would call half the history wrong. Use '
 || 'lab_sample_flower_g for today and lab_sample_flower_g_historic for anything before '
 || 'Q3 2025.',
 '132 samples at 7 g to Q1 2025, 348 at 12 g from Q3 2025, both present in Q2 2025.',
 array['v_lab_samples_out','conversion_factors']),

('leaving_is_not_selling',
 'Not every pound that leaves is a sale',
 'A "pounds shipped" figure far larger than anything invoiced.',
 'Of 22,795.7 lb that left our licences, 10,190.6 lb were internal moves between our own '
 || 'MC and MP, 990.9 lb were transport legs where the destination is a haulier rather than '
 || 'a buyer, and 18.8 lb were laboratory samples. Only 11,595.4 lb was sold.',
 'NO, but any figure describing revenue or pounds sold must filter on '
 || 'v_forensic_sold_by_tag.counts_as_sale. Two Command Center tiles did not and counted '
 || 'transport legs as unsold shipments until 18 Aug 2026.',
 'Four-way split ties to the total with no remainder. 75 transporter tags also appear on a '
 || 'manifest to the real buyer and were counted twice before this was found.',
 array['v_forensic_sold_by_tag','v_outbound_balance','sales_gap_exclusion']);

/* The contract that started this: the tile summed every run instead of the latest. */
update public.tile_drill_contract
   set tile_sql =
         'select sum(rows_rejected)::numeric from ('
         || 'select distinct on (source_key) source_key, rows_rejected from import_run '
         || 'where source_key like ''manufacturing_product_inventory:%'' '
         || 'order by source_key, started_at desc) latest',
       why_tolerance =
         'Zero. Every rejection must be individually recorded with a reason. CORRECTED '
         || '18 Aug 2026: the tile summed rows_rejected across EVERY run, so a source '
         || 'imported twice was counted twice — Solventless was deliberately re-imported as '
         || 'an idempotency test and contributed its 65 rejections to both runs, giving 959 '
         || 'against 894 on record. It now takes the latest run per source. The rejections '
         || 'were never missing: unexplained is zero on all eleven runs. See '
         || 'data_quirk.import_rerun_double_counts.'
 where contract_key = 'fg.import.rejections_are_all_recorded';;
