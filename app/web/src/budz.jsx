import React, { useState, useEffect, useRef } from "react";
import { supabase } from "./lib/supabase.js";

/* ---------- BUDZ: the pet agent. Animated, transparent background, chats from live data. ---------- */
export function BudzAvatar({ mood = "idle", size = 150 }) {
  return (
    <svg viewBox="0 0 120 142" width={size} height={size * 1.18} className={`budz ${mood}`} aria-label="Budz the agent">
      <defs>
        <linearGradient id="bzHood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2df26a" />
          <stop offset="100%" stopColor="#0f9e4c" />
        </linearGradient>
        <radialGradient id="bzGlow" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#2df26a" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#2df26a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="66" rx="56" ry="60" fill="url(#bzGlow)" className="bzAura" />
      <g className="bzBody">
        <path d="M26 140 C26 108 40 96 60 96 C80 96 94 108 94 140 Z" fill="url(#bzHood)" />
        <rect x="52" y="86" width="16" height="13" rx="6" fill="#7a4a28" />
        <ellipse cx="60" cy="58" rx="30" ry="32" fill="#7a4a28" />
        <path d="M29 53 C29 25 91 25 91 53 C91 39 78 29 60 29 C42 29 29 39 29 53 Z" fill="url(#bzHood)" />
        <path d="M29 55 C22 51 20 68 28 72 Z" fill="url(#bzHood)" />
        <path d="M91 55 C98 51 100 68 92 72 Z" fill="url(#bzHood)" />
        <g className="bzShades">
          <rect x="38" y="50" width="20" height="13" rx="4" fill="#101410" />
          <rect x="62" y="50" width="20" height="13" rx="4" fill="#101410" />
          <rect x="57" y="55" width="6" height="3" rx="1.5" fill="#101410" />
          <rect x="41" y="52.5" width="7" height="3" rx="1.5" fill="#2df26a" opacity="0.55" />
          <rect x="65" y="52.5" width="7" height="3" rx="1.5" fill="#2df26a" opacity="0.55" />
        </g>
        <path className="bzMouth" d="M50 76 Q60 84 70 76" stroke="#2a1a0f" strokeWidth="2.8" fill="none" strokeLinecap="round" />
        <g className="bzChain">
          <path d="M45 97 Q60 113 75 97" stroke="#f5c542" strokeWidth="3.2" fill="none" strokeLinecap="round" />
          <path d="M60 110 l5.5 7.5 -5.5 7.5 -5.5 -7.5 Z" fill="#2df26a" stroke="#f5c542" strokeWidth="1.5" />
        </g>
        <g className="bzLeaf">
          <path d="M60 25 C56 14 60 5 60 3 C60 5 64 14 60 25 Z" fill="#2df26a" />
          <path d="M60 25 C50 21 46 12 45 9 C48 10 57 15 60 25 Z" fill="#2df26a" opacity="0.85" />
          <path d="M60 25 C70 21 74 12 75 9 C72 10 63 15 60 25 Z" fill="#2df26a" opacity="0.85" />
        </g>
      </g>
    </svg>
  );
}

const BUDZ_INTRO =
  "Yo — I'm Budz. I watch Metrc, the rooms, the schedule and the money. Ask me anything: what's late, what's costing us, what failed testing, where something sits, who needs to approve what. Every answer comes from the live records — never a guess.";

const BUDZ_CHIPS = [
  "What's the worst problem right now?",
  "What is costing us money?",
  "Who is behind schedule?",
  "What failed testing?",
  "What is sitting too long?",
  "How is our yield trending?",
  "What needs allocation approval?",
];

async function grab(table, sel, order, desc, lim) {
  let x = supabase.from(table).select(sel ?? "*");
  if (order) x = x.order(order, { ascending: !desc });
  const { data } = await x.limit(lim ?? 8);
  return data ?? [];
}

export async function budzAnswer(question) {
  const t = question.toLowerCase();
  const usd = (n) => "$" + Math.round(Number(n || 0)).toLocaleString();

  if (/worst|biggest|urgent|critical|problem|wrong/.test(t)) {
    const f = await grab("agent_findings", "*", "dollars", true, 6);
    const open = f.filter((r) => !r.resolved_at);
    return {
      headline: open.length
        ? `${open.length} findings on my desk. These are the ones I'd move on first.`
        : "Nothing critical on my desk right now.",
      rows: open.map((r) => ({
        label: r.headline,
        detail: r.detail,
        meta: r.dollars ? `${usd(r.dollars)} at stake · ${r.severity}` : r.severity,
        action: r.action,
        drill: r.drill_to,
      })),
    };
  }
  if (/cost|money|dollar|profit|margin|expensive|bottom/.test(t)) {
    const loss = await grab("v_real_loss_summary", "*", "dollars_at_target_cost", true, 5);
    const cost = await grab("v_true_cost_per_pound", "*", "month_date", true, 4);
    return {
      headline:
        "Where the money actually goes. Routine stem and fan leaf waste is already inside your cost per pound, so I never charge it twice.",
      rows: [
        ...loss.map((r) => ({
          label: r.loss_type,
          detail: r.why_it_is_a_loss,
          meta: `${r.pounds_affected ?? 0} lb · ${usd(r.dollars_at_target_cost)}`,
          action: "Open Real Loss Summary",
          drill: "real_loss_summary",
        })),
        ...cost.map((r) => ({
          label: `${r.month}: ${r.saleable_lbs} saleable lb from ${r.plants_harvested} plants`,
          detail: `Wet to saleable ${r.wet_to_saleable_pct}% · ${r.grams_per_plant} g per plant · ${r.plants_per_saleable_pound} plants per saleable pound`,
          meta: "cost driver",
          action: "Open True Cost Per Pound",
          drill: "true_cost_per_pound",
        })),
      ],
    };
  }
  if (/late|behind|schedule|deadline|miss|delay/.test(t)) {
    const v = await grab("v_late_violations", "*", "days_off_schedule", true, 8);
    const bad = v.filter((r) => String(r.rule_verdict || "").startsWith("VIOLATION"));
    return {
      headline: `${bad.length} schedule violations. Your rule: early is fine, late never is.`,
      rows: bad.map((r) => ({
        label: `${r.event_type} · ${r.room || "room"}`,
        detail: `${r.rule_verdict} — scheduled ${r.scheduled_date}${r.actual_date ? `, actual ${r.actual_date}` : ""}`,
        meta: r.days_off_schedule ? `${r.days_off_schedule} days off` : "",
        action: r.why_it_matters || "Weekend crew or second shift — never a slipped date.",
        drill: "issue_late",
      })),
    };
  }
  if (/fail|test|lab|coa|compliance|inspect|custody/.test(t)) {
    const c = await grab("v_custody_alerts", "*", null, false, 10);
    return {
      headline: `${c.length} compliance flags live from Metrc.`,
      rows: c.map((r) => ({
        label: `${r.flag} — ${r.item}`,
        detail: r.detail,
        meta: `${r.quantity ?? ""} ${r.uom ?? ""} · ${r.location ?? ""}`,
        action: "Resolve it in Metrc — this is live exposure.",
        drill: "custody_alerts",
      })),
    };
  }
  if (/sit|aging|old|stale|slow|cash|shelf/.test(t)) {
    const a = await grab("v_inventory_aging", "*", "days_here", true, 10);
    return {
      headline: "Capital that isn't moving. Every day here is money doing nothing.",
      rows: a
        .filter((r) => r.severity)
        .map((r) => ({
          label: `${r.item} · ${r.location}`,
          detail: r.action,
          meta: `${r.days_here} days · ${Number(r.quantity || 0).toLocaleString()} ${r.uom ?? ""}`,
          action: "Move it, sell it, or record a disposition.",
          drill: "issue_aging",
        })),
    };
  }
  if (/yield|harvest|grow|room|plant|gram/.test(t)) {
    const y = await grab("v_true_cost_per_pound", "*", "month_date", true, 6);
    return {
      headline: "Yield trend — the number that moves your cost per pound more than anything else.",
      rows: y.map((r) => ({
        label: `${r.month} — ${r.saleable_lbs} saleable lb`,
        detail: `${r.harvests} harvests · ${r.plants_harvested} plants · ${r.wet_lbs} wet lb`,
        meta: `${r.wet_to_saleable_pct}% conversion · ${r.grams_per_plant} g/plant`,
        action: "Open True Cost Per Pound",
        drill: "true_cost_per_pound",
      })),
    };
  }
  if (/alloc|approv|vincent|request/.test(t)) {
    const a = await grab("v_awaiting_allocation", "*", "days_in_system", true, 10);
    return {
      headline: `${a.length} materials carrying no approved allocation.`,
      rows: a.map((r) => ({
        label: `${r.item} · ${r.material_class}`,
        detail: r.approval_state,
        meta: `${Number(r.quantity || 0).toLocaleString()} ${r.uom} · ${r.days_in_system} days · ${r.location}`,
        action: "Raise a request or approve the pending one.",
        drill: "issue_no_allocation",
      })),
    };
  }
  const b = await grab("v_intelligence_briefing", "*", null, false, 10);
  return {
    headline: "Here's my whole desk. Ask me about money, schedule, testing, aging stock, yield or allocation.",
    rows: b.map((r) => ({
      label: `${r.agent} — ${r.findings} open`,
      detail: r.areas || "",
      meta: `${r.severity}${r.dollars_at_stake ? ` · ${usd(r.dollars_at_stake)}` : ""}`,
      action: "Open Intelligence Findings",
      drill: "agent_findings",
    })),
  };
}

export function BudzScreen({ go }) {
  const [log, setLog] = useState([{ who: "budz", text: BUDZ_INTRO }]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);
  const ask = async (text) => {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    setLog((l) => [...l, { who: "me", text: question }]);
    setQ("");
    setBusy(true);
    try {
      const a = await budzAnswer(question);
      setLog((l) => [...l, { who: "budz", text: a.headline, rows: a.rows }]);
    } catch (e) {
      setLog((l) => [...l, { who: "budz", text: `Couldn't pull that: ${String(e).slice(0, 140)}` }]);
    }
    setBusy(false);
  };
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Budz</h1>
          <div className="sub">
            Your agent on the floor. He reads Metrc, the rooms, the schedule and the money, and answers from live
            records — never a guess.
          </div>
        </div>
      </div>
      <div className="budzwrap">
        <div className="budzstage">
          <BudzAvatar mood={busy ? "thinking" : "idle"} size={170} />
          <div className="budzname">
            BUDZ<span>live on the floor</span>
          </div>
        </div>
        <div className="budzchat">
          <div className="budzlog">
            {log.map((m, i) => (
              <div key={i} className={`budzmsg ${m.who}`}>
                <div className="budztext">{m.text}</div>
                {m.rows?.length > 0 && (
                  <div className="budzrows">
                    {m.rows.slice(0, 8).map((r, j) => (
                      <button key={j} className="budzrow" onClick={() => r.drill && go(r.drill)}>
                        <span className="brh">{r.label}</span>
                        {r.detail && <span className="brd">{r.detail}</span>}
                        <span className="brf">
                          {r.meta}
                          {r.action ? ` — ${r.action}` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="budzmsg budz">
                <div className="budztext">Pulling the records…</div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="budzchips">
            {BUDZ_CHIPS.map((c) => (
              <button key={c} className="budzchip" onClick={() => ask(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="budzask">
            <input
              placeholder="Ask Budz anything about the operation…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
            />
            <button className="btn" onClick={() => ask()} disabled={busy}>
              Ask
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- Chief Executive Dashboard: proof, owner, cause, fix, recommendation ---------- */
export function CeoDashboard({ go }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    (async () => {
      const [find, loss, cost, late, custody, aging, alloc, custp] = await Promise.all([
        supabase.from("agent_findings").select("*").is("resolved_at", null).order("dollars", { ascending: false }).limit(400),
        supabase.from("v_real_loss_summary").select("*"),
        supabase.from("v_yield_versus_industry").select("*").limit(8),
        supabase.from("v_late_violations").select("*").limit(300),
        supabase.from("v_custody_alerts").select("*").limit(300),
        supabase.from("v_inventory_aging").select("*").not("severity", "is", null).limit(600),
        supabase.from("v_awaiting_allocation").select("*").limit(1200),
        supabase.from("v_custody_compliance").select("*").eq("category", "ALL TRACKED INVENTORY").maybeSingle(),
      ]);
      setD({
        find: find.data ?? [],
        loss: loss.data ?? [],
        cost: cost.data ?? [],
        late: (late.data ?? []).filter((r) => String(r.rule_verdict || "").startsWith("VIOLATION")),
        custody: custody.data ?? [],
        aging: aging.data ?? [],
        alloc: alloc.data ?? [],
        custp: custp.data,
      });
    })();
  }, []);
  if (!d) return <div className="empty"><div className="eicon">◐</div>Reading the company…</div>;

  const usd = (n) => "$" + Math.round(Number(n || 0)).toLocaleString();
  const money = d.loss.reduce((a, r) => a + Number(r.dollars_at_target_cost || 0), 0);
  const c0 = d.cost[0];
  const cBest = [...d.cost].sort((a, b) => (b.our_conversion_pct || 0) - (a.our_conversion_pct || 0))[0];

  const KPIS = [
    { t: "Genuine loss to date", v: usd(money), s: "excludes routine trim waste", hot: money > 0 },
    { t: "Latest conversion", v: c0 ? `${c0.our_conversion_pct}%` : "—", s: c0 ? `${c0.month} · ${c0.saleable_lbs} saleable lb` : "", hot: c0 && cBest && c0.our_conversion_pct < cBest.our_conversion_pct * 0.8 },
    { t: "Best month on record", v: cBest ? `${cBest.our_conversion_pct}%` : "—", s: cBest ? `${cBest.month} · ${cBest.our_grams_per_plant} g/plant` : "" },
    { t: "Schedule violations", v: d.late.length, s: "early is fine, late never is", hot: d.late.length > 0 },
    { t: "Compliance flags", v: d.custody.length, s: "live from Metrc", hot: d.custody.length > 0 },
    { t: "Capital sitting", v: d.aging.length, s: "aging items flagged", hot: d.aging.length > 0 },
    { t: "Unallocated material", v: d.alloc.length, s: "no approved destination", hot: d.alloc.length > 0 },
    { t: "Custody proof", v: d.custp ? `${d.custp.location_known_pct}%` : "—", s: d.custp ? `${d.custp.items} items located` : "" },
  ];

  const CARDS = [
    {
      sev: c0 && cBest && c0.our_conversion_pct < cBest.our_conversion_pct * 0.8 ? "critical" : "elevated",
      title: "Yield conversion is the biggest lever on cost per pound",
      metric: c0 ? `${c0.our_conversion_pct}% conversion` : "—",
      proof: d.cost
        .slice(0, 5)
        .map((r) => `${r.month}: ${r.saleable_lbs} saleable lb from ${r.plants_harvested} plants — ${r.our_conversion_pct}% conversion (industry average ${r.industry_average_pct}%), ${r.our_grams_per_plant} g/plant (industry average ${r.industry_average_grams_per_plant} g), ${r.our_plants_per_pound} plants per saleable pound — ${r.industry_verdict}`)
        .join("  ·  "),
      who: "Cultivation and post-harvest",
      when: c0 ? `Latest month recorded: ${c0.month}` : "—",
      plain: c0
        ? `In plain English: last month you put ${c0.plants_harvested} plants through the rooms and kept ${c0.saleable_lbs} saleable pounds out of ${c0.wet_lbs} wet pounds — ${c0.our_conversion_pct}%. A state-of-the-art indoor facility averages about ${c0.industry_average_pct}%, good rooms run ${c0.industry_good_pct}%, and your own best month was ${c0.our_best_month_pct}%. Each plant gave ${c0.our_grams_per_plant} grams against an industry average near ${c0.industry_average_grams_per_plant} grams, so it took ${c0.our_plants_per_pound} plants to make one saleable pound instead of about ${c0.industry_average_plants_per_pound}. Verdict: ${c0.industry_verdict}.`
        : "Not enough months recorded yet to compare against the industry.",
      improve: [
        "Weigh wet at takedown the same way every time — a wet weight recorded high makes conversion look worse than it is, and a wet weight recorded low hides a real loss. One scale, one method, one person accountable.",
        "Hold the dry to the ten to fourteen day window. Over-drying burns off saleable weight permanently; rushing it forces moisture-driven re-trim losses later.",
        "Trim to a written standard, not to preference. Aggressive trimming is the single largest controllable loss between wet and saleable.",
        "Keep the smalls and B buds as saleable product rather than sweeping them into waste — record grade A, B, C and trim separately in Weights and Grading so the split is visible.",
        "Compare the best month room by room against the worst. Same rooms, same plant count, wildly different output means the difference is practice, not genetics.",
      ],
      why: "Cost per pound is period operating cost divided by saleable pounds. Plant count barely changes month to month, so every point of conversion lost raises the cost of every pound you do sell.",
      fix: "Compare the best and worst months room by room. Check drying duration, trim practice, and whether wet weight is being recorded consistently at takedown. Conversion percentage is the single number to move.",
      rec: "Set a minimum wet-to-saleable conversion target and let the agents alert below it. Recovering the gap between your worst and best month is worth more than any other cultivation change.",
      fixReport: "room_best_vs_worst",
      fixReportLabel: "See the fix — room best versus worst",
      steps: [
        "Open the fix report. It lists every room with the best conversion it has ever achieved next to its worst month, and what that gap cost.",
        "Pick the room with the largest dollar figure. That is where the money is.",
        "Look at the dry days column on the best month versus the worst month for that room. If the best month dried longer or shorter, that is your first variable.",
        "Give the cultivation lead the best month as the target: name the room, the month, the conversion percentage and the dry days. Ask them to reproduce it.",
        "Record grade A, B, C and trim separately in Weights and Grading from the next harvest so the split is visible instead of assumed.",
        "Re-run this report after the next two harvests in that room and compare. The Forensic Audit will show whether it improved or got worse.",
      ],
      drill: "issue_yield_gap",
    },
    {
      sev: d.late.length ? "critical" : "good",
      title: `${d.late.length} schedule violations against the zero-tolerance rule`,
      metric: `${d.late.length} violations`,
      proof: d.late.slice(0, 5).map((r) => `${r.event_type} in ${r.room || "a room"}: ${r.rule_verdict}, scheduled ${r.scheduled_date}`).join("  ·  ") || "No violations recorded.",
      who: "Cultivation scheduling",
      when: "Live against the eight-week calendar",
      why: "A late pull pushes the next planting in that room. It compounds — one late harvest costs the room its next turn, and the cost of an idle room is the most expensive loss in cultivation.",
      fix: "Weekend crew or a second shift, never a slipped date. Weekend Watch names which upcoming pulls and dry deadlines land on a Saturday or Sunday so coverage is planned in advance.",
      rec: "Review every violation with the cultivation lead weekly. Early is acceptable; late is not.",
      fixReport: "weekend_watch",
      fixReportLabel: "See which upcoming dates need a crew",
      steps: [
        "Open the weekend report. It names every upcoming pull and dry deadline that lands on a Saturday or Sunday.",
        "For each one, decide now: weekend crew or second shift. The date does not move.",
        "Tell the cultivation lead the specific dates and the coverage decision, in writing.",
        "Open the violations list and go through each past violation with them one at a time — the room, the scheduled date, and how many days it slipped.",
        "Make clear that early is acceptable and late is not, so there is no ambiguity about the standard.",
        "The Forensic Audit runs every Monday and will show whether violations went up or down since the last review.",
      ],
      drill: "issue_late",
    },
    {
      sev: money > 0 ? "critical" : "good",
      title: `${usd(money)} in genuine loss — not routine trim`,
      metric: usd(money),
      proof: d.loss.map((r) => `${r.loss_type}: ${r.occurrences} occurrences, ${r.pounds_affected} lb, ${usd(r.dollars_at_target_cost)}`).join("  ·  ") || "No genuine loss detected.",
      who: "Cultivation and Quality",
      when: "All recorded history",
      why: "This counts only real loss: harvests converting far below your own average, product that failed testing, plants retired without producing, and pulls that never happened. Stem and fan leaf waste is deliberately excluded because it is already inside your cost per pound — charging it again double counts.",
      fix: "Work the underperforming harvests first; they are the largest number and the most recoverable. Failed testing needs a remediate-or-destroy decision recorded in Metrc.",
      rec: "Treat conversion shortfall as the primary cultivation metric, not total waste weight.",
      drill: "real_loss_summary",
    },
    {
      sev: d.custody.length ? "critical" : "good",
      title: `${d.custody.length} compliance flags live in Metrc`,
      metric: `${d.custody.length} flags`,
      proof: d.custody.slice(0, 5).map((r) => `${r.flag}: ${r.item} (${r.quantity ?? ""} ${r.uom ?? ""}) in ${r.location || "unknown"}`).join("  ·  ") || "Nothing flagged.",
      who: "Quality and Compliance",
      when: "Rechecked every twenty minutes and logged permanently",
      why: "These are the items that would fail an inspection today: failed testing left in inventory, holds, lineage breaks, and manifests the receiver never confirmed.",
      fix: "Each flag names the exact record. Resolve it in Metrc and the flag clears itself on the next sweep.",
      rec: "Clear every critical flag before any regulator visit. The permanent log shows when each was raised and when it closed — that history is your defence.",
      fixReport: "custody_alerts",
      fixReportLabel: "See every flag with its record",
      steps: [
        "Open the flag list. Each row names the exact package tag, item, quantity and location.",
        "For anything marked failed testing: decide remediation or destruction. Remediation means re-processing and retesting; destruction means recording it as destroyed in Metrc with a reason.",
        "In Metrc, open Packages, find the tag, and record the disposition you decided. Nothing clears until it is recorded there.",
        "For anything marked on hold: open the package in Metrc and find why the hold was placed, then resolve it with the state or your compliance contact.",
        "For manifests never confirmed received: contact the receiving facility and ask them to accept it in Metrc, or void and reissue the manifest.",
        "The flags clear themselves automatically on the next sweep, within twenty minutes, and the permanent log records when each was raised and closed.",
      ],
      drill: "issue_failed_testing",
    },
    {
      sev: d.aging.length ? "elevated" : "good",
      title: `${d.aging.length} items of capital sitting too long`,
      metric: `${d.aging.length} items`,
      proof: d.aging.slice(0, 5).map((r) => `${r.item} in ${r.location}: ${r.days_here} days — ${r.action}`).join("  ·  ") || "Nothing aging.",
      who: "Inventory and Fulfilment",
      when: "Live",
      why: "Every day packaged product sits is cash on a shelf instead of in the bank, and shelf life is finite.",
      fix: "Prioritise the oldest for sale, or record a disposition decision against it.",
      rec: "Set a maximum days-on-hand policy by product type and let the agents police it automatically.",
      fixReport: "issue_aging",
      fixReportLabel: "See every aging item, oldest first",
      steps: [
        "Open the aging list. It is sorted worst first with the days each item has been sitting.",
        "Anything over ninety days: decide today whether it is sold, discounted, or written off.",
        "Anything waiting on a laboratory result more than seven days: call the laboratory and get a date.",
        "Anything that failed testing: it belongs in the compliance fix above, not here.",
        "Set a maximum days-on-hand figure per product type and tell the assistant — the agents will police it automatically from then on.",
      ],
      drill: "issue_aging",
    },
    {
      sev: d.alloc.length ? "elevated" : "good",
      title: `${d.alloc.length} materials with no approved allocation`,
      metric: `${d.alloc.length} items`,
      proof: `${d.alloc.length} items across every material class sit in the production tracker with no approved destination. No allocation can be approved until an approver account exists.`,
      who: "Vincent as approver; cultivation and production as requesters",
      when: "Live",
      why: "Your rule is that every material — grown or bought from a third party — needs an approved allocation before it moves. Without it, material moves on memory instead of authority.",
      fix: "Create Vincent's account and assign him the executive role, then decide the pending requests on the Allocation Requests page. Denials require a written reason.",
      rec: "Do this first. The allocation engine, margin ranking and turnaround policing all wait on a real approver.",
      fixReport: "issue_no_allocation",
      fixReportLabel: "See every unallocated item",
      steps: [
        "Have Vincent create an account on the platform using the sign up screen.",
        "As owner, open Settings then Menu Visibility by Role, and assign Vincent the executive role so he can approve.",
        "Open Allocation Requests. Anything staff have submitted appears there with a Decide button.",
        "Approve, approve a partial quantity, or deny. A denial needs a written reason of at least fifteen characters — that is enforced, so the requester always knows why.",
        "Tell cultivation and production that no material moves without an approved allocation from now on.",
        "This list shrinks as requests are approved, and the audit tracks the number every week.",
      ],
      drill: "issue_no_allocation",
    },
  ];

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Chief Executive Dashboard</h1>
          <div className="sub">
            What the watching agents found, the proof behind it, who owns it, why it matters, how to fix it and what I
            recommend. Owner and executive only.
          </div>
        </div>
        <button className="btn" onClick={() => go("budz")}>
          Ask Budz
        </button>
      </div>
      <div className="qcards dashgrid" style={{ marginTop: 0 }}>
        {KPIS.map((k) => (
          <div key={k.t} className="qcard dwc">
            <span className="dwbody" style={{ cursor: "default" }}>
              <span className="qt">{k.t}</span>
              <span className={`qn ${k.hot ? "hot" : ""}`}>{k.v}</span>
              <span className="note">{k.s}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="ceogrid">
        {CARDS.map((c) => (
          <div key={c.title} className={`ceocard ${c.sev}`}>
            <div className="ceohead">
              <span className={`schip ${c.sev === "critical" ? "bad" : c.sev === "elevated" ? "hot" : "good"}`}>{c.sev}</span>
              <span className="ceometric">{c.metric}</span>
            </div>
            <h3>{c.title}</h3>
            <div className="ceosec">
              <label>The proof</label>
              <p>{c.proof}</p>
            </div>
            {c.plain && (
              <div className="ceosec plain">
                <label>What this means in plain English</label>
                <p>{c.plain}</p>
              </div>
            )}
            {c.improve?.length > 0 && (
              <div className="ceosec">
                <label>What to do to improve it</label>
                <ol className="ceosteps">
                  {c.improve.map((x, i) => <li key={i}>{x}</li>)}
                </ol>
              </div>
            )}
            <div className="ceorow">
              <span>
                <label>Who owns it</label>
                <p>{c.who}</p>
              </span>
              <span>
                <label>When</label>
                <p>{c.when}</p>
              </span>
            </div>
            <div className="ceosec">
              <label>Why it matters</label>
              <p>{c.why}</p>
            </div>
            <div className="ceosec">
              <label>How to fix it</label>
              <p>{c.fix}</p>
            </div>
            <div className="ceosec rec">
              <label>My recommendation</label>
              <p>{c.rec}</p>
            </div>
            {c.steps?.length > 0 && (
              <details className="ceosteps-box">
                <summary>Step by step — hand this to your team</summary>
                <ol className="ceosteps">
                  {c.steps.map((x, i) => <li key={i}>{x}</li>)}
                </ol>
              </details>
            )}
            <div className="ceobtns">
              <button className="btn small" onClick={() => go(c.drill)}>Open only these issues</button>
              {c.fixReport && (
                <button className="btn small ghost" onClick={() => go(c.fixReport)}>
                  {c.fixReportLabel ?? "See the fix"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
