// facility_room in the database was seeded from tools/checks/facility-rooms.snapshot.json, and that
// snapshot was generated from app/web/src/facility/data/facility.ts (the A1.1 blueprint as the map
// draws it). Until the facility page reads the table, there are two definitions of a room; this test
// is what holds them equal. If someone edits facility.ts, this fails and says which room moved —
// regenerate the snapshot (node tools/checks/facility-rooms-from-blueprint.mjs > snapshot) AND ship
// the same change to facility_room, or the map and the schedule will disagree about a wall.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { rooms, depts } from "../checks/facility-rooms-from-blueprint.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const snapshot = JSON.parse(readFileSync(resolve(here, "../checks/facility-rooms.snapshot.json"), "utf8"));

test("facility.ts still draws the 30 rooms the database was seeded from", () => {
  const live = rooms();
  assert.equal(live.length, 30, "A1.1 Phase I has 30 labelled rooms");
  assert.deepEqual(live.map((r) => r.id), snapshot.rooms.map((r) => r.id), "room ids or their order changed");
  for (const [i, room] of live.entries()) {
    assert.deepEqual(room, snapshot.rooms[i], `room "${room.id}" differs from the snapshot facility_room was seeded from`);
  }
});

test("every room sits in exactly one department group, and the groups are unchanged", () => {
  const live = depts();
  assert.deepEqual(live, snapshot.depts, "FAC_DEPTS changed — zones were seeded from these groups");
  const placed = live.flatMap((d) => d.groups.flatMap((g) => g.rooms));
  assert.equal(new Set(placed).size, placed.length, "a room is in two groups");
  assert.deepEqual(new Set(placed), new Set(rooms().map((r) => r.id)), "a room is in no group");
});

test("Metrc names on the plan are unique — one Metrc location cannot be two rooms", () => {
  const metrc = rooms().map((r) => r.metrc).filter(Boolean);
  assert.equal(new Set(metrc).size, metrc.length);
  assert.equal(metrc.length, 24, "24 rooms carry a Metrc location label");
});
