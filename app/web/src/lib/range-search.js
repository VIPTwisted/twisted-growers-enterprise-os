/* ═══════════════════════════════════════════════════════════════════════════
   RANGE + SEARCH — one definition, used by every page that lists records.

   Owner, 28 August 2026 (docs/TODO_EVERY_PAGE.md): "Same rule as Orders: a
   search box that finds any invoice/tag/harvest/name across time. Typing search
   sets the date range aside and says so on the page. Undated rows are not
   dropped by a range. No page answers 'no results' only because this-month is
   selected."

   THIS IS NOT A SECOND DATE CATALOG. It holds no presets, no week-start, no
   default. The range arrives already resolved by the bus — `useDefaultRange`
   over `f_date_presets` — and this function only decides which loaded rows are
   shown. Ask it what "this week" means and it has no opinion, which is the
   point.

   THREE RULES, AND EACH ONE EXISTS BECAUSE THE OPPOSITE SHIPPED SOMEWHERE.

   1. A SEARCH BEATS THE RANGE. Someone typing a harvest name is asking about
      that harvest, not about a date window. Answering "no results" because the
      default happened to be this month is the Orders defect in a new costume —
      there, invoice Twiste-303 could not be found because the row was never in
      the browser. The caller is told the range was set aside so it can say so
      on the page; setting it aside silently would be its own defect.

   2. AN UNDATED ROW IS NEVER DROPPED BY A RANGE. A row with no date is not
      outside the window; it is unplaceable. Dropping it makes a total quietly
      wrong and gives the reader nothing to notice. It stays, and it is counted
      separately so the page can say how many rows it could not place.

   3. THE COUNTS ARE RETURNED, NOT INFERRED. `kept`, `outOfRange` and `undated`
      come back so a page can print "12 of 87, 3 undated" rather than showing 12
      and letting the reader assume that is all there is. A filtered total that
      cannot be told from a whole one is how a number becomes a lie.
   ═══════════════════════════════════════════════════════════════════════════ */

/* A date on a row may be a date, a timestamp, or absent. Absent is a state, not
   a zero — it returns null and rule 2 takes over. */
function rowDate(row, field) {
  const raw = row?.[field];
  if (raw === null || raw === undefined || raw === "") return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* Compares on the calendar day, not the instant, because the bus deals in
   YYYY-MM-DD and a timestamp late on the To-day would otherwise fall outside a
   range that plainly includes it. */
const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function matchesSearch(row, fields, needle) {
  if (!needle) return true;
  const hay = fields.map((f) => row?.[f] ?? "").join(" ").toLowerCase();
  return hay.includes(needle);
}

/* ─────────────────────────────────────────────────────────────────────────
   rangePlan(options) → { needle, searching, hasRange, applyRange, setAside }

   THE POLICY, SEPARATED FROM THE MECHANISM — and the reason this exists.

   rangeSearch below filters rows the browser already holds. That is right for a
   page that loads its whole list, and wrong for one that cannot: ReportScreen
   serves ~619 registered reports off tables far too large to pull down, so it
   has to ask the SERVER for the filtered set. Two mechanisms, unavoidably.

   What must NOT be two is the policy. Before this, ReportScreen decided for
   itself and decided wrongly on both counts: it ANDed the search onto the same
   PostgREST query as the range, so a search for a July work order returned
   nothing while this-month was selected; and it filtered with .gte(), which no
   NULL ever satisfies, so every undated row vanished from every ranged report.
   Those are rules 1 and 2 broken in the one place that serves the most pages.

   So the decision moves here and both callers ask it: the client filter uses it
   to choose what to keep, and ReportScreen uses it to choose which predicates to
   put on the wire. One definition of "a search beats the range", testable on its
   own, and the next page that needs it does not get a third opinion.
   ───────────────────────────────────────────────────────────────────────── */
export function rangePlan({ from = "", to = "", dateField = null, q = "" } = {}) {
  const needle = String(q ?? "").trim().toLowerCase();
  const searching = needle.length > 0;
  const hasRange = Boolean(from || to);
  return {
    needle,
    searching,
    hasRange,
    /* RULE 1: a range is applied only when nobody is searching. */
    applyRange: Boolean(dateField) && hasRange && !searching,
    /* There WAS a range and it was deliberately ignored — the page must say so. */
    setAside: searching && hasRange,
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   rangeSearch(rows, options) → { rows, kept, outOfRange, undated, setAside,
                                  searching, total }

   options:
     from, to     the resolved range from the bus; either may be empty, and an
                  empty end is unbounded rather than today
     dateField    the row's own business date — the page names it, because only
                  the page knows which of its dates the reader means
     q            what was typed
     fields       which fields the search reads
   ───────────────────────────────────────────────────────────────────────── */
export function rangeSearch(rows, { from = "", to = "", dateField, q = "", fields = [] } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  /* The same policy the server-side caller asks. Behaviour here is unchanged;
     what changed is that the decision is no longer made twice. */
  const { needle, searching, hasRange } = rangePlan({ from, to, dateField, q });

  if (searching) {
    /* RULE 1. Every row is searched, whatever the range says. */
    const hit = list.filter((r) => matchesSearch(r, fields, needle));
    return {
      rows: hit, total: list.length, kept: hit.length,
      outOfRange: 0, undated: 0,
      searching: true,
      setAside: hasRange,   /* there was a range, and it was deliberately ignored */
    };
  }

  if (!hasRange || !dateField) {
    return {
      rows: list, total: list.length, kept: list.length,
      outOfRange: 0,
      undated: dateField ? list.filter((r) => rowDate(r, dateField) === null).length : 0,
      searching: false, setAside: false,
    };
  }

  let outOfRange = 0;
  let undated = 0;
  const kept = list.filter((r) => {
    const d = rowDate(r, dateField);
    if (d === null) { undated += 1; return true; }   /* RULE 2 */
    const k = dayKey(d);
    if (from && k < from) { outOfRange += 1; return false; }
    if (to && k > to) { outOfRange += 1; return false; }
    return true;
  });

  return {
    rows: kept, total: list.length, kept: kept.length,
    outOfRange, undated, searching: false, setAside: false,
  };
}

/* The sentence a page prints under its control. Written here so the wording is
   the same on every page — a reader who learns to read it once has learned to
   read it everywhere. */
export function rangeSearchNote(result, { noun = "rows", rangeLabel = "" } = {}) {
  if (!result) return "";
  const n = (x) => Number(x ?? 0).toLocaleString();
  if (result.searching) {
    return result.setAside
      ? `${n(result.kept)} of ${n(result.total)} ${noun} match. The date range is set aside while you search — every period is being looked at.`
      : `${n(result.kept)} of ${n(result.total)} ${noun} match.`;
  }
  const bits = [`${n(result.kept)} of ${n(result.total)} ${noun}${rangeLabel ? ` in ${rangeLabel}` : ""}`];
  if (result.outOfRange) bits.push(`${n(result.outOfRange)} outside it`);
  if (result.undated) bits.push(`${n(result.undated)} carry no date and are kept rather than dropped`);
  return `${bits.join(" · ")}.`;
}
