import test from "node:test";
import assert from "node:assert/strict";

import {
  dateUpperExclusive,
  matchingDatePreset,
  normaliseDateRange,
  validateDatePresetCatalog,
  validateResolvedDefault,
} from "../../app/web/src/lib/date-range-core.js";
import { readDatePresetCatalog, saveDateDefault } from "../../app/web/src/lib/date-range.js";

const catalog = [
  { preset_key: "all", label: "All dates", manual_mode: "none", resolved_from: null, resolved_to: null },
  { preset_key: "this_month", label: "This month", manual_mode: "none", resolved_from: "2026-08-01", resolved_to: "2026-08-31" },
  { preset_key: "custom", label: "Custom", manual_mode: "both", resolved_from: null, resolved_to: null },
];

test("normalises reversed custom dates without losing an endpoint", () => {
  assert.deepEqual(normaliseDateRange("2026-08-31", "2026-08-01"), {
    from: "2026-08-01", to: "2026-08-31",
  });
  assert.throws(() => normaliseDateRange("2026-02-30", "2026-03-01"), /real YYYY-MM-DD/);
});

test("builds an exclusive boundary that includes the whole To day", () => {
  assert.equal(dateUpperExclusive("2026-08-31"), "2026-09-01");
  assert.equal(dateUpperExclusive("2028-02-29"), "2028-03-01");
  assert.equal(dateUpperExclusive("2026-12-31"), "2027-01-01");
});

test("validates and matches the database-owned preset catalog", () => {
  const rows = validateDatePresetCatalog(catalog);
  assert.equal(matchingDatePreset(rows, "2026-08-01", "2026-08-31", "this_month").preset_key, "this_month");
  assert.equal(matchingDatePreset(rows, "2026-08-04", "2026-08-20", null), null);
  assert.throws(() => validateDatePresetCatalog([...catalog, catalog[0]]), /Duplicate/);
});

test("rejects a malformed governed default instead of querying all history", () => {
  assert.deepEqual(validateResolvedDefault({
    preset_key: "custom", resolved_from: "2026-08-20", resolved_to: "2026-08-01",
  }), {
    preset_key: "custom", resolved_from: "2026-08-01", resolved_to: "2026-08-20",
  });
  assert.throws(() => validateResolvedDefault(null), /no governed date default/i);
});

test("prefers the governed key while the old-client compatibility bridge is active", () => {
  const resolved = validateResolvedDefault({
    preset_key: "custom",
    governed_preset_key: "since_90",
    resolved_from: "2026-05-22",
    resolved_to: "2026-08-19",
  });
  assert.equal(resolved.preset_key, "since_90");
});

test("reads presets through the sole RPC and keeps database errors visible", async () => {
  const calls = [];
  const client = { rpc: async (name) => { calls.push(name); return { data: catalog, error: null }; } };
  const rows = await readDatePresetCatalog(client);
  assert.deepEqual(calls, ["f_date_presets"]);
  assert.equal(rows.length, 3);

  await assert.rejects(
    readDatePresetCatalog({ rpc: async () => ({ data: null, error: new Error("catalog denied") }) }),
    /catalog denied/,
  );
});

test("saves the preset and both custom endpoints at page or user scope", async () => {
  const writes = [];
  const client = {
    from: (table) => ({
      upsert: async (payload, options) => {
        writes.push({ table, payload, options });
        return { error: null };
      },
    }),
  };
  await saveDateDefault(client, {
    userId: "user-1", viewKey: "dashboard", presetKey: "custom",
    from: "2026-08-31", to: "2026-08-01",
  });
  await saveDateDefault(client, {
    userId: "user-1", viewKey: "dashboard", presetKey: "this_month",
    from: "2026-08-01", to: "2026-08-31", everywhere: true,
  });
  assert.deepEqual(writes[0], {
    table: "user_page_date_default",
    payload: {
      user_id: "user-1", view_key: "dashboard", preset_key: "custom",
      custom_from: "2026-08-01", custom_to: "2026-08-31",
    },
    options: { onConflict: "user_id,view_key" },
  });
  assert.equal(writes[1].table, "user_settings");
  assert.equal(writes[1].payload.default_date_preset, "this_month");
});
