/* OS Help desk — pictured walkthroughs. Command → Help and Settings → Help.
   Phase 1: no Metrc/Apex write. If the live screen does not match the step, stop. */
import React, { useMemo, useState } from "react";
import "./os-desk.css";

const DESKS = ["Everyone", "Floor", "Cultivation", "Manufacturing", "Inventory", "Finance", "HR", "Compliance"];

const GUIDES = [
  { slug: "who-sees-what", title: "Sign in and what you can see", desks: ["Everyone"], minutes: 2, badge: "CORE",
    summary: "Learn how to sign in, navigate the dashboard, and understand your role-based access and key areas of the system.",
    screens: ["Sign in", "Dashboard overview", "Role menu", "Key areas", "What's next"],
    open: "tower",
    steps: [
      ["Sign in with your own account", "Use the email the office issued. There is no shared floor login. A page of zeroes means the wrong role, not empty rooms."],
      ["Menus follow the role", "Owner, executive, CFO, admin see finance and Metrc queues. Staff see their own work. A missing item is hidden on purpose."],
      ["Open Help from Command or Settings", "Command → Help, or Settings → Help & Support. Same walkthroughs. If the live screen does not match the step, stop and report it."],
    ] },
  { slug: "exception-queues", title: "Work a Metrc exception queue", desks: ["Compliance", "Cultivation"], minutes: 4, badge: "COMPLIANCE",
    summary: "Step through how to review, investigate, and resolve exceptions in the Metrc queue.",
    screens: ["Open queue", "Filter exceptions", "Review details", "Investigate", "Take action", "Add note", "Resolve"],
    open: "xq_metrc_exceptions",
    steps: [
      ["Open Metrc → Exception Queues", "Moisture, never submitted, failed no disposition, harvest open past the limit."],
      ["Work need-action-now first", "Severity is on the row. Do not clear a tile by hiding it."],
      ["Fix in Metrc, then refresh", "If the tile does not fall, the fix did not land in Metrc or the sync is stale. Report it."],
    ] },
  { slug: "date-range", title: "Date range, like the books", desks: ["Everyone"], minutes: 2, badge: "CORE",
    summary: "All / Today / This week (Mon→today) / This month / Last 12 / Custom. Positions are as-of.",
    screens: ["Find the control", "What the frame cannot move", "Search sets range aside"],
    open: "tower",
    steps: [
      ["Find the control at the top", "Same family as QuickBooks. The default is per page, not hardcoded."],
      ["Know what the frame cannot move", "Stock on hand, licences, open queues are as-of or undated. Do not treat a position as a period total."],
      ["Search sets the range aside", "Typing a search ignores the period and says so on the page."],
    ] },
  { slug: "metrc-vs-tg", title: "What you do in Metrc vs here vs Apex", desks: ["Everyone", "Floor"], minutes: 3, badge: "CORE",
    summary: "Metrc is custody. Apex is the invoice. This OS is plan, hours, exceptions, and grades.",
    screens: ["Metrc", "Apex", "This OS"],
    open: "dept_dash_metrc",
    steps: [
      ["Custody lives in Metrc", "Harvest, waste, packages, tests, transfers, retail IDs — click those in Metrc."],
      ["The invoice lives in Apex", "Do not blend an Apex dollar with a Metrc pound. Gaps are named exceptions."],
      ["This OS plans and grades", "Schedules, units per hour, exception queues, room turn. Phase 1 does not write to Metrc or Apex."],
    ] },
  { slug: "how-to-mess-up", title: "How to mess this up — do not", desks: ["Everyone", "Floor"], minutes: 3, badge: "CORE",
    summary: "Ban list. No silent Metrc edits from here. No blending Apex with Metrc.",
    screens: ["Ban list", "If the picture does not match"],
    open: "os_help",
    steps: [
      ["Do not write Metrc from this OS", "If a step needs a Metrc click, the guide says so."],
      ["Do not blend sources", "Apex invoice ≠ Metrc manifest. A gap is VALUE DIFFERS or FALSE MATCH, not a silent fix."],
      ["Do not grade on the wrong clock", "Room-turn verdict is vs a 56-day flower rule. Harvest-to-harvest mode is 70. Do not fire someone on 56 until the owner names the interval."],
    ] },
  { slug: "my-schedule", title: "My week, clock, and hours", desks: ["Floor", "HR"], minutes: 3, badge: "HR",
    summary: "HR → My Work → My Week. Default is today. Changing hours is owner/manager with permission.",
    screens: ["Open My Week", "Default is today", "Hours are not a personal override"],
    open: "my_week",
    steps: [
      ["Open My Week", "HR → My Work → My Week. Default is today."],
      ["Clock is the record", "Hours come from punches, not from a typed total."],
      ["Hours changes need permission", "Upper management only."],
    ] },
  { slug: "harvest-in-metrc", title: "Harvest: weigh, waste, package, close", desks: ["Cultivation", "Floor"], minutes: 5, badge: "CULTIVATION",
    summary: "The clicks are in Metrc. This OS shows the exception if you skip a step.",
    screens: ["Weigh", "Waste", "Package", "Close"],
    open: "ops_cm",
    steps: [
      ["Weigh in Metrc", "Wet weight on the harvest. Do this in Metrc, not here."],
      ["Record waste in Metrc", "Do not total waste_qty. The truth view splits grams vs pounds."],
      ["Package and close in Metrc", "If residual sits, the moisture queue will flag it."],
    ] },
  { slug: "packages-testing", title: "Packages, labs, and retail IDs", desks: ["Manufacturing", "Compliance"], minutes: 4, badge: "COMPLIANCE",
    summary: "Create the package in Metrc. Submit for testing in Metrc. Failed material needs a disposition.",
    screens: ["Create package", "Submit for testing", "Disposition"],
    open: "xq_metrc_exceptions",
    steps: [
      ["Create the package in Metrc", "Item, strain, and tag are Metrc clicks."],
      ["Submit for testing in Metrc", "Never-submitted sits on Exception Queues."],
      ["Failed needs a disposition", "Do not ship untested."],
    ] },
  { slug: "on-hand", title: "What is actually on the floor", desks: ["Inventory", "Manufacturing", "Finance"], minutes: 3, badge: "INVENTORY",
    summary: "Today's pounds = live Metrc active packages, qty > 0. PIT is tags on a date, not pounds.",
    screens: ["Live packages", "If two reports disagree"],
    open: "dept_dash_inventory",
    steps: [
      ["Live packages, not PIT", "On-hand is active Metrc packages with quantity."],
      ["Inactive is zero", "Finished or emptied packages do not sit in on-hand."],
      ["Empty cart is a production miss", "Par and reorder are CFO-owned."],
    ] },
  { slug: "find-an-invoice", title: "Find any invoice, any year", desks: ["Finance"], minutes: 2, badge: "FINANCE",
    summary: "Finance → Orders. Period All. Search the invoice. Twiste-303 is the proof row.",
    screens: ["Open Orders", "Period All", "Search"],
    open: "orders",
    steps: [
      ["Open Finance → Orders", "The book is the whole Apex order list, not this year only."],
      ["Set period to All, then search", "Search sets the range aside. Twiste-303 (18 May 2025) must return."],
      ["Read MATCHED vs exception", "A false match on invoice key is not a value difference."],
    ] },
  { slug: "room-turn", title: "Room turn — two clocks", desks: ["Cultivation", "HR"], minutes: 3, badge: "CULTIVATION",
    summary: "Pull grain. Verdict vs 56-day flower rule. Observed harvest-to-harvest mode is 70, not a rule.",
    screens: ["Red banner", "One pull is 1–2 days"],
    open: "room_turn_audit",
    steps: [
      ["It counts pulls, not takedown days", "Consecutive harvest dates in the same cultivation department room are one pull."],
      ["Verdict is vs 56", "f_rule(room_cycle_days)=56 is the flowering target. EXCEPTION (<20 days) is not FAIL."],
      ["70 is the observed harvest-to-harvest", "That column is not a rule and not a grade."],
    ] },
  { slug: "units-per-hour", title: "Units per hour and empty cart", desks: ["Manufacturing", "Floor"], minutes: 3, badge: "FLOOR",
    summary: "Goal vs actual by hour. Managers cannot green a grade by lowering the target.",
    screens: ["Goal vs actual", "Par is CFO-owned"],
    open: "dept_dash_mfg",
    steps: [
      ["Read the hour, not the day", "If the goal is 2,000/hour and the line started at 10:07, the first hour already failed."],
      ["Targets are not a manager edit", "CFO / owner set par, reorder, and the unit goal."],
      ["Empty cart is a production miss", "Do not keep selling SKUs that are below par."],
    ] },
  { slug: "users-and-roles", title: "Users — who is on this OS", desks: ["Everyone", "HR"], minutes: 4, badge: "HR",
    summary: "Two owners live. Other roles are catalogued at 0. Owner creates.",
    screens: ["Open Users", "Role table", "Add user is owner-only"],
    open: "os_users",
    steps: [
      ["Open Settings → Users", "The table is live app_users. Do not invent staff."],
      ["Read provisioned vs catalog", "A zero is not a missing person. It is a role with nobody in it."],
      ["Add user is owner-only", "Passwords never print on this page."],
    ] },
  { slug: "permissions-matrix", title: "Permissions — what each role can open", desks: ["Everyone", "Compliance"], minutes: 4, badge: "COMPLIANCE",
    summary: "Menu visibility is nav_role_visibility. Zero tiles are a miss.",
    screens: ["Open matrix", "Green check / red dash", "Save is owner-only"],
    open: "permissions",
    steps: [
      ["Open Settings → Users & Permissions", "Green check = visible. Red dash = hidden."],
      ["Save is owner/executive", "A hidden page is not a missing page."],
      ["If you see zeroes", "Wrong role, not empty rooms."],
    ] },
];

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="M20 20l-3-3" />
    </svg>
  );
}

export default function OsHelp({ go }) {
  const [desk, setDesk] = useState("Everyone");
  const [q, setQ] = useState("");
  const [slug, setSlug] = useState(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return GUIDES.filter((g) => {
      if (desk !== "Everyone" && !g.desks.includes(desk) && !g.desks.includes("Everyone")) return false;
      if (!needle) return true;
      return [g.title, g.summary, g.badge, ...(g.screens || [])].join(" ").toLowerCase().includes(needle);
    });
  }, [desk, q]);
  const guide = GUIDES.find((g) => g.slug === slug) || null;

  return (
    <div className="osdesk">
      <p className="osdesk-kicker">Operating system help</p>
      <h1 className="osdesk-title">Step by step, with the screen</h1>
      <p className="osdesk-lede">
        For every signed-in user. Numbered walkthroughs. Nothing here writes to Metrc or Apex.
        If the live screen does not match the picture, stop and report it.
      </p>

      <div className="osdesk-shell">
        <div className="osdesk-helpbar">
          <p className="osdesk-crumb">Help Desk <span>›</span> <b>Training</b></p>
          <label className="osdesk-search">
            <SearchIcon />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guides" aria-label="Search guides" />
          </label>
          <button type="button" className="osdesk-iconbtn" onClick={() => go && go("my_alerts")} aria-label="Open issues">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
          </button>
          <button type="button" className="osdesk-support" onClick={() => setSlug("who-sees-what")}>Support</button>
        </div>

        <div className="osdesk-body">
          {guide ? (
            <article className="osdesk-guide">
              <button type="button" className="osdesk-add" onClick={() => setSlug(null)}>← all guides</button>
              <p className="osdesk-lede">{guide.desks.join(" · ")} · {guide.minutes} min</p>
              <h2 className="osdesk-title" style={{ fontSize: "1.45rem" }}>{guide.title}</h2>
              <p className="osdesk-lede">{guide.summary}</p>
              <ol>
                {guide.steps.map(([t, body], i) => (
                  <li key={t}><b>{i + 1}. {t}</b><span className="osdesk-lede">{body}</span></li>
                ))}
              </ol>
              {guide.open && go ? (
                <button type="button" className="osdesk-save" style={{ marginTop: 16 }} onClick={() => go(guide.open)}>
                  Open the live page
                </button>
              ) : null}
            </article>
          ) : (
            <>
              <h2 className="osdesk-title" style={{ fontSize: "1.7rem" }}>Step by step, with the screen</h2>
              <p className="osdesk-lede">Guided training modules with screen-level walkthroughs for every role and process.</p>
              <div className="osdesk-chips">
                {DESKS.map((d) => (
                  <button key={d} type="button" className={desk === d ? "on" : ""} onClick={() => setDesk(d)}>
                    {desk === d ? "✓ " : ""}{d}
                  </button>
                ))}
              </div>
              <div className="osdesk-cards">
                {shown.map((g) => (
                  <button key={g.slug} type="button" className="osdesk-card" onClick={() => setSlug(g.slug)}>
                    <div style={{ display: "flex", gap: 12 }}>
                      <span className="osdesk-ico" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h5" /></svg>
                      </span>
                      <div>
                        <b style={{ fontSize: "1.05rem" }}>{g.title}</b>
                        <div><span className="osdesk-tag">{g.badge}</span></div>
                      </div>
                    </div>
                    <p className="osdesk-lede" style={{ marginTop: 4 }}>{g.summary}</p>
                    <p className="osdesk-screens">Screens: {(g.screens || []).join(" · ")}</p>
                    <div className="osdesk-foot">
                      <span>{g.minutes} min</span>
                      <span className="osdesk-open">Open guide →</span>
                    </div>
                  </button>
                ))}
              </div>
              <p className="osdesk-note" style={{ textAlign: "center" }}>More guides available based on your role and filters.</p>
            </>
          )}
        </div>
        <p className="osdesk-note" style={{ border: 0, borderRadius: 0, margin: 0 }}>This Help desk. Pick a desk, open a guide, walk the numbered steps.</p>
      </div>
    </div>
  );
}
