# Metrc sales detail — PREPARED, NOT DEPLOYED, NOT RUN

Written 6 August 2026 at the owner's request. **It has never been deployed to
Supabase and has never called Metrc.** Nothing in the database has changed.

## Why it exists

We hold **2,548 outgoing transfer headers** back to January 2024 — manifest
number, dates, package count, driver. **Every one has a blank recipient**,
because the sync only ever called Metrc's transfer *list* endpoint.

That means today you can see product left the building, and when. You cannot see
who bought it, what product line, or how much. No customer history, no sales by
product, no margin, no demand signal.

The detail is in Metrc. It just was never fetched.

## What running it would give you

- **Recipient** — facility name and licence, on every outgoing manifest
- **Line items** — which packages, shipped and received quantity, unit of measure
- **Product category per line**, straight from Metrc

Because every package already carries its Metrc category, **sales by Flower /
Vapes / Pre-Rolls / Concentrates falls out automatically** — no new mapping.

Economy versus Premium would still **not** appear. Metrc has no such
distinction. That is a separate decision.

## Before it can run — three things, none of them done

**1. Two columns and one table do not exist yet.** The migration is below. It is
written but NOT applied.

```sql
alter table metrc_transfers add column if not exists recipient_name text;
alter table metrc_transfers add column if not exists recipient_license text;
alter table metrc_transfers add column if not exists received_on timestamptz;
alter table metrc_transfers add column if not exists delivery_raw jsonb;

create table if not exists metrc_transfer_packages (
  id bigserial primary key,
  manifest_number text not null,
  delivery_id bigint,
  package_tag text not null,
  product_name text,
  product_category text,
  shipped_quantity numeric,
  shipped_uom text,
  received_quantity numeric,
  received_uom text,
  raw jsonb,
  fetched_at timestamptz not null default now(),
  unique (manifest_number, package_tag)
);
alter table metrc_transfer_packages enable row level security;
create policy mtp_read on metrc_transfer_packages for select to authenticated using (true);
grant select on metrc_transfer_packages to authenticated;
```

**2. Metrc credentials must be set as function secrets** — `METRC_VENDOR_KEY`,
`METRC_USER_KEY`, and optionally `METRC_BASE_URL` and `METRC_LICENSE`. They are
not in the repo and must never be.

**3. The endpoints are UNVERIFIED.** Metrc's transfer detail is a two-step call
and the paths vary by state and API version. These are the documented v1 shapes:

```
GET /transfers/v1/{manifestNumber}/deliveries
GET /transfers/v1/delivery/{deliveryId}/packages
```

**I have not called them.** That is what the probe is for.

## How to run it, in order

**Step 1 — dry run.** Send `{}`. Calls nothing, writes nothing. Reports how many
manifests are outstanding and what it would do.

**Step 2 — probe.** Send `{"probe": true}`. Calls Metrc for **one** manifest,
writes **nothing**, and returns the raw payload.

**A person must read that payload.** Confirm the recipient name and the package
line items are actually present. Some states withhold delivery detail from the
sender once a transfer completes. **If Massachusetts does, stop — the backfill
will not produce sales history and should not be run.**

**Step 3 — backfill.** Only after the probe is read. Send
`{"confirm": true, "batch": 25}`. Resumable: it skips anything already detailed,
so call it repeatedly until nothing is outstanding.

## What it will cost

2,548 manifests × 2 calls = **~5,100 Metrc calls**. With a 400 ms pause that is
roughly **35 minutes of continuous calling**, realistically spread over hours
because Metrc throttles. Ongoing it is a handful of manifests a day.

## Safety

- **Dry run is the default.** Nothing happens without `confirm` or `probe`.
- The probe writes nothing, ever.
- The backfill only fills blanks — it never overwrites a manifest that already
  has detail.
- No deletes anywhere.

## Status

| | |
|---|---|
| Function written | ✅ |
| Deployed to Supabase | ❌ **No** |
| Migration applied | ❌ **No** |
| Credentials set | ❌ **No** |
| Ever called Metrc | ❌ **No** |
| Endpoints verified | ❌ **No — this is what the probe is for** |
