# The data rules every agent obeys

**Canonical text.** This file is the source; the same words are pasted into the
four runtimes that cannot read it at run time (the desktop bridge, the local
model path, the Send-to-Claude brief, and the budz-chat function). Change it
here first, then re-inject.

```
=========================================================================
THE OWNER'S STANDING RULE, 8 August 2026. This outranks brevity.
=========================================================================
EVERY ANSWER IS FULL DETAIL. OURS OR THIRD PARTY, ALWAYS STATED. FULL CHAIN
OF CUSTODY WHENEVER CUSTODY IS PART OF THE QUESTION. Be specific and thorough.
A short answer that omits whose material it was is a WRONG answer, not a brief one.

WHICH DOCUMENT ANSWERS WHICH QUESTION
- The COA carries the TESTING: potency, pass or fail, which laboratory, sample
  and test dates, expiry. That is all a COA is for.
- The MANIFEST carries the CHAIN OF CUSTODY: who shipped, who received, package
  tags, STRAIN, item, quantity, value.
Ask the wrong document and you will find nothing and wrongly report data missing.

*** NEVER READ A PACKAGE ONE LEVEL DEEP. ***
When a package is REPACKAGED in Metrc the child does NOT inherit
ReceivedFromFacilityName - that field belongs to the parent. The child carries
only a pointer in SourcePackageLabels. Read the child alone and third-party
material books as our own production.

This exact failure happened on 7 Aug 2026: eight packages, $25,027, reported as
Twisted Growers product shipped to ARL Healthcare. The owner corrected it in one
line - "THOSE ARE NOT OUR STRAINS AND WE DID NOT SELL TRIM." He was right. It was
all Holyoke Wilds material, received on inbound manifests 0003318120 and
0003351074, repackaged on 5 Aug and sold on. That is DISTRIBUTION, not production.

USE THESE, NOT THE RAW TABLE:
- v_shipped_full  -> THE answer to any "what shipped / what left / what went out"
  question. Every line already carries whose material it is, the inbound manifest
  it arrived on, the strain, the value, the certificate and the manifest document.
- f_material_origin(package_tag) -> ownership resolved through the full lineage.
NEVER answer a shipment question from metrc_rpt_package_transfers alone.

STRAIN: when the strain column is blank the strain is IN THE ITEM TEXT -
"Holyoke Wilds | Blockberry | Bulk Shake/Trim", "Pomelo Punch - Trim". 387 rows
are blank while the item names it plainly. Read it before saying strain unknown.

ONE COMPANY HOLDS SEVERAL LICENCES - ONE PER LOCATION. Owner, 8 Aug: "EACH HAS
LICENSE". Two different licence numbers under the same company name is NORMAL and
must NEVER be reported as a discrepancy or a data error.

=========================================================================
NEVER REPORT DATA MISSING WITHOUT COUNTING IT
=========================================================================
"I found nothing" and "there is nothing" are different statements. Before writing
that anything is empty, missing or not tracked:
1. Run a bare count(*) on the table with NO filters.
2. If it is not zero, your filter was wrong - say that, not "no data".
3. Check as_of_date. metrc_rpt_package_transfers holds ONLY 6-7 Aug 2026; it is a
   two-day snapshot, not history. A missing older row was never imported.
4. Only then say a thing is absent, and name the table you counted.
An answer once claimed metrc_rpt_package_transfers was empty while it held 19,256
rows. A wrong "there is no data" sends the owner hunting a problem that does not
exist and hides the one that does.

GENUINELY NOT BUILT (verified 8 Aug 2026 - re-count before repeating):
sales_orders, sales_order_lines, shipments, shipment_lines, invoices, metrc_sales
are all 0 rows, so BACKORDERS CANNOT BE COMPUTED - ordered minus shipped, and the
ordered side has never been recorded. Metrc records custody, not commitments.
material_purchases and third_party_purchases are 0 rows, so margin on remediation
and on distribution is uncomputable and any such figure is invented.

FOUR REVENUE LINES, NEVER BLENDED: own production, remediation, distribution,
services. On tolling and white label the material is NOT ours - it must never
count as our stock, our production or our yield, and the money is a fee, never a
price per pound.
```
