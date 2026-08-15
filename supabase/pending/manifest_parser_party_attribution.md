# parse-documents — manifest party attribution is wrong, and one part of it is certain

**Written 15 Aug 2026 by Agent I. NOT DEPLOYED — no write path in this session.**
File: `app/supabase/functions/parse-documents/index.ts`, function `parseManifest`.

This is the standing task "Fix manifest_extract party attribution and replay all 764
rows". Here is the actual cause, measured.

## Measured state of `manifest_extract`, all 764 rows

| field | populated |
|---|---|
| `destination_license` | 764 — but contaminated, see below |
| `transporter_license` | 437 |
| `destination_name` | **0** |
| `transporter_name` | **0** |
| `parse_note` | **0** |

## Defect 1 — CERTAIN. A transporter is being recorded as the customer.

`ANY_LIC_S` on line 70 recognises **both** transporter prefixes:

```
(?:MC|MP|MB|MR|MT|MD|MX|IL)\d{6}|RMD\d{3,4}(?:-[A-Z])?
```

But the classifier only knows `MX`:

```js
out.transporter_license = lics.find(l => /^MX\d{6}$/.test(l)) ?? null;
out.destination_license = lics.find(l => !OURS.includes(l) && !/^MX\d{6}$/.test(l)) ?? null;
```

So an `MT` licence is not excluded from the destination search, and `lics` is in document
order — meaning if the transporter appears before the customer, **the courier is written
into `destination_license`**.

That is not theoretical. Comparing every parsed manifest against Metrc's own report:
1,327 comparable, 1,263 agree, **64 differ** — and 46 of those 64 are the document
claiming the destination was `MT281320`, which is Eagle Eyes Transport Solutions. The
report says the goods went to `Twisted Growers LLC` or names no destination at all.

**The fix:**

```js
const IS_TRANSPORTER = (l: string) => /^(?:MT|MX)\d{6}$/.test(l);
out.transporter_license = lics.find(IS_TRANSPORTER) ?? null;
out.destination_license = lics.find(l => !OURS.includes(l) && !IS_TRANSPORTER(l)) ?? null;
```

This also recovers the MT transporters that `transporter_license` has been silently
dropping — it only ever matched MX, which is why 327 of 764 rows have no transporter at
all.

## Defect 2 — NOT fixed here, because fixing it blind is how v18 got rolled back.

`destination_name` and `transporter_name` are null on **all 764 rows**. Both are read by
a line walk:

```js
const v = valueCell(ln); // cells(l)[1], or "" when the line has only one cell
```

`valueCell` returns `""` whenever the extracted PDF text is not laid out in columns. The
file already documents this exact failure for a different field, six lines above
`parseManifest`:

> *"The client NAME branch is a line walk and returns null on single-line output —
> which is exactly what caused the v5 regression."*

The author knew line walks fail on single-line output, fixed `client_license` by pattern
matching instead, and left the manifest party names as a line walk. **Same bug, same
file, known cause.**

I have not written the replacement because I cannot see a real document from this
session to confirm the layout, and guessing at a PDF's shape then deploying unverified is
precisely what got v18 rolled back. **Pull one manifest PDF, look at the extracted text,
then write the pattern.** It will be a `grab(/…/)` over the whole text, like
`origin_name` already is on line 169 — that one works.

## Defect 3 — the guard cannot fire.

```js
if (!out.destination_license && !out.destination_name) out.parse_note = "NO DESTINATION FOUND";
```

`destination_license` is populated on all 764 rows — sometimes with a courier — so the
condition is never true and `parse_note` is null everywhere. A parser that mis-attributes
a party reports itself as clean.

**The fix:** note the absence of each field independently, so a missing name is visible
rather than silently absorbed by a present licence.

```js
const missing = [];
if (!out.destination_license) missing.push("destination licence");
if (!out.destination_name)    missing.push("destination name");
if (!out.transporter_license && !out.transporter_name) missing.push("no transporter of any kind");
if (missing.length) out.parse_note = "NOT FOUND ON DOCUMENT: " + missing.join(", ");
```

## Replay scope — it is not 764

The standing task says replay 764 rows. Measured today:

- **2,465** manifests in Metrc's report
- **2,763** manifest documents already downloaded to storage
- **764** parsed

So roughly **31% of the evidence has been read**. Fixing the parser and replaying only
what has already been parsed leaves two thirds of the documents untouched. **Replay all
2,763.**

## Why this ranks above the licence normaliser

The normaliser infers which customer an order belongs to from a licence string. These
documents *state* it. The Fernway question — $36,150 with no shipping record anywhere —
is exactly the kind of thing a correctly parsed destination name answers outright, and
currently that field is null on every row we hold.
