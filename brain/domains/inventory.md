# Inventory — where each fact lives

*Orientation page. Numbers live in HANDOFF.md §3 and in the live views;
re-measure before quoting anything.*

## The four rules that prevent every past inventory disaster
1. **Convert from the unit Metrc actually recorded** — `f_to_pounds()`, never
   assumption (B1). Pounds once got divided by 453.592.
2. **Countable items have no weight** — vapes and edibles are units;
   `f_is_weight()` decides (B2).
3. **Wet and dry never mix** — fresh frozen is packaged wet; convert to
   dry-equivalent before adding or comparing (B3).
4. **Never subtract dry from wet** — it leaves evaporated water in the total;
   this once overstated open harvests by 3,800 lb (B4).

## The evidence view
`v_stock_proof` — one row per package with the full proof set: tag, cultivar,
stream, source harvest, location and dates, quantity in its own unit, testing
dates and status, THC/terpenes or why absent, certificate, manifest, origin,
valuation rate, traceability sentence. **Every stock and money tile drills to
it. A tile that doesn't is not finished (C1).**

## Canonical wording comes from functions, not prose
- Test status: `f_test_status()` — OUT FOR TESTING / NO TESTING PLANNED YET /
  PASSED / FAILED (C5).
- Potency: `f_potency_status()` — values, or exactly why they are absent (C3).

## Live exceptions (see HANDOFF.md §3 for current counts, all with drills)
- Packages out at the laboratory with no result.
- Packages never submitted for testing.
- **Phantom weight on closed harvests** — moisture loss never entered in
  Metrc; thousands of pounds of paper weight. See `moisture_loss_entries`
  (immutable, H2).
- Ageing: threshold 180 days (stability research; ~16% THC loss at one year).

## Deep dives
- `docs/handoff/DATA_INTEGRITY_2026-08-06.md` — the forensic pass that found
  and fixed the reference-table gaps.
- Valuation of stock: see [money.md](money.md).
