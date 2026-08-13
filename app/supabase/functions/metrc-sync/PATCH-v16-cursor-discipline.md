# metrc-sync v16 — a partial run must not move the watermark

**Written 13 Aug 2026 by Agent I. NOT DEPLOYED. It cannot be deployed from this repo.**

`index.ts` in this folder is a **redacted recovery copy** — its `ADMIN_KEY` is the
literal string `<REDACTED — lives in Supabase function secrets>`. Deploying it would
push a placeholder credential into production and break the function. `edge-function-drift`
says so on every run and it is right. So the change below is written out rather than
applied, and whoever deploys it must do so with the real key, from the live source.

I tried to deploy it. The gate stopped me. That is the third guard today that stopped
me doing damage, and it is worth more than the fix.

---

## What is broken

`metrc_plants` is short **1,168 flowering plants** against Metrc's own point-in-time
report — every plant in Flower Room #2 and 118 in F1:

| room | Metrc report | our mirror | gap |
|---|---:|---:|---:|
| Flower Room #1 | 1,140 | 1,022 | −118 |
| Flower Room #2 | 1,050 | **0** | **−1,050** |
| Flower Room #3 | 1,140 | 1,140 | 0 |
| Flower Room #4 | 1,050 | 1,050 | 0 |

The platform read that hole as an empty room and it reached the owner as an
operational emergency — "29 days empty, longest turnaround on record, walk it today."
The room was full. Metrc's own reports refuted it. **The alarm came from our own gap.**

## Why it cannot heal itself

```ts
const ok = subErrors.length < spec.paths.length;   // ONE sub-state succeeding = "ok"
...
if (spec.delta && !explicitWindow) { cursors[ck] = runStart; await saveCursors(cursors); }
```

`plants` fetches three sub-states — vegetative, flowering, inactive. If `flowering`
throws and `vegetative` succeeds, `ok` is **true**, the run is recorded **ok**, and the
cursor advances past the whole window.

A delta asks Metrc for what changed **since** the cursor. Those flowering records
changed **before** it. They are not late — they are unreachable. Every subsequent delta
returns 0 rows and reports success.

Truncation is the same failure by another route: hitting `MAX_PAGES` sets `truncated`,
which becomes the string `"⚠️ capped, run again"` that nothing parses, while the cursor
moves past the pages never fetched.

The live cursor `MC281714:plants` now reads `2026-08-13T14:00:06Z`, roughly a month past
the day F2 was flipped.

## The change

**1. `runSpec` signature** — return completeness, not just a string:

```ts
async function runSpec(...): Promise<{ text: string; complete: boolean }>
```

**2. Replace the `ok` calculation and the run update:**

```ts
const complete = subErrors.length === 0 && !anyTrunc;
const status = subErrors.length === spec.paths.length ? "error" : (complete ? "ok" : "partial");
await supa.from("metrc_sync_runs").update({
  status, records: n,
  error: subErrors.length ? subErrors.join(" · ").slice(0, 480) : null,
  note: complete ? null
    : anyTrunc
      ? `CAPPED at ${MAX_PAGES} pages. The cursor was NOT advanced, so the next run re-asks for this window.`
      : `${subErrors.length} of ${spec.paths.length} sub-states failed. The cursor was NOT advanced, so the next run re-asks for this window.`,
  finished_at: now(),
}).eq("id", run!.id);
return {
  text: `${n} new${anyTrunc ? " ⚠️ capped, cursor held" : ""}${subErrors.length ? ` (${subErrors.length} sub-state errors, cursor held)` : ""}`,
  complete,
};
```

**3. In the request handler, gate the cursor on completeness:**

```ts
const r = await runSpec(BASE, license, resolved.auth, spec, window);
const { count } = await supa.from(spec.table).select("*", { count: "exact", head: true }).eq("license", license);
results[ck] = `${r.text}${window ? " (windowed)" : ""} · ${count ?? 0} total in OS${r.complete ? "" : " · CURSOR HELD"}`;
if (spec.delta && !explicitWindow && r.complete) { cursors[ck] = runStart; await saveCursors(cursors); }
```

Re-asking for a window costs an API call. Skipping one costs the data, permanently and
invisibly. Never trade the second for the first.

## Two things this patch does NOT fix

**`PAGE_SIZE = 20`** is almost certainly why these runs time out at all. 55,000 plant
records at 20 a page with a 200 ms pause is over nine minutes of deliberate sleeping
before a single byte of network time, against a 30-minute stuck-run killer. Metrc v2
generally accepts far larger pages. I did **not** change it, because I have not measured
what this Metrc environment actually accepts and a wrong value breaks every endpoint at
once. **Measure it, then raise it — that is the real cure for the timeouts.**

**A full run returning zero rows is still indistinguishable from a full run with nothing
to do.** On 6, 7 and 8 Aug the nightly full plants sync returned **0 records in under five
seconds** and was recorded `ok` each time, for a facility holding 4,380 flowering plants.
That belongs in a `data_assertion` with both fixture halves, not in the sync — Agent W's
mechanism, spec below.

## The instrument that should have caught this

`v_plant_mirror_balance` is live as of today. It differences the mirror against
`metrc_rpt_point_in_time` per flower room and states the verdict in words, including the
warning not to read a zero as an empty room. Agent W's specced assertion,
`metrc.plant_mirror_covers_the_point_in_time_report`, should read it — negative half is
the 2025-01-01 snapshot, which reconciles 100% and must stay quiet.
