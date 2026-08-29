# THE F4 143 — NAMED, AND CLOSED

**Raised:** 29 August 2026 · **Lane:** Claude C · **Status:** CLOSED with evidence
**Method:** read-only. Nothing applied, no view rewritten, no harvest invented, no
plant invented. Ingest untouched.

The 143 was carried open on `docs/tickets/PLANT_MIRROR_PHASE.md` as
*"1,050 flowering reported on 6 Aug vs 907 on the harvest batches — not closed as
zero."* It is now named tag by tag. **It was never missing.**

---

## 1. What the subtraction actually gives

| set | count |
|---|---:|
| PIT 2026-08-06, Flower Room #4, `record_type='Plant'`, `status_current='Flowering'` | **1,050 distinct tags** |
| Plant tags on the four F4 harvest batches of 10–11 Aug | **907 distinct tags** |
| Harvested tags NOT in the PIT set | **0** |
| **Leftover** | **143** |

So the 143 is real, and it is exactly 143 — not an artifact of counting. The 907
is a clean subset of the 1,050, which already rules out double-counting.

Plants were linked to harvests by `metrc_plants.raw->>'HarvestId'`, not by name.
Every batch reconciles against its own `PlantCount` exactly:

| harvest | metrc_id | PlantCount | tags linked by HarvestId |
|---|---:|---:|---:|
| TG Shake Shack - 20260810 f4 | 2343303 | 210 | 210 |
| TG Spec Ops - 20260810 f4 | 2343203 | 305 | 305 |
| TG Super Boof - 20260810 f4 | 2343202 | 182 | 182 |
| TG Apple Fritter - 20260811 f4 | 2343301 | 210 | 210 |
| | | **907** | **907** |

## 2. Where the 143 went — a FIFTH F4 harvest

All 143 leftover tags carry the same `HarvestId`:

```
harvest_id     2343302
name           TG Jet Fuel Gelato - 20260810 f
harvest_start  2026-08-10
HarvestedDate  2026-08-10   (all 143)
PlantCount     143          (exactly the leftover)
licence        MC281714
strain         TG Jet Fuel Gelato   (1 strain, 2 plant batches)
flower_room    NULL   <-- the reason every F4 query missed it
```

They were harvested. Their per-tag state today:

- `source_state` **inactive** — all 143
- `GrowthPhase` **Flowering**, `LocationName` **Flower Room #4** — all 143
- `HarvestId` and `HarvestedDate` present — **all 143**
- `DestroyedDate`, `DestroyedByUserName`, `DestroyedNote` — **none, 0 of 143**
- present in `metrc_rpt_plants_destroyed` — **0 of 143**
- `LastModified` 2026-08-17 — all 143
- `FloweringDate` 2026-06-16 — all 143

**Corroboration:** the 143 tags are a perfectly contiguous run,
`1A40A020000E5B1000053228` → `…053370`. 53370 − 53228 + 1 = 143. A single tag
roll on a single batch. Nothing is interleaved with the other four harvests.

### The reconciliation now closes to zero

```
907  (four named F4 batches)
+143  (TG Jet Fuel Gelato - 20260810 f, room not recorded)
-----
1050  = PIT Flower Room #4 Flowering as-of 2026-08-06   EXACT
```

**Residual: 0.** No plant left Flower Room #4 without a harvest record.

### A false lead, recorded because it nearly shipped

On first pass the 143 profiled as *inactive, still Flowering, still in FR4, no
destroy date, all retired on one day* — which is the exact signature of a hidden
destroy, and reads as a diversion finding. It is not one. The second query, on
`HarvestId` and `HarvestedDate` rather than on state, showed all 143 harvested.
The lesson for the next person: **a plant that goes inactive with no destroy row
is not evidence of anything until its HarvestId has been checked.**

## 3. Root cause — room is parsed from a free-text harvest name

`metrc_harvests.flower_room` is derived from the harvest NAME. The other four
batches end `f4`. This one ends `f`:

```
TG Shake Shack - 20260810 f4      -> F4
TG Jet Fuel Gelato - 20260810 f   -> NULL
```

Whether the digit was truncated or never typed, the effect is the same: a real
F4 harvest of 143 plants is attributed to no room, and every room-scoped harvest
query silently under-counts. `v_cult_harvest_calendar`, the harvest cycle queue
and the 8-week replay all key on `flower_room`.

Estate-wide: **9 of 385 harvests (2.3%) have `flower_room` NULL.** Eight are 2024
harvests whose names carry no room suffix at all — a different naming era, low
value. **Jet Fuel Gelato is the only recent and material one.**

**Recommended fix — do not patch the name.** The plants on a harvest carry
`LocationName` themselves, and all 143 say `Flower Room #4`. Derive the room from
the harvest's own plants and fall back to the name, rather than the reverse. That
is authoritative rather than lexical, and it cannot be defeated by a typo.

Not implemented here: read-only ticket, and this is not #102's scope.

## 4. Mother Room −3 — also named, also closed

Same method: PIT 2026-08-06 Mother Room Vegetative (33 tags) minus the live
vegetative mirror for Mother Room (30 tags) = 3 tags.

| tag | strain | last event | date | by | note |
|---|---|---|---|---|---|
| `1A40A020000E5B1000048582` | TG Blueberry Muffin #4 | DESTROYED | 2026-08-14 | Jacqueline Dixon | Unviable |
| `1A40A020000E5B1000048594` | TG LMNT 115 #5 | DESTROYED | 2026-08-14 | Jacqueline Dixon | Unviable |
| `1A40A020000E5B1000053017` | TG Gush Mintz | DESTROYED | 2026-08-14 | Jacqueline Dixon | Unviable |

All three: `source_state` inactive, still `LocationName` Mother Room, no
`HarvestId`, `LastModified` 2026-08-17. **Properly recorded destructions with a
date, a person and a reason.** Nothing unexplained, nothing to invent.

Mother Room reconciles: 33 reported − 3 destroyed = 30 in the mirror. **Residual 0.**

## 5. Correction to a gap card already in production

`v_cult_plant_balance_daily` (applied, migration `20260829140422`) says destroys
"cannot be attributed to a day" and gap-cards rather than computing a residual.
That is **true of the report clone and false of the API mirror**:

| source | rows | rows carrying a destroy date |
|---|---:|---:|
| `metrc_rpt_plants_destroyed` (report clone) | 3,773 | **0** |
| `metrc_plants.raw->>'DestroyedDate'` (API mirror) | 57,706 plants | **3,006 dated**, 2024-05-02 → 2026-08-14 |

The Mother Room three are in the mirror with dates, by name, with a reason — and
absent from the clone. So the destroy feed is not unusable; the **wrong feed** was
being read. The balance should take destroys from the mirror, which is the
system of record, and keep the clone only for corroboration.

That is a correction to my own applied work. It does not make the gap card
dangerous — it refuses rather than reporting a false zero, which is the safe
direction — but it refuses where it did not need to. Raised, not fixed here.

## 6. What this does NOT do

- **Does not net Flower Room #4 to zero in `v_plant_mirror_balance`.** That view's
  FR4 row is a *phase and instant* artifact — an as-of flowering count against a
  live flowering count across a harvest and replant. This ticket is about where
  1,050 plants went, which is a different question with a different answer. #102
  is untouched and unabsorbed.
- Does not rewrite any view, apply any migration, or invent a harvest or a plant.
- Does not patch the harvest name in Metrc. Rule D2: raise it, never correct a
  Metrc problem only in this platform.

## 7. Reproduce

```sql
with pit as (
  select distinct upper(btrim(tag)) tag from metrc_rpt_point_in_time
   where as_of_date = date '2026-08-06' and record_type = 'Plant'
     and location = 'Flower Room #4' and status_current = 'Flowering'),
hv as (select metrc_id::text id from metrc_harvests
        where flower_room = 'F4'
          and harvest_start between date '2026-08-10' and date '2026-08-11'),
harvested as (select distinct upper(btrim(p.tag)) tag
                from metrc_plants p join hv on hv.id = p.raw->>'HarvestId')
select p.raw->>'HarvestId' as harvest_id, count(*) as tags
  from (select tag from pit except select tag from harvested) l
  join metrc_plants p on upper(btrim(p.tag)) = l.tag
 group by 1;
-- expect: 2343302 -> 143
```

Note `metrc_rpt_point_in_time.licence` is now `licence_number` on main.

## 8. The 143 tags

Contiguous range `1A40A020000E5B1000053228` … `1A40A020000E5B1000053370`.
All identical on every field in section 2; there is no per-tag variation to list.

```
1A40A020000E5B1000053228  1A40A020000E5B1000053229  1A40A020000E5B1000053230
1A40A020000E5B1000053231  1A40A020000E5B1000053232  1A40A020000E5B1000053233
1A40A020000E5B1000053234  1A40A020000E5B1000053235  1A40A020000E5B1000053236
1A40A020000E5B1000053237  1A40A020000E5B1000053238  1A40A020000E5B1000053239
1A40A020000E5B1000053240  1A40A020000E5B1000053241  1A40A020000E5B1000053242
1A40A020000E5B1000053243  1A40A020000E5B1000053244  1A40A020000E5B1000053245
1A40A020000E5B1000053246  1A40A020000E5B1000053247  1A40A020000E5B1000053248
1A40A020000E5B1000053249  1A40A020000E5B1000053250  1A40A020000E5B1000053251
1A40A020000E5B1000053252  1A40A020000E5B1000053253  1A40A020000E5B1000053254
1A40A020000E5B1000053255  1A40A020000E5B1000053256  1A40A020000E5B1000053257
1A40A020000E5B1000053258  1A40A020000E5B1000053259  1A40A020000E5B1000053260
1A40A020000E5B1000053261  1A40A020000E5B1000053262  1A40A020000E5B1000053263
1A40A020000E5B1000053264  1A40A020000E5B1000053265  1A40A020000E5B1000053266
1A40A020000E5B1000053267  1A40A020000E5B1000053268  1A40A020000E5B1000053269
1A40A020000E5B1000053270  1A40A020000E5B1000053271  1A40A020000E5B1000053272
1A40A020000E5B1000053273  1A40A020000E5B1000053274  1A40A020000E5B1000053275
1A40A020000E5B1000053276  1A40A020000E5B1000053277  1A40A020000E5B1000053278
1A40A020000E5B1000053279  1A40A020000E5B1000053280  1A40A020000E5B1000053281
1A40A020000E5B1000053282  1A40A020000E5B1000053283  1A40A020000E5B1000053284
1A40A020000E5B1000053285  1A40A020000E5B1000053286  1A40A020000E5B1000053287
1A40A020000E5B1000053288  1A40A020000E5B1000053289  1A40A020000E5B1000053290
1A40A020000E5B1000053291  1A40A020000E5B1000053292  1A40A020000E5B1000053293
1A40A020000E5B1000053294  1A40A020000E5B1000053295  1A40A020000E5B1000053296
1A40A020000E5B1000053297  1A40A020000E5B1000053298  1A40A020000E5B1000053299
1A40A020000E5B1000053300  1A40A020000E5B1000053301  1A40A020000E5B1000053302
1A40A020000E5B1000053303  1A40A020000E5B1000053304  1A40A020000E5B1000053305
1A40A020000E5B1000053306  1A40A020000E5B1000053307  1A40A020000E5B1000053308
1A40A020000E5B1000053309  1A40A020000E5B1000053310  1A40A020000E5B1000053311
1A40A020000E5B1000053312  1A40A020000E5B1000053313  1A40A020000E5B1000053314
1A40A020000E5B1000053315  1A40A020000E5B1000053316  1A40A020000E5B1000053317
1A40A020000E5B1000053318  1A40A020000E5B1000053319  1A40A020000E5B1000053320
1A40A020000E5B1000053321  1A40A020000E5B1000053322  1A40A020000E5B1000053323
1A40A020000E5B1000053324  1A40A020000E5B1000053325  1A40A020000E5B1000053326
1A40A020000E5B1000053327  1A40A020000E5B1000053328  1A40A020000E5B1000053329
1A40A020000E5B1000053330  1A40A020000E5B1000053331  1A40A020000E5B1000053332
1A40A020000E5B1000053333  1A40A020000E5B1000053334  1A40A020000E5B1000053335
1A40A020000E5B1000053336  1A40A020000E5B1000053337  1A40A020000E5B1000053338
1A40A020000E5B1000053339  1A40A020000E5B1000053340  1A40A020000E5B1000053341
1A40A020000E5B1000053342  1A40A020000E5B1000053343  1A40A020000E5B1000053344
1A40A020000E5B1000053345  1A40A020000E5B1000053346  1A40A020000E5B1000053347
1A40A020000E5B1000053348  1A40A020000E5B1000053349  1A40A020000E5B1000053350
1A40A020000E5B1000053351  1A40A020000E5B1000053352  1A40A020000E5B1000053353
1A40A020000E5B1000053354  1A40A020000E5B1000053355  1A40A020000E5B1000053356
1A40A020000E5B1000053357  1A40A020000E5B1000053358  1A40A020000E5B1000053359
1A40A020000E5B1000053360  1A40A020000E5B1000053361  1A40A020000E5B1000053362
1A40A020000E5B1000053363  1A40A020000E5B1000053364  1A40A020000E5B1000053365
1A40A020000E5B1000053366  1A40A020000E5B1000053367  1A40A020000E5B1000053368
1A40A020000E5B1000053369  1A40A020000E5B1000053370
```
