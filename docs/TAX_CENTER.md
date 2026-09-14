# Tax Center

`nav_registry` view_key `tax_center`, Finance › Tax. **Built; nav row not applied.**

## The rule the page is built around

> **We substantiate. We do not opine.**
> — `tax_280e_doctrine`, rule `agents-do-not-take-positions`

The banner is read from that table at render time, not typed into the component.
If the owner and the CPA change the doctrine, the page changes with it.

## Three systems of record, and this page owns none of them

| Question | Answered by |
|---|---|
| What did it cost, and what was it booked to? | **QuickBooks Online** — the general ledger |
| What existed, where was it, who held it? | **Metrc** — custody |
| What was sold, to whom, for how much? | **Apex** — the order book |
| What may be absorbed into inventory? | `cost_classes`, against IRC 471 |

**No second ledger.** The page computes no balance, holds no account and totals
no money. Where a figure belongs to the GL it is *not* derived from custody data
that happens to be nearby — it is named as QBO's and left empty.

That restraint is the doctrine's own: `transfer-price-is-not-cost` records that
the declared wholesale price on a compliance manifest is a regulatory
declaration, not an invoice and not a payment — *"the most tempting number in
the database because it is populated and looks like money."*

## The GL is empty, and that is measured

`qbo_account_map` holds **10 purposes** and **every `qbo_account_id` is NULL**.
There is no QBO transaction table in this database at all.

So the GL panel and the COGS panel open empty and **name QuickBooks Online**,
showing the ten unmapped purposes rather than a figure. A zero is a claim that
something was counted and came to nothing; an empty state naming its source is
the truth. The page counts the mapped purposes live rather than assuming zero,
so the day QBO is connected the panel stops saying it.

## What is real on the page today

- **The doctrine** — all 8 rules with `agents_must`, `agents_must_never`, the
  trap already seen on our own data, and the authority. Citations carry an
  **unverified** chip where `authority_status` says so: nobody has checked them
  against the source text.
- **Cost classes** — the 4 that exist, with a standing chip that they cover
  **labour only**. Non-labour costs have no classifier, which the doctrine
  records as a live gap rather than a solved problem.
- **Certified positions** — every registered Inventory Point in Time export
  against what this platform holds, per licence, with the owner's locked
  certified-match verdict on each row.

The Metrc/Apex half does not wait on QBO.

## The certified-match rule, reported not decided

The page prints the comparison; it does not adjudicate it. The rule is enforced
in the database by `data_assertion` `pit.os_matches_the_metrc_grid` at
`max_allowed = 0`, with both fixture halves proved.

**Only the count is compared.** The Metrc grid states a record count and the
Inventory Point in Time report carries no quantity column at all — verified
against every file and every stored `source_row`. The page says so on the panel:
it proves the population, never the contents. Any pound or dollar figure for a
close is a reconstruction from other sources.

See `docs/CERTIFIED_CLOSES.md` for the register and the gaps.

## The period bus

The page takes the governed frame from `nav_registry.default_range`
(`this_year`, `activity`, matching the CFO Dashboard — tax is a year question)
and **says plainly that nothing on it is narrowed by the period yet**. The
doctrine, the cost classes and the certified positions are each a standing
position rather than a flow. The period will govern the COGS computation once
the GL is connected, which is the figure it actually belongs to.

Declaring the frame and stating what it does not move is the rule. Giving the
page no frame at all is not.

## Not applied

`supabase/pending/tax_center_nav_row.sql` adds the nav row under the existing
**Finance › Tax** subcategory — an add beside the four tax entries already
there, not a new side-bar category, per the 11 Aug frozen-surfaces ruling.

It copies visibility from `year_end_coverage` **including the `visible` flag**.
That matters: of that page's 24 visibility rows only 11 are `visible = true`,
and the other 13 are an explicit no for `employee`, `hr`, `manager`,
`dept_head`, `assistant_manager`, `planner` and six QuickBooks roles. Copying
`(view_key, role)` alone would have taken the column default and turned thirteen
deliberate noes into yeses — publishing a tax surface to the shop floor as a
side effect of adding a menu row. The migration asserts the copy matches role
for role in both directions and rolls back if it does not.

## Open, and needed before this page can answer a tax question

1. **QBO is not connected.** Until then the two GL panels stay empty by design.
2. **`cost_classes` covers labour only.** Non-labour costs cannot be classified
   against 471 at all yet.
3. **Every doctrine citation is `unverified`.** Shown as written, not as checked.
4. **The 1 Jan versus 31 Dec close convention is unresolved** — see
   `docs/CERTIFIED_CLOSES.md`. One of the two captured closes is off by a day and
   there is no Metrc manual in `docs/vendor` to settle it.
