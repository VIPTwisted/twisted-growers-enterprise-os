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
