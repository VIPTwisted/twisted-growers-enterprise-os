# Money Grain Quarantine — 19 August 2026

## Outcome

The published **Sold and Shipped, by Tag** report no longer exposes an invoice
total on every tag line and no longer registers invoice money as a summable
measure. Its safe source contains 16,086 custody lines and **zero** populated
dollar values.

Apex remains the sales source of truth. Metrc remains custody evidence. The two
are reconciled but never added together.

## What was wrong

`v_forensic_sold_by_tag` is line grain. It repeated a whole invoice or manifest
total beneath every tag on that document. On the live population immediately
before this release:

- summing the repeated tag-line `total_usd` produced $43,850,865.77;
- taking that same population once per invoice produced $3,302,855.05;
- taking it once per manifest produced $3,877,714.94.

Those last two numbers describe different linked subsets and must not be added.
Neither is the company-wide sales total.

## Sources now exposed

- `v_apex_invoice_truth`: one row per Apex order. Its additive measure is
  `recognized_total_usd`, which excludes cancelled orders.
- `v_metrc_manifest_invoice_truth`: one row per Metrc manifest, linked to Apex
  only by the normalized invoice number recorded in both systems. Invoice money
  is named `invoice_total_usd_non_additive` and is not a registered measure.
- `v_forensic_sold_by_tag_safe`: tag-line custody and pounds. Dollar columns are
  deliberately null. `payment_status` is also refused at this grain, and invoice
  identity is replaced by the exact normalized invoice-number bridge rather than
  retaining the legacy mixed match. The report registry points here.

## Control totals and limits

The live one-row-per-Apex-order control is $6,360,187.52 across stored history
and $3,476,844.38 for 2026 year-to-date. Those are Apex mirror controls, not a
completed GL reconciliation. The newest stored Apex order is 8 August 2026 and
the mirror was last fetched 10 August, so this release does not label the
figures current.

The migration refused to commit unless:

- the safe tag-line view contained zero populated dollar values;
- the tag report registered zero invoice-money measures; and
- the new invoice truth total exactly matched the non-cancelled Apex control.

## Still open

- The older `v_forensic_sold_by_tag` remains for dependent custody objects and is
  explicitly commented as legacy/non-additive. Rewriting its dependencies is a
  separate release.
- The enabled `forensic_sold_by_tag` menu entry also points to
  `v_forensic_sold_by_tag_safe`. The report registry and navigation registry are
  separate publication roads; both must be quarantined and the money-grain gate
  now fails if either road returns to the line-grain money object. The hotfix
  migration and its exact filename are digest-locked after independent review.
  The complete migration tree—filenames plus normalized contents—is also sealed,
  so renamed, backdated, changed, or extra migrations stop until the full manifest
  receives independent review. The gate never guesses whether SQL text is safe.
- `v_tag_lifecycle` still uses the old proximity match for its stage-five invoice.
  That is not accepted as verified identity and will be replaced by the exact
  invoice-number bridge in the next identity slice.
- Apex freshness and Apex-to-GL reconciliation remain open. A correct grain does
  not make stale or unreconciled data current.

