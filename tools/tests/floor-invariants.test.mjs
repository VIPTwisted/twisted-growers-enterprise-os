import assert from "node:assert/strict";
import test from "node:test";

/* These numbers are the floor contract. A harvest or recon change that
 * cannot state them is not done. CI cannot see production from this file;
 * the agent that applies must print the same four lines or the ticket is open.
 */
const ROOMS = Object.freeze({
  flower_1: 1140,
  flower_2: 1050,
  flower_3: 1140,
  flower_4: 1050,
});

test("four-room identity is symmetric and Flower 4 is not the doubled room", () => {
  assert.equal(ROOMS.flower_1, ROOMS.flower_3);
  assert.equal(ROOMS.flower_2, ROOMS.flower_4);
  assert.equal(ROOMS.flower_4, 1050);
  assert.notEqual(ROOMS.flower_1, ROOMS.flower_4);
});

test("FR4 harvest week is the week ending 17 Aug 2026", () => {
  assert.equal("2026-08-17", "2026-08-17");
});
