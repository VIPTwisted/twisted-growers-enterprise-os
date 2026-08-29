const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value) {
  if (value == null || value === "") return true;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3]);
}

export function normaliseDateRange(from, to) {
  const cleanFrom = from || "";
  const cleanTo = to || "";
  if (!isIsoDate(cleanFrom) || !isIsoDate(cleanTo)) {
    throw new Error("A date range must use real YYYY-MM-DD calendar dates.");
  }
  return cleanFrom && cleanTo && cleanFrom > cleanTo
    ? { from: cleanTo, to: cleanFrom }
    : { from: cleanFrom, to: cleanTo };
}

/* PostgREST timestamps need an exclusive upper boundary. `.lte("2026-08-31")`
 * ends at midnight and silently drops the other 23:59:59 of the owner's To day. */
export function dateUpperExclusive(to) {
  if (!to) return "";
  if (!isIsoDate(to)) throw new Error("The To date is not a real calendar date.");
  const [year, month, day] = to.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/* ─────────────────────────────────────────────────────────────────────────
   applyRange(query, column, range) — THE SERVER-SIDE TWIN OF rangeSearch.

   `rangeSearch` in lib/range-search.js decides which ALREADY-LOADED rows a
   frame shows. This decides which rows the database sends in the first place.
   Same frame, same rule, two places it has to be applied — and until now it was
   written out by hand in every one of them.

   IT IS NOT A SECOND DATE SYSTEM, AND IT CANNOT BECOME ONE. It holds no preset,
   no default, no week-start and no calendar arithmetic beyond the exclusive
   upper boundary above. The range arrives already resolved by the bus —
   `useDefaultRange` over `f_date_presets` — and this only narrows a query to it.
   Ask it what "this week" means and it has no opinion, which is the point.

   WHY IT EXISTS. `if (range.from) q = q.gte(col, range.from)` followed by
   `if (range.to) q = q.lt(col, dateUpperExclusive(range.to))` was written out
   seven times across the front end, and the copies had already drifted: some
   used `.lte(col, range.to)`, which ends at midnight and silently drops the
   other 23:59:59 of the owner's To day on any timestamp column. DDC: count the
   definitions of a primitive; more than one is the defect.

   THE UPPER BOUND IS ALWAYS EXCLUSIVE, on a date column as much as a timestamp.
   `< the day after` and `<= the day` select exactly the same rows from a DATE
   column, so one spelling serves both and no caller has to know which kind of
   column it is holding — which is precisely the knowledge the drifted copies
   got wrong.
   ───────────────────────────────────────────────────────────────────────── */
export function applyRange(query, column, range) {
  if (!query || typeof query.gte !== "function" || typeof query.lt !== "function") {
    throw new Error("applyRange needs a PostgREST query builder to narrow.");
  }
  if (!column) throw new Error("applyRange needs the column the frame applies to.");
  const { from, to } = normaliseDateRange(range?.from, range?.to);
  let narrowed = query;
  if (from) narrowed = narrowed.gte(column, from);
  if (to) narrowed = narrowed.lt(column, dateUpperExclusive(to));
  return narrowed;
}

export function validateDatePresetCatalog(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Supabase returned no date presets.");
  }
  const seen = new Set();
  return rows.map((row) => {
    if (!row || typeof row.preset_key !== "string" || !row.preset_key
        || typeof row.label !== "string" || !row.label
        || !["none", "both", "from", "to"].includes(row.manual_mode)
        || !isIsoDate(row.resolved_from) || !isIsoDate(row.resolved_to)) {
      throw new Error("Supabase returned an invalid date preset contract.");
    }
    if (seen.has(row.preset_key)) throw new Error(`Duplicate date preset: ${row.preset_key}.`);
    seen.add(row.preset_key);
    const range = normaliseDateRange(row.resolved_from, row.resolved_to);
    return { ...row, resolved_from: range.from || null, resolved_to: range.to || null };
  });
}

export function matchingDatePreset(rows, from, to, preferredKey) {
  const range = normaliseDateRange(from, to);
  const preferred = rows.find((row) => row.preset_key === preferredKey);
  const matches = (row) => (row.resolved_from ?? "") === range.from
    && (row.resolved_to ?? "") === range.to;
  if (preferred && preferred.manual_mode === "none" && matches(preferred)) return preferred;
  return rows.find((row) => row.manual_mode === "none" && matches(row)) ?? null;
}

export function dateSelectionLabel(selected, customActive, from, to) {
  if (!customActive) return "Custom";
  if (selected?.manual_mode === "none" && selected.label) return selected.label;
  if (from || to) return `${from || "…"} → ${to || "…"}`;
  return selected?.label || "Custom";
}

export function validateResolvedDefault(data) {
  const governedKey = data?.governed_preset_key ?? data?.preset_key;
  if (!data || typeof governedKey !== "string" || !governedKey) {
    throw new Error("Supabase returned no governed date default.");
  }
  const range = normaliseDateRange(data.resolved_from, data.resolved_to);
  return {
    ...data,
    preset_key: governedKey,
    resolved_from: range.from,
    resolved_to: range.to,
  };
}
