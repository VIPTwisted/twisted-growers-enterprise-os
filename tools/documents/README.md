# Document parsing — cultivator of record and chain of custody

**The certificate is the only independent statement of who grew or made the
material.** Every Metrc field shares one origin and cannot disconfirm another.
The manifest is the chain of custody outside the facility.

## Why this exists

983 certificates were downloaded on 6 Aug 2026 and the client field was parsed
out of **none** of them. On 7 Aug a package of 56.84 lb was ruled "ours"; the
certificate — `coa/2267739.pdf`, sitting on disk the whole time — named
**Greater Goods, LLC (MB282344)**. Batch, source package and the failing
yeast-and-mould result all matched. The only discrepancy on the document was
ownership, and it was ours.

**A document downloaded and not parsed is worse than one not downloaded, because
it looks like coverage.**

## Files

| file | what it does |
|---|---|
| `coa_client_parse.py` | reads the client block off a certificate — six layouts |
| `manifest_parse.py` | reads destination, transporter and dates off a manifest |
| `parse_documents.py` | the runner, with the failure policy |

## Run it

```
export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
python tools/documents/parse_documents.py --kind both --since 2026-08-01
```

Needs `curl` and `pdftotext` (poppler) on PATH. Exits non-zero when anything is
unreadable.

## The failure policy

An unknown layout **announces itself**: a row in `watchdog_findings` naming the
documents, and a non-zero exit. It never shrugs and moves on. This was proven
necessary twice in one session — **MCR Labs** was a sixth certificate layout
nobody knew about and it failed silently, so eight packages from Alternative
Compassion Services read as having no certificate when it was on disk all along.

## Layouts handled

| lab | how it labels the client |
|---|---|
| GVA Labs (IL281359, 709 certs) | name on line 1, `License #:` below |
| Analytics Labs (IL281280) | `Client` then `Lic. #` |
| Safetiva (IL281354) | `CULTIVATOR INFO` **or** `MANUFACTURER INFO` |
| Kaycha | name, address, `License # :` |
| Green Analytics (IL281277) | `Client Info` then `License:` |
| MCR Labs | `Client:` — **prints no licence at all**, name only |

**The anchor that makes this general: a Massachusetts LAB licence is always
`IL######`**, so any MC/MP/MB/MR/MT/RMD licence in the header belongs to the
client.

## Two traps

**Manifest columns are offset.** Under `pdftotext -layout` a line carries three
columns and the value is the **second**, not the last. Taking the last returns
the departure time as the destination name. Observed, not theoretical.

**Never store a signed URL.** `createSignedUrl` *requires* an expiry, which is
how 3,666 links came to die on the same day. Use
`f_document_url(storage_path)` — permanent and tokenless, served by the
`document` edge function with the bucket still private.
