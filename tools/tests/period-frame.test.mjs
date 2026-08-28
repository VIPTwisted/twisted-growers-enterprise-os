import test from "node:test";
import assert from "node:assert/strict";

import {
  FRAME_KEYS, FRAME_POLICY_KEYS, resolveFrame, startOfWeek, isoDow,
} from "../../app/web/src/lib/period-frame.js";

/* The policy as the owner set it: week begins Monday (ISO 1), shift opens at
   09:00 and runs eight hours. These are ROWS, and the tests below prove the
   code reads them rather than carrying them. */
const POLICY = { week_starts_on_iso_dow: 1, shift_start_hour: 9, shift_length_hours: 8 };

/* Wednesday 19 August 2026, 14:30 local. */
const WED = new Date(2026, 7, 19, 14, 30);

test("the five frames the owner asked for are the five on offer", () => {
  assert.deepEqual(FRAME_KEYS, ["hour", "shift", "day", "week", "custom"]);
});

test("Monday is a policy row, not a constant — change the row and the week moves", () => {
  const monday = startOfWeek(WED, 1);
  assert.equal(isoDow(monday), 1, "ISO 1 must land on a Monday");
  assert.equal(monday.getDate(), 17, "the Monday of the week containing Wed 19 Aug 2026 is the 17th");

  /* The proof that nothing is hardcoded: hand it a Sunday-start policy and the
     boundary moves. If Monday were compiled in, this assertion would fail. */
  const sunday = startOfWeek(WED, 7);
  assert.equal(isoDow(sunday), 7);
  assert.equal(sunday.getDate(), 16);
});

test("week resolves Monday to Sunday from the policy row", () => {
  const r = resolveFrame({ frame: "week", anchor: WED, policy: POLICY });
  assert.equal(r.ok, true);
  assert.equal(r.from, "2026-08-17");
  assert.equal(r.to, "2026-08-23");
  assert.equal(r.subDay, false);
});

test("Week and Day resolve to different ranges — the frame actually changes what is asked for", () => {
  const week = resolveFrame({ frame: "week", anchor: WED, policy: POLICY });
  const day = resolveFrame({ frame: "day", anchor: WED, policy: POLICY });
  assert.equal(day.from, "2026-08-19");
  assert.equal(day.to, "2026-08-19");
  assert.notEqual(week.from, day.from);
  assert.notEqual(week.to, day.to);
  /* This is the pair proved against the live database in the same change:
     f_department_dashboard('Command', 2026-08-17, 2026-08-23) and the same call
     for the single day return different values on seven key figures. */
});

test("a custom range is honoured exactly, and a backwards one is refused", () => {
  const ok = resolveFrame({
    frame: "custom", anchor: WED, policy: POLICY,
    customFrom: "2025-05-01", customTo: "2025-05-31",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.from, "2025-05-01");
  assert.equal(ok.to, "2025-05-31");

  const backwards = resolveFrame({
    frame: "custom", anchor: WED, policy: POLICY,
    customFrom: "2025-06-01", customTo: "2025-05-01",
  });
  assert.equal(backwards.ok, false);
  assert.match(backwards.why, /starts after it ends/i);

  const half = resolveFrame({ frame: "custom", anchor: WED, policy: POLICY, customFrom: "2025-06-01" });
  assert.equal(half.ok, false);
});

test("hour and shift report subDay rather than pretending to narrow money", () => {
  const hour = resolveFrame({ frame: "hour", anchor: WED, policy: POLICY });
  assert.equal(hour.ok, true);
  assert.equal(hour.subDay, true, "an hour cannot narrow a date-grained mirror");
  assert.equal(hour.from, "2026-08-19");
  assert.equal(hour.to, "2026-08-19");
  assert.match(hour.note, /DATE on every business event/i);
  assert.ok(hour.subDayFrom && hour.subDayTo, "the real hour is still carried for sources that have a clock");

  const shift = resolveFrame({ frame: "shift", anchor: WED, policy: POLICY });
  assert.equal(shift.ok, true);
  assert.equal(shift.subDay, true);
  assert.equal(new Date(shift.subDayFrom).getHours(), 9, "the shift opens on the policy hour");
});

test("before the shift opens, the shift in question is yesterday's", () => {
  const earlyMorning = new Date(2026, 7, 19, 6, 0);   // 06:00, before a 09:00 open
  const shift = resolveFrame({ frame: "shift", anchor: earlyMorning, policy: POLICY });
  assert.equal(shift.ok, true);
  assert.equal(shift.from, "2026-08-18", "06:00 Wednesday belongs to Tuesday's shift, not a shift that has not started");
});

test("a missing policy row refuses the frame instead of guessing", () => {
  for (const key of FRAME_POLICY_KEYS) {
    const partial = { ...POLICY };
    delete partial[key];
    const frame = key === "week_starts_on_iso_dow" ? "week" : "shift";
    const r = resolveFrame({ frame, anchor: WED, policy: partial });
    assert.equal(r.ok, false, `${frame} must refuse when ${key} is absent`);
    assert.match(r.why, /will not guess/i);
    assert.match(r.why, new RegExp(key));
  }
});

test("no policy at all is refused, never defaulted to Monday", () => {
  const r = resolveFrame({ frame: "week", anchor: WED, policy: undefined });
  assert.equal(r.ok, false);
  assert.match(r.why, /week-start policy could not be read/i);
});

test("an unknown frame and a missing anchor are both refused with a reason", () => {
  assert.equal(resolveFrame({ frame: "fortnight", anchor: WED, policy: POLICY }).ok, false);
  assert.equal(resolveFrame({ frame: "day", anchor: null, policy: POLICY }).ok, false);
});
