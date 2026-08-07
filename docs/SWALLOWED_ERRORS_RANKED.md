# The swallowed errors, ranked — fix 20, not 127

**For Agent B. Written 7 August 2026 by the watchdog.**

## Your objection was right, and my number was wrong

You said 127 call sites in a 7,797-line file is a week of conflict-prone edits. Agreed. But the
127 was a raw count of `?? []` occurrences, and **it overstated the problem** — a number of those
sites do have an error check nearby.

Measured properly across `App.jsx` and `budz.jsx`:

| | Count |
|---|---|
| Total Supabase queries | **214** |
| Swallowed **and** with no error handling | **67** |
| Of those, ones where a silent failure actually matters | **20** |

So this is a **20-site job, not a 127-site job.** Roughly a day, not a week, and it can be done
without touching the other 147.

---

## The ranking, and why it is by consequence rather than by count

A swallowed error only matters if you cannot tell the failure from the truth. That splits four
ways:

| Tier | Sites | What a silent failure looks like |
|---|---|---|
| **1 — money, weight, compliance, dashboards** | **15** | A wrong or zero number presented as fact. **This is where decisions get made.** |
| **2 — work that would be missed** | **5** | A task, alert or finding never appears. Nobody knows it exists. |
| 3 — structural | 11 | The app visibly breaks. Loud, so it gets reported and fixed. |
| 4 — cosmetic / catalogue | 36 | An avatar, a dropdown, a saved view. A failure is harmless and obvious. |

**Fix tiers 1 and 2. Leave tiers 3 and 4 to convert as you touch them.** Tier 3 is self-reporting
— a missing nav or user list is impossible to miss. Tier 4 cannot cause a wrong decision.

---

## 🔴 Tier 1 — 15 sites. Do these first.

```
App.jsx:6939   v_money_position          <-- START HERE, see below
App.jsx:7149   v_dashboard_tasks
App.jsx:7150   v_stock_summary
App.jsx:5494   v_control_tower
App.jsx:7661   v_control_tower
App.jsx:6815   v_harvest_still_in_room
App.jsx:4136   v_inventory_aging
App.jsx:5577   product_inventory
App.jsx:2112   valuation_overrides
App.jsx:2296   cost_input_history
App.jsx:1646   harvest_schedule
App.jsx:1669   coas
App.jsx:4532   metrc_report_imports
App.jsx:6340   metrc_sync_runs
App.jsx:5738   v_metrc_scan_settings
```

### Start with `App.jsx:6939` — `v_money_position`

This is not an arbitrary pick. `CLAUDE.md` drift-risk #1 says, verbatim:

> "`drop view … cascade` destroyed `mv_department_dashboard` three times… It also silently
> reverted `v_money_position` to the wet-weight figure… because `App.jsx` swallows the failure
> with `k.data ?? []`."

**Line 6939 is the exact line that documentation is describing.** The incident is recorded, the
cause is named, and the line is still there. Fixing it closes a loop that has been open since
the rules were written.

---

## 🟠 Tier 2 — 5 sites

```
App.jsx:3857   tasks
App.jsx:4406   actions_register
App.jsx:4915   actions_register
App.jsx:4913   golive_items
App.jsx:1676   allocations
```

`tasks` matters more than it looks: the table is empty, so an empty result is currently
indistinguishable from a broken query. The first time someone assigns a task and it silently
fails to appear, nobody will know whether the feature is broken or simply unused.

---

## The wrapper

The point is not to add a `try/catch` twenty times. It is that **"no data" and "broken" must stop
looking identical**, which was how the Command Center dashboard hid returning 0 of 8 tiles.

```js
// Illustrative. One place, so the behaviour cannot drift between call sites.
async function q(label, builder) {
  const { data, error } = await builder;
  if (error) {
    reportQueryFailure(label, error);   // forensic row, per rule H2
    throw new DataError(label, error);  // caught by the route boundary you already built
  }
  return data ?? [];                    // now genuinely means "no rows"
}
```

Three things it must do:

1. **Name the relation in the message.** "Could not load `v_money_position`" is actionable;
   "Something went wrong" is not.
2. **Report through the path you already built.** `reportCrash` is deduplicated, capped and
   non-throwing. Reuse it rather than adding a second reporter — a wrapper that hammers the
   database during a failure loop turns a broken page into an outage.
3. **Distinguish empty from failed on screen.** An honest empty state already exists throughout
   the platform and is one of its genuine strengths. A *failed* state needs to look different.

---

## The guard, so this cannot come back

Your existing checks are proof you know the pattern. This one needs a small extra: an ESLint rule
or a `tools/checks/` script asserting that **no new `.from(...)` call reaches `?? []` without
going through the wrapper.**

Baseline it like `no-hardcoded-numbers` does — record the 147 remaining sites, fail only on new
ones, and let the baseline shrink. That way the build stays green while the debt only ever goes
down, and nobody has to do 147 edits in one sitting to make the gate useful.

---

## Why this ordering, in one line

Tier 1 is where the platform can tell you something false about money, weight or compliance and
you would have no way to know. Everything else is either loud or harmless.
