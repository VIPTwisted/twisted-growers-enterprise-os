import test from "node:test";
import assert from "node:assert/strict";

import { fetchDepartmentDashboard } from "../../app/web/src/lib/dashboard-range.js";

test("department dashboard binds the selected dates to the RPC", async () => {
  const calls = [];
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: [{ kpi: "Packages on hand" }], error: null };
    },
  };

  const result = await fetchDepartmentDashboard(client, {
    department: "Inventory",
    from: "2026-08-01",
    to: "2026-08-31",
  });

  assert.deepEqual(calls, [{
    name: "f_department_dashboard",
    args: { p_dept: "Inventory", p_from: "2026-08-01", p_to: "2026-08-31" },
  }]);
  assert.equal(result.error, null);
  assert.equal(result.data[0].kpi, "Packages on hand");
});

test("department dashboard keeps an RPC failure visible", async () => {
  const expected = { message: "database unavailable" };
  const client = { rpc: async () => ({ data: null, error: expected }) };

  const result = await fetchDepartmentDashboard(client, {
    department: "Command",
    from: "2025-01-01",
    to: "2025-01-31",
  });

  assert.equal(result.data, null);
  assert.equal(result.error, expected);
});

test("department dashboard rejects an empty or unverifiable result", async () => {
  for (const data of [null, {}, []]) {
    const client = { rpc: async () => ({ data, error: null }) };
    const result = await fetchDepartmentDashboard(client, { department: "Cultivation" });
    assert.equal(result.data, null);
    assert.match(result.error.message, /no verifiable key figures/i);
  }
});
