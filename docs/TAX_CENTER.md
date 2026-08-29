# Tax Center

Module: Finance → Tax Center. Period bus only (As-of / Range / Last 12 calendar months / YE). Not tax advice. Structure of records IRS, DOR, and this company will ask for.

SoR law:
- Dollars in the books = QuickBooks (after 15 Sep implementation). Not Metrc wholesale on a manifest. Not Apex used as a GL.
- Pounds / tags = Metrc.
- Invoices to customers = Apex.
- 280E split = owner policy table, editable, versioned — never hardcoded.

## Screens

1. **Tax calendar** — Form 941, MA withholding, Form 355, Form 1120, estimated payments. Dates in a table, not JSX.
2. **280E workpaper** — every GL account mapped: COGS-allowed / 280E-disallowed / mixed (allocation %). Evidence column. Change requires CFO role + log.
3. **Inventory tax roll** — opening PIT + receipts + production − shipments − waste = close. Breaks print. Uses certified snapshots only.
4. **COGS build-up** — direct biomass (Metrc + cost rates) + direct production labor (payroll) + manufacturing OH (policy). Selling / retail / most G&A stay in disallowed until the policy says otherwise.
5. **Sales tax / resale** — Apex wholesale by period + ST-4 on file per buyer. MA marijuana retail excise is the retailer’s MRT; we still keep the resale file.
6. **Payroll taxes** — 941 / W-2 / 1099 from payroll feed. 935 CMR wants wage records anyway.
7. **Export pack** — one ZIP for a range: trial balance, 280E map, inventory roll, Apex sales, Metrc movement, ST-4 list, refuse list.

## 280E rule in this OS

IRC 280E disallows deductions for the trade of trafficking a Schedule I/II substance except amounts that are inventoriable / COGS. We do not invent the case law. We keep the mapping so an accountant can defend it.

Default buckets (CFO can edit):
- Allowed as COGS: seed/clone cost, cultivation and manufacturing wages tied to product, nutrients/solvent that become product, packaging that ships with product, lab tests required to finish inventory, inbound freight of biomass.
- Disallowed until ruled otherwise: sales salaries, marketing, retail, most occupancy of selling space, many G&A salaries, owner draws.
- Mixed: facility utilities / rent — allocation % on the policy row (cultivation+mfg vs office/sales).

Massachusetts corporate excise (Form 355) is a separate return. Do not assume state automatically follows 280E line-for-line — the workpaper has a federal column and a state column.

## What we will not do

- Book revenue from Metrc transporter manifests (Eagle Eyes).
- Use live packages as 12-31 inventory.
- Hardcode 280E in JSX.
- Ship Tax Center as “IRS ready” before QBO is the GL.

## Build

Now: nav item + empty states that name the SoR and the 15 Sep gate.  
After QBO live: wire GL + payroll.  
Inventory roll waits on PIT import (same as Packet V).
