/* ═══════════════════════════════════════════════════════════════════════════
   THE TIME FRAME — Hour · Shift · Day · Week · Custom.

   Owner, 26 August 2026: every dashboard must carry a frame, the week must
   start on Monday, and that Monday must be a policy somebody can change — not
   a constant compiled into a bundle.

   ── THIS FILE HOLDS NO DEFAULTS, ON PURPOSE ────────────────────────────────
   There is no `weekStartsOn = 1` fallback here. A fallback constant is exactly
   the thing the owner ruled out: it works, it is invisible, and the day someone
   edits the policy row the screen keeps answering with the old number and
   nobody can see why. So the policy is a REQUIRED input. Call this without it
   and you get `{ ok: false, why }` — a state the caller must render, in the
   same way a refused read is rendered rather than turned into a zero.

   ── WHAT THE FRAME PRODUCES, AND WHAT IT DOES NOT ──────────────────────────
   A frame resolves to `{ from, to }` as plain YYYY-MM-DD dates, because that is
   what `f_department_dashboard(p_dept, p_from date, p_to date)` accepts and what
   every ranged read on these pages already binds. The frame is therefore a
   PRODUCER of the range the pages already honour — not a second pipeline
   beside it. Nothing downstream had to learn a new shape.

   ── HOUR AND SHIFT ARE HONEST, NOT SILENT ──────────────────────────────────
   Measured on the live mirror, 26 Aug 2026: every business-event column that
   Metrc and Apex give us is a DATE, not a timestamp —
   `metrc_rpt_wholesale.created_on`, `.received_on`, `metrc_packages.packaged_on`,
   `metrc_rpt_package_transfers.received_on`, `v_forensic_sold_by_tag.shipped_on`
   and the Apex `order_date` are all `date`. The only timestamps in the mirror
   are ingestion metadata — `imported_at`, `synced_at`, `fetched_at` — which
   record when WE pulled the row, never when the business event happened.

   So an Hour or a Shift frame CANNOT narrow a quantity or a dollar below its
   day. It resolves to the day that contains it and reports `subDay: true` with
   the reason, so the tile can say "the mirror records dates, not times" instead
   of printing a day's pounds under an hour's heading. Inventing a clock the
   state system never gave us would be a fabricated measurement, and the one
   thing worse than a missing frame is a frame that appears to work.

   `watchdog_findings.observed_at` IS a real timestamp, so findings genuinely do
   narrow below a day. That is why `subDay` is reported rather than the frame
   being refused outright — the caller decides per tile.
   ═══════════════════════════════════════════════════════════════════════════ */

export const FRAMES = [
  { key: "hour",   label: "Hour" },
  { key: "shift",  label: "Shift" },
  { key: "day",    label: "Day" },
  { key: "week",   label: "Week" },
  { key: "custom", label: "Custom range" },
];

export const FRAME_KEYS = FRAMES.map((f) => f.key);

/* The policy keys this module needs, named once so the caller reads exactly
   these rows out of conversion_factors and nothing drifts between the two. */
export const FRAME_POLICY_KEYS = [
  "week_starts_on_iso_dow",
  "shift_start_hour",
  "shift_length_hours",
];

const ymd = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const addDays = (d, n) => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};

/* ISO day of week: Monday = 1 … Sunday = 7. JavaScript's getDay() is
   Sunday = 0, which is the off-by-one that puts a week boundary on the wrong
   day and is invisible until a Monday figure appears under a Sunday heading. */
export const isoDow = (d) => (d.getDay() === 0 ? 7 : d.getDay());

/* The start of the week CONTAINING `anchor`, for a week that begins on
   `weekStartsOnIsoDow`. With the policy set to 1 this is the Monday on or
   before the anchor; set it to 7 and the same code gives a Sunday week. */
export function startOfWeek(anchor, weekStartsOnIsoDow) {
  const back = (isoDow(anchor) - weekStartsOnIsoDow + 7) % 7;
  return addDays(startOfDay(anchor), -back);
}

/* ─────────────────────────────────────────────────────────────────────────
   resolveFrame — the whole of the frame logic, as one pure function.

   Returns, on success:
     { ok, frame, from, to, subDay, subDayFrom, subDayTo, label, note }

   `from` and `to` are inclusive YYYY-MM-DD strings, ready for the RPC.
   `subDayFrom` / `subDayTo` are ISO timestamps for the hour or shift, kept so a
   tile whose source genuinely carries a clock can use them; every other tile
   ignores them and says why.
   ───────────────────────────────────────────────────────────────────────── */
export function resolveFrame({
  frame,
  anchor,
  policy,
  customFrom = "",
  customTo = "",
} = {}) {
  if (!FRAME_KEYS.includes(frame)) {
    return { ok: false, why: `“${frame}” is not a frame this page offers.` };
  }
  if (!anchor || Number.isNaN(new Date(anchor).getTime())) {
    return { ok: false, why: "No point in time was given to resolve the frame around." };
  }
  const at = new Date(anchor);

  if (frame === "custom") {
    if (!customFrom || !customTo) {
      return { ok: false, why: "A custom range needs both a start date and an end date." };
    }
    if (customFrom > customTo) {
      return { ok: false, why: "The custom range starts after it ends." };
    }
    return {
      ok: true, frame, from: customFrom, to: customTo, subDay: false,
      subDayFrom: null, subDayTo: null,
      label: `${customFrom} to ${customTo}`,
      note: "Recomputed for the dates you chose.",
    };
  }

  /* Every remaining frame needs the policy. Nothing is assumed. */
  const missing = FRAME_POLICY_KEYS.filter(
    (k) => policy?.[k] === undefined || policy?.[k] === null || policy?.[k] === "",
  );
  if (frame === "week" && missing.includes("week_starts_on_iso_dow")) {
    return {
      ok: false,
      why: "The week-start policy could not be read, so this page will not guess which day the week begins on. "
         + "It is the row week_starts_on_iso_dow on Settings → Business Rules.",
    };
  }
  if (frame === "shift" && (missing.includes("shift_start_hour") || missing.includes("shift_length_hours"))) {
    return {
      ok: false,
      why: "The shift policy could not be read, so this page will not guess when a shift starts or how long it runs. "
         + "They are the rows shift_start_hour and shift_length_hours on Settings → Business Rules.",
    };
  }

  if (frame === "day") {
    const d = startOfDay(at);
    return {
      ok: true, frame, from: ymd(d), to: ymd(d), subDay: false,
      subDayFrom: null, subDayTo: null,
      label: ymd(d),
      note: "Recomputed for this one day.",
    };
  }

  if (frame === "week") {
    const s = startOfWeek(at, Number(policy.week_starts_on_iso_dow));
    const e = addDays(s, 6);
    return {
      ok: true, frame, from: ymd(s), to: ymd(e), subDay: false,
      subDayFrom: null, subDayTo: null,
      label: `${ymd(s)} to ${ymd(e)}`,
      note: `Recomputed for the week beginning ${ymd(s)}, per the owner-set week-start policy.`,
    };
  }

  if (frame === "hour") {
    const s = new Date(at.getFullYear(), at.getMonth(), at.getDate(), at.getHours());
    const e = new Date(s.getTime() + 60 * 60 * 1000);
    const d = startOfDay(at);
    return {
      ok: true, frame, from: ymd(d), to: ymd(d), subDay: true,
      subDayFrom: s.toISOString(), subDayTo: e.toISOString(),
      label: `${ymd(d)} ${String(s.getHours()).padStart(2, "0")}:00–${String(e.getHours()).padStart(2, "0")}:00`,
      note: SUB_DAY_NOTE,
    };
  }

  /* shift */
  const startHour = Number(policy.shift_start_hour);
  const lengthHours = Number(policy.shift_length_hours);
  const s = new Date(at.getFullYear(), at.getMonth(), at.getDate(), startHour);
  /* Before the shift opens, the shift in question is yesterday's. */
  if (at < s) s.setDate(s.getDate() - 1);
  const e = new Date(s.getTime() + lengthHours * 60 * 60 * 1000);
  return {
    ok: true, frame, from: ymd(startOfDay(s)), to: ymd(startOfDay(e)), subDay: true,
    subDayFrom: s.toISOString(), subDayTo: e.toISOString(),
    label: `shift from ${ymd(startOfDay(s))} ${String(startHour).padStart(2, "0")}:00, ${lengthHours} hours`,
    note: SUB_DAY_NOTE,
  };
}

export const SUB_DAY_NOTE =
  "Quantities and dollars cannot narrow below a day: Metrc and Apex give this platform a DATE on every "
  + "business event and no time of day, so this frame shows the whole day that contains it. Only findings, "
  + "which carry a real timestamp, narrow to the hour. Nothing here invents a clock the state system never sent.";
