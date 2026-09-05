/* OS Help desk — pictured walkthroughs. Command → Help. view_key os_help.
   Phase 1: no Metrc/Apex write. If the live screen does not match the step, stop. */
import React, { useMemo, useState } from "react";

const DESKS = ["Everyone", "Floor", "Cultivation", "Manufacturing", "Inventory", "Finance", "HR", "Compliance"];

const GUIDES = [
  { slug: "who-sees-what", title: "Sign in and what you can see", desks: ["Everyone"], minutes: 2,
    summary: "Your role opens some menus and hides others. Zero tiles are a permissions miss, not empty rooms.",
    steps: [
      ["Sign in with your own account", "Use the email the office issued. There is no shared floor login. A page of zeroes means the wrong role, not empty rooms."],
      ["Menus follow the role", "Owner, executive, CFO, admin see finance and Metrc queues. Staff see their own work. A missing item is hidden on purpose."],
      ["Open Help from Command", "Command → Help. Same walkthroughs. If the live screen does not match the step, stop and report it."],
    ] },
  { slug: "date-range", title: "Date range, like the books", desks: ["Everyone"], minutes: 2,
    summary: "All / Today / This week (Mon→today) / This month / Last 12 / Custom. Positions are as-of. Search sets the range aside.",
    steps: [
      ["Find the control at the top", "Same family as QuickBooks. The default is per page, not hardcoded."],
      ["Know what the frame cannot move", "Stock on hand, licences, open queues are as-of or undated. Do not treat a position as a period total."],
      ["Search sets the range aside", "Typing a search ignores the period and says so on the page. Orders with no date are never dropped by a range."],
    ] },
  { slug: "metrc-vs-tg", title: "What you do in Metrc vs here vs Apex", desks: ["Everyone", "Floor"], minutes: 3,
    summary: "Metrc is custody. Apex is the invoice. This OS is plan, hours, exceptions, and grades. Phase 1 does not write back.",
    steps: [
      ["Custody lives in Metrc", "Harvest, waste, packages, tests, transfers, retail IDs — click those in Metrc."],
      ["The invoice lives in Apex", "Do not blend an Apex dollar with a Metrc pound. Gaps are named exceptions."],
      ["This OS plans and grades", "Schedules, units per hour, exception queues, room turn. Phase 1 does not write to Metrc or Apex."],
    ] },
  { slug: "how-to-mess-up", title: "How to mess this up — do not", desks: ["Everyone", "Floor"], minutes: 3,
    summary: "Ban list. No silent Metrc edits from here. No blending Apex with Metrc. No grading staff off the wrong clock.",
    steps: [
      ["Do not write Metrc from this OS", "If a step needs a Metrc click, the guide says so. There is no silent sync that fixes a missed waste."],
      ["Do not blend sources", "Apex invoice ≠ Metrc manifest. A gap is VALUE DIFFERS or FALSE MATCH, not a silent fix."],
      ["Do not grade on the wrong clock", "Room-turn verdict is vs a 56-day flower rule. Harvest-to-harvest mode is 70. Do not fire someone on 56 until the owner names the interval."],
    ] },
  { slug: "my-schedule", title: "My week, clock, and hours", desks: ["Floor", "HR"], minutes: 3,
    summary: "HR → My Work → My Week. Default is today. Changing hours is owner/manager with permission — not a personal override.",
    steps: [
      ["Open My Week", "HR → My Work → My Week. Default is today."],
      ["Clock is the record", "Hours come from punches, not from a typed total. A missing punch is an exception, not a guess."],
      ["Hours changes need permission", "Upper management only. Nothing about the week is hardwired."],
    ] },
  { slug: "harvest-in-metrc", title: "Harvest: weigh, waste, package, close", desks: ["Cultivation", "Floor"], minutes: 5,
    summary: "The clicks are in Metrc. This OS shows the exception if you skip a step. Wet, waste, packaged, residual must add.",
    steps: [
      ["Weigh in Metrc", "Wet weight on the harvest. Do this in Metrc, not here."],
      ["Record waste in Metrc", "This OS stores a mixed-unit column — do not total waste_qty. The truth view splits grams vs pounds."],
      ["Package and close in Metrc", "If residual sits, the moisture queue will flag it. Fix in Metrc, then the tile must fall."],
    ] },
  { slug: "packages-testing", title: "Packages, labs, and retail IDs", desks: ["Manufacturing", "Compliance"], minutes: 4,
    summary: "Create the package in Metrc. Submit for testing in Metrc. Failed material needs a disposition. Do not ship untested.",
    steps: [
      ["Create the package in Metrc", "Item, strain, and tag are Metrc clicks."],
      ["Submit for testing in Metrc", "Never-submitted sits on Exception Queues → Never submitted."],
      ["Failed needs a disposition", "Failed with no disposition is a queue, not a maybe. Do not ship untested."],
    ] },
  { slug: "exception-queues", title: "Work a Metrc exception queue", desks: ["Compliance", "Cultivation"], minutes: 4,
    summary: "Four queues. Need-action-now first. Fix in Metrc. Come back — the tile must fall.",
    steps: [
      ["Open Metrc → Exception Queues", "Moisture, never submitted, failed no disposition, harvest open past the limit."],
      ["Work need-action-now first", "Severity is on the row. Do not clear a tile by hiding it."],
      ["Fix in Metrc, then refresh", "If the tile does not fall, the fix did not land in Metrc or the sync is stale. Report it."],
    ] },
  { slug: "on-hand", title: "What is actually on the floor", desks: ["Inventory", "Manufacturing", "Finance"], minutes: 3,
    summary: "Today’s pounds = live Metrc active packages, qty > 0. PIT is tags on a date, not pounds. Inactive is zero by design.",
    steps: [
      ["Live packages, not PIT", "On-hand is active Metrc packages with quantity. Point-in-time is a tag count on a date."],
      ["Inactive is zero", "Finished or emptied packages do not sit in on-hand. That is not a missing sync."],
      ["Empty cart is a production miss", "Do not sell from a location that is empty. Par and reorder are CFO-owned."],
    ] },
  { slug: "find-an-invoice", title: "Find any invoice, any year", desks: ["Finance"], minutes: 2,
    summary: "Finance → Orders. Period All. Search the invoice. Twiste-303 is the proof row.",
    steps: [
      ["Open Finance → Orders", "The book is the whole Apex order list, not this year only."],
      ["Set period to All, then search", "Search sets the range aside. Twiste-303 (18 May 2025) must return."],
      ["Read MATCHED vs exception", "A false match on invoice key is not a value difference. Do not blend the two."],
    ] },
  { slug: "room-turn", title: "Room turn — two clocks", desks: ["Cultivation", "HR"], minutes: 3,
    summary: "Pull grain. Verdict vs 56-day flower rule. Observed harvest-to-harvest mode is 70, not a rule. Do not grade staff on 56 until the owner names the interval.",
    steps: [
      ["It counts pulls, not takedown days", "Consecutive harvest dates in the same room are one pull. Quote 52 pulls · judged 44."],
      ["Verdict is vs 56", "f_rule(room_cycle_days)=56 is the flowering target. 43 LATE on that clock. EXCEPTION (<20 days) is not FAIL."],
      ["70 is the observed harvest-to-harvest", "26 on cadence · 7 late · 11 early vs observed 70. That column is not a rule and not a grade."],
    ] },
  { slug: "units-per-hour", title: "Units per hour and empty cart", desks: ["Manufacturing", "Floor"], minutes: 3,
    summary: "Goal vs actual by hour. Managers cannot green a grade by lowering the target. Par and reorder are CFO-owned.",
    steps: [
      ["Read the hour, not the day", "If the goal is 2,000/hour and the line started at 10:07, the first hour already failed."],
      ["Targets are not a manager edit", "CFO / owner set par, reorder, and the unit goal. Lowering the bar to go green is a defect."],
      ["Empty cart is a production miss", "Do not keep selling SKUs that are below par. The alert is the point."],
    ] },
];

export default function OsHelp({ go }) {
  const [desk, setDesk] = useState("Everyone");
  const [slug, setSlug] = useState(null);
  const shown = useMemo(
    () => GUIDES.filter((g) => desk === "Everyone" || g.desks.includes(desk) || g.desks.includes("Everyone")),
    [desk],
  );
  const guide = GUIDES.find((g) => g.slug === slug) || null;

  return (
    <div className="ccpage">
      <div className="cc-head">
        <div>
          <div className="cc-kicker">Command · Help</div>
          <h1>Step by step</h1>
          <p className="cc-fine">
            For every signed-in user. Nothing here writes to Metrc or Apex.
            If the live screen does not match the step, stop and report it.
          </p>
        </div>
      </div>

      <div className="cc-tools">
        <div className="cc-tools-l">
          {DESKS.map((d) => (
            <button key={d} type="button" className={desk === d ? "cc-btn on" : "cc-btn"} onClick={() => { setDesk(d); setSlug(null); }}>
              {d}
            </button>
          ))}
        </div>
        <div className="cc-tools-r">
          <button type="button" className="cc-btn" onClick={() => go && go("tower")}>Control Tower →</button>
        </div>
      </div>

      {guide ? (
        <article className="cc-card" style={{ padding: 20, maxWidth: 720 }}>
          <button type="button" className="cc-btn" onClick={() => setSlug(null)}>← all guides</button>
          <p className="cc-fine" style={{ marginTop: 12 }}>{guide.desks.join(" · ")} · {guide.minutes} min</p>
          <h2 style={{ marginTop: 4 }}>{guide.title}</h2>
          <p className="cc-fine">{guide.summary}</p>
          <ol style={{ marginTop: 20, paddingLeft: 20 }}>
            {guide.steps.map(([t, body], i) => (
              <li key={t} style={{ marginBottom: 16 }}>
                <b>{i + 1}. {t}</b>
                <div className="cc-fine" style={{ marginTop: 4 }}>{body}</div>
              </li>
            ))}
          </ol>
        </article>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {shown.map((g) => (
            <li key={g.slug}>
              <button type="button" className="cc-card" style={{ textAlign: "left", width: "100%", padding: 16 }}
                onClick={() => setSlug(g.slug)}>
                <div className="cc-fine">{g.desks.join(" · ")} · {g.minutes} min</div>
                <div style={{ fontWeight: 600, marginTop: 6 }}>{g.title}</div>
                <div className="cc-fine" style={{ marginTop: 4 }}>{g.summary}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
