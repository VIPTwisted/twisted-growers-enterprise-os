# CEO Dashboard — substitution map for the 26 frozen figures

**For Agent B. Written 7 August 2026 by the watchdog.**

## Read this first

The blocker was never that the data didn't exist. **`v_dry_room_performance` already has every
column these figures need**, and has all along. Nobody checked.

More importantly: **the frozen numbers are now wrong, and one of them is dangerously wrong.**

---

## 🔴 The one that matters most

The CEO Dashboard says:

> "Pre Trim Storage **19.7 days**, **4 over** [the window]"

The live figure is **65.4 days average, with 81 harvests over the window.**

**Pre Trim Storage is the worst-performing drying room in the facility.** The dashboard presents
it as the best. An executive reading that page would look at Fulfillment Vault (stated 29.5,
actually 34.3) and conclude the problem is there — while the room that is actually three times
over the standard sits unmentioned at the bottom of the list.

That is not a stale number. It is a number that sends someone to the wrong room.

---

## Every frozen figure, its live value, and the column that replaces it

All from `v_dry_room_performance` (6 rows, one per room) unless noted.

| Frozen in `budz.jsx` | Live now | Drift | Replace with |
|---|---|---|---|
| Pre Trim Storage "19.7 days, 4 over" | **65.4 days, 81 over** | **+232%** | `avg_dry_days`, `dried_too_long` |
| Pre Trim Storage "786 lb across 6" | **6,271 lb**, 6 open | **+698%** | `sitting_unfinished_lb`, `still_open` |
| Cure Vault "2,082 lb across 4" | **8,462 lb**, 4 open | **+306%** | `sitting_unfinished_lb`, `still_open` |
| Fulfillment Vault "7,962 lb across 16 open" | **12,804 lb**, 16 open | **+61%** | `sitting_unfinished_lb`, `still_open` |
| Fulfillment Vault "29.5 days avg, worst 107, 57 over" | **34.3, worst 162, 82 over** | wrong ×3 | `avg_dry_days`, `slowest_dry_days`, `dried_too_long` |
| Cure Vault "26.4 days avg, worst 57, 17 over" | **28.7, worst 100, 44 over** | wrong ×3 | same three columns |
| Dry Room #2 "four harvests, 975 plants, 882 lb wet" | **13 harvests, 2,208 plants, 2,068 lb** | wrong ×3 | `harvests`, `plants`, `wet_lb` |
| Dry Room #2 "882 lb across 4, nothing packaged" | **1,733 lb sitting**, 4 open, 250 lb packaged | wrong | `sitting_unfinished_lb`, `packaged_lb` |
| Freezer/Biomass "2.4 days, 36 harvests, 77.7% conversion" | **2.3, 83 harvests, 76.3%** | wrong ×3 | `avg_dry_days`, `harvests`, `conversion_pct` |
| "78 dried too long and 36 in under seven days" | **248 too long, 82 too fast** | **wrong ×3 and ×2** | `sum(dried_too_long)`, `sum(dried_too_fast)` |
| "only 29 of 143 harvests dried inside the window" | **17 in window, of 360 measurable** | wrong | see note below |
| "30 harvests open, averaging 65 days, oldest 190" | **30 open, 67 avg, oldest 192** | close, still drifting | `v_harvest_forensic` where `harvest_state like 'STILL OPEN%'` |
| "roughly 4,515 pounds cut but never closed" | **4,515 lb** | correct today | `sum(still_in_room_lb)` on the same filter |
| "Average across all open harvests is 65 days" | **67 days** | drifting | `avg(total_days_start_to_now)` |
| "TG LMNT 115 #5 … open 190 days with 106 pounds" | verify before use | — | `v_harvest_forensic` ordered by days |

### The aggregate figures

```sql
-- open harvests: count, pounds, average age, oldest
select count(*), round(sum(still_in_room_lb)), round(avg(total_days_start_to_now)),
       max(total_days_start_to_now)
from v_harvest_forensic where harvest_state like 'STILL OPEN%';
-- returns: 30, 4515, 67, 192

-- dry-time bands, against the OWNER-SET window (10-14, from conversion_factors)
select count(*) filter (where dry_days_to_first_package > 14)          as too_long,   -- 248
       count(*) filter (where dry_days_to_first_package < 7)           as too_fast,   -- 82
       count(*) filter (where dry_days_to_first_package between 10 and 14) as in_window, -- 17
       count(*)                                                        as measurable  -- 360
from v_harvest_forensic where dry_days_to_first_package is not null;
```

**Note on "29 of 143":** that figure cannot be reproduced by any band I can construct. 360
harvests have a measurable dry time, not 143, and 17 fall inside 10–14, not 29. Do not try to
make it match — **delete it.** A number nobody can derive is not a number.

---

## Two traps while you do this

**1. Use the owner-set window, not the code's.** `CeoDashboard` currently computes against
`>= 7 && <= 16`. `conversion_factors` says `dry_window_min_days = 10` and
`dry_window_max_days = 14`. The label already claims 10–14 while the maths uses 7–16, so the
page contradicts itself twice over. Resolve via `f_rule()`, not a literal — task #10, and
`metric_registry.target_rule_key` is now a foreign key to `conversion_factors`, so a made-up
threshold key cannot even be registered.

**2. Keep the prose.** The plain-English explanation of *why* a number matters and *what to do
about it* is the best thing on that page and the reason it is worth fixing rather than deleting.
Move the sentences to data (`metric_registry.plain_english`, or a `metric_playbook` table) and
interpolate the live figures into them. The words stay; only the frozen digits go.

---

## Why this is worth doing before anything else on your list

Every other item on your queue is about the platform being *unreliable*. This one is about it
being *wrong in a way that changes a decision*. Someone reading that page today would send the
post-harvest lead to the wrong room.
