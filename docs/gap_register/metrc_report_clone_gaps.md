# Metrc report-clone gaps

Caveats found in the imported Metrc **report** tables (`metrc_rpt_*`) when they are
compared against the live API mirror. These are read-only observations. **Nothing here
is repaired by inserting rows** — a report export is evidence of what Metrc printed, and
inventing rows to close a gap destroys the only thing it is good for.

---

**2026-08-29 — `metrc_rpt_transfer_manifests` under-counts inbound transfers by 33
manifests that predate its own as-of date, and is a further 21 days stale.**

Measured, destination = one of our two licences, distinct manifest, third-party origin
(origin licence not `MC281714` / `MP281909`):

| source | as-of | external inbound |
|---|---|---:|
| `metrc_transfers` (live API mirror) | 28 Aug | **158** |
| `metrc_rpt_transfer_manifests` (report export) | **7 Aug** | **110** |

Set comparison: **48 in the API and not in the report; 0 in the report and not in the
API.** The API is a strict superset. 15 of the 48 arrived after 7 Aug and are explained
by staleness. **The remaining 33 predate 7 Aug and are simply absent from an export that
claims to cover them** — so the shortfall is not only lag.

Why it matters: this table is the natural source for a purchase-side exception queue, and
the two sources disagree on the size of that queue by 48. Quote the API figure (158), or
name the as-of date when quoting the report figure. Separately, the same comparison shows
1,094 of the 1,252 inbound manifests are Twisted Growers shipping to Twisted Growers
between our own licences — internal movement, not purchases — so any "inbound vs Apex
purchase orders" gap must exclude them or it reads roughly eight times too large.

Not investigated: why the 33 are missing. Could be the export's own filters, the window
it was run for, or the import. Left open rather than guessed.
