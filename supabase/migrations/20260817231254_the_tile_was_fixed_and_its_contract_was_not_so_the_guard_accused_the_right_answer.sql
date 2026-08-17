/* The tile was fixed and its contract was not, so the guard began accusing the right answer.
 *
 * v_tile_drill_status reported the largest gap on the platform:
 *   Key figure — dried flower on hand        tile 971.8  drill 2070.8  gap -1099.0
 *   Dried flower on hand (panel it opens)    tile 971.8  drill 2070.4  gap -1098.6
 *
 * DERIVED THREE INDEPENDENT WAYS, and all three agree with the TILE:
 *   mv_department_dashboard ord=1                       971.8
 *   v_stock_summary where stream = 'Dried flower'       971.8
 *   v_stock_proof   where stream = 'Dried flower'       971.8
 *
 * The only figure that disagrees is `stream <> 'Fresh frozen'`, which returns 2070.4 —
 * and the stream breakdown says exactly why:
 *   Dried flower 971.8 + Shake and trim 555.1 + Pre-rolls 278.0 + Concentrate 265.9
 *   = 2070.8
 * "Everything that is not fresh frozen" is not dried flower. It is dried flower plus
 * three other product streams.
 *
 * WHAT ACTUALLY HAPPENED. On 13 Aug 2026 Agent V registered these contracts and recorded
 * the opposite reading: tile 2041.3, drill 1030.5, gap 1010.8 — the TILE was wrong then,
 * summing everything not fresh frozen under a dried-flower label, and the note said
 * plainly "the label or the definition has to change". The definition was subsequently
 * changed and the tile is now correct. THE CONTRACT WAS NEVER UPDATED. So the same gap
 * reappeared with its sign reversed, and the guard spent days accusing the one figure in
 * the pair that had been fixed.
 *
 * THIS IS THE DANGEROUS FAILURE MODE OF A GUARD, not a harmless one. A check that
 * reports a correct value as broken is a check people learn to scroll past, and the next
 * one it raises — a real one — goes with it. A stale contract is a defect in the guard,
 * and it is fixed here rather than tolerated.
 *
 * Both contracts now compare like with like. The paired 1b contract is retained because
 * the pairing is genuinely informative: it tests the tile against the panel the page
 * actually opens in place, which is a different question from testing it against the
 * category definition, and both should agree now that the definition is right.
 */

update public.tile_drill_contract
   set drill_sql = 'select round(sum(total_lb),1) from v_stock_summary where stream = ''Dried flower''',
       why_tolerance =
         'Rounding only. CORRECTED 17 Aug 2026. The drill previously read '
         || '`stream <> ''Fresh frozen''`, which sums Dried flower 971.8 + Shake and trim '
         || '555.1 + Pre-rolls 278.0 + Concentrate 265.9 = 2070.8 under a dried-flower '
         || 'label. When Agent V registered this on 13 Aug the TILE held that wrong '
         || 'definition and the drill was right; the tile was then corrected and this '
         || 'contract was not, so the guard inverted and began reporting the CORRECT tile '
         || 'as a 1099 lb defect. Verified three ways at correction: '
         || 'mv_department_dashboard 971.8, v_stock_summary 971.8, v_stock_proof 971.8.',
       registered_by = 'Agent I (corrected 17 Aug 2026)',
       registered_at = now()
 where contract_key = 'cc.stock.dried_lb';

update public.tile_drill_contract
   set drill_sql = 'select round(sum(pounds),1) from v_stock_proof where stream = ''Dried flower''',
       why_tolerance =
         'Rounding only. CORRECTED 17 Aug 2026, paired with cc.stock.dried_lb. Command '
         || 'Center does not navigate away on this tile — it opens v_stock_proof in place. '
         || 'That panel must be filtered to the SAME stream the tile names, or the two are '
         || 'answering different questions and the comparison is meaningless. Previously '
         || 'filtered to everything-not-fresh-frozen, which made a correct 971.8 tile look '
         || '1098.6 lb wrong. v_stock_proof where stream = ''Dried flower'' returns 971.8, '
         || 'matching the tile and v_stock_summary exactly.',
       registered_by = 'Agent I (corrected 17 Aug 2026)',
       registered_at = now()
 where contract_key = 'dash.command.1b.dried_flower_vs_its_real_drill';

/* The duplicate contract on the same tile, whose drill re-derives from metrc_packages by
   category. It classifies Dried flower correctly already; the label on the contract was
   the only thing implying otherwise. Left as-is apart from the note, because an
   independent re-derivation straight from the mirror is worth keeping — it is the only
   one of the three that does not go through v_stock_summary. */
update public.tile_drill_contract
   set why_tolerance =
         'Rounding only. Re-derives from metrc_packages by ProductCategoryName rather than '
         || 'through v_stock_summary, so it is a genuinely INDEPENDENT check and is kept '
         || 'for that reason. Agent V''s 13 Aug note on this row described the tile as '
         || 'holding the wrong definition; that has since been corrected and the tile now '
         || 'reads 971.8, matching this drill. The historical note is preserved above in '
         || 'the migration record rather than here, because a why_tolerance describing a '
         || 'state that no longer exists misleads the next reader.',
       registered_by = 'Agent I (note corrected 17 Aug 2026)'
 where contract_key = 'dash.command.1.dried_flower_on_hand';;
