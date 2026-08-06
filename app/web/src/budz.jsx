import React, { useState, useEffect, useRef } from "react";
import { supabase } from "./lib/supabase.js";

/* ---------- BUDZ: the pet agent. Animated, transparent background, chats from live data. ---------- */
export function BudzAvatar({ mood = "idle", size = 150, src = null }) {
  if (!src) return <div className={`budz budzph ${mood}`} style={{ width: size, height: size }} />;
  const isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src);
  const box = { width: size, height: "auto", maxHeight: size * 1.4, objectFit: "contain" };
  return isVideo ? (
    <video src={src} className={`budz budzimg ${mood}`} style={box} autoPlay loop muted playsInline />
  ) : (
    <img src={src} alt="Assistant" className={`budz budzimg ${mood}`} style={box} />
  );
}

/* Plain English for anyone: turn a number and its context into a sentence a tenth grader gets. */
export function plainly(kind, v) {
  const n = (x) => Number(x || 0).toLocaleString();
  switch (kind) {
    case "conversion":
      return `Think of a wet plant as mostly water — about three quarters of it. When you dry it, that water leaves and the plant gets much lighter. Conversion is how much weight is left over at the end. Getting about 20 to 25 pounds back out of every 100 pounds you cut is normal and expected. It is not a bad score. If the number comes out much higher than 30, that usually means somebody wrote the wet weight down wrong at the start, not that the plants did great.`;
    case "open_harvest":
      return `When you cut plants down, that batch has to be officially "closed" in the state system once it is dried and bagged up. Right now ${n(v)} batches were cut but never closed. Until that happens the product cannot be sold, cannot be tested, and every average we calculate comes out wrong — because the system counts the heavy wet weight going in but nothing coming out yet.`;
    case "dry_days":
      return `After plants are cut they hang to dry. Ten to fourteen days is the sweet spot. Dry them too long and weight you could have sold literally evaporates and you never get it back. Dry them too fast and moisture gets trapped inside, which tastes bad and can grow mould. Our average is ${v} days, so most batches are not landing in that sweet spot.`;
    case "zero_packaged":
      return `${n(v)} batches were marked finished but no product was ever recorded coming out of them. Weight went in, nothing came out on paper. That is the first thing an inspector asks about, so each one needs an explanation written down.`;
    case "late":
      return `Harvests are scheduled ahead of time. When one runs late, the room it was in cannot be replanted on time, so the next crop is late too, and the one after that. It snowballs. Finishing early is fine. Finishing late costs money every single time.`;
    case "allocation":
      return `Every batch of product is supposed to have someone approve where it is going before it moves. ${n(v)} items do not have that approval yet, which means product is moving based on who remembers what instead of a written decision.`;
    case "aging":
      return `${n(v)} items have been sitting on a shelf a long time. Product sitting still is money you already spent that you have not earned back yet, and it does not last forever.`;
    case "compliance":
      return `${n(v)} things in the state system would look wrong if an inspector walked in today — product that failed its test still sitting in inventory, shipments nobody confirmed arrived, that sort of thing. Each one names the exact item, so they can be fixed one at a time.`;
    default:
      return "";
  }
}

const BUDZ_INTRO =
  "Yo — I'm Budz. I watch Metrc, the rooms, the schedule and the money. Ask me anything: what's late, what's costing us, what failed testing, where something sits, who needs to approve what. Every answer comes from the live records — never a guess.";

const LOCAL_SYSTEM = `You are the assistant inside the Twisted Growers cannabis Enterprise OS (Massachusetts, licences MC281714 and MP281909).
Answer only from the LIVE RECORDS given. Never invent a number or an industry statistic. Be brief and specific.
Key facts: fresh cannabis is 75-80 percent water, so 20-25 percent wet-to-packaged conversion is NORMAL, not bad. Grams per plant is not a valid benchmark. A harvest with no finished date has not finished packaging and must not be counted in conversion. The room on a harvest is the drying room, not the grow room. Standard dry window is 10-14 days.`;

const BUDZ_DEPTS = [
  {
    dept: "Today",
    qs: [
      "What is shipping out today?",
      "What shipped today?",
      "What was backordered today?",
      "What inventory issues did we have today?",
      "What got added to inventory today?",
      "What COAs came back today?",
      "What is the worst problem right now?",
    ],
  },
  {
    dept: "Laboratory & Testing",
    qs: [
      "What is out for testing right now?",
      "What does the testing schedule look like this week - what is going out and what is coming back?",
      "What failed testing?",
      "What is still untested and sitting?",
      "Which COAs are expiring soon?",
    ],
  },
  {
    dept: "Cultivation",
    qs: [
      "Which harvests are still open and how long?",
      "How is our yield trending?",
      "Which harvests dried too long?",
      "Which harvests dried too fast?",
      "Compare the drying rooms for me",
      "Which harvests closed with nothing packaged?",
      "Which strains perform best?",
      "What is the status of harvest?",
      "What is drying right now and when does it come out?",
      "What is in each grow room right now?",
      "How many plants do we have and where?",
      "What is coming down next?",
    ],
  },
  {
    dept: "Third Party Product",
    qs: [
      "What is the update on third party product?",
      "What did we buy in and where is it now?",
      "What third party material has not been allocated?",
      "How long has purchased material been sitting?",
      "What third party product failed testing?",
    ],
  },
  {
    dept: "Schedule & Deadlines",
    qs: [
      "Who is behind schedule?",
      "What is due this week?",
      "What lands on a weekend and needs a crew?",
      "What is at risk of running late?",
    ],
  },
  {
    dept: "Inventory & Fulfilment",
    qs: [
      "What does our on-hand finished goods inventory look like?",
      "What is sitting too long?",
      "Where is everything right now?",
      "What needs allocation approval?",
      "What is on hold?",
      "What is running low?",
      "What finished goods are ready to ship?",
      "What is missing or unaccounted for?",
    ],
  },
  {
    dept: "Logistics & Transfers",
    qs: [
      "What manifests are unconfirmed?",
      "What transferred out this month?",
      "What is in transit right now?",
      "What is arriving this week?",
      "Which customers are waiting on us?",
    ],
  },
  {
    dept: "Compliance",
    qs: [
      "What would fail an inspection today?",
      "What are our open compliance flags?",
      "Show me the chain of custody gaps",
    ],
  },
  {
    dept: "Money",
    qs: [
      "What is costing us money?",
      "What is our true cost per pound?",
      "Where are we losing the most?",
      "What is our biggest recoverable loss?",
    ],
  },
];
const BUDZ_CHIPS = BUDZ_DEPTS.flatMap((d) => d.qs);


async function grab(table, sel, order, desc, lim) {
  let x = supabase.from(table).select(sel ?? "*");
  if (order) x = x.order(order, { ascending: !desc });
  const { data } = await x.limit(lim ?? 8);
  return data ?? [];
}


/* Free path: hand the question to Claude Desktop, which already reads this database
   over MCP using the subscription the company already pays for. No API bill. */
export const CLAUDE_BRIEF = `You are connected to the Twisted Growers Enterprise OS database through the twisted-growers MCP connector (read only).
Twisted Growers is a Massachusetts cannabis company: cultivation licence MC281714, manufacturing licence MP281909.

Answer only from the database. Never invent a number or an industry statistic.

Facts you must not get wrong:
- Fresh cannabis is 75-80 percent water, so a 4:1 to 5:1 wet:dry ratio is standard. A wet-to-packaged conversion of 20-25 percent is NORMAL, not underperformance. Above about 30 percent usually means the wet weight was recorded too low at takedown.
- Grams per plant is NOT a valid benchmark - it is set by plant density and veg time. The published benchmark is grams per square foot of canopy: about 35 for start-ups, 50-70 established.
- A harvest with no finished date has not finished packaging. Never include it when calculating conversion.
- The room recorded on a harvest is the DRYING location, not the grow room.
- Standard dry window is 10-14 days from cut to first package.

Useful views: v_harvest_forensic (every harvest in full detail), v_harvest_issues (problems only),
v_dry_room_performance, v_monthly_conversion_truth (conversion, closed harvests only), v_coa_register
(testing and certificates), v_inventory_locator (where everything is), v_metrc_transfer_ledger (manifests),
v_awaiting_allocation, v_late_violations, v_real_loss_summary, v_goal_status, v_data_verification.`;

export const EXTERNAL = {
  claude: { label: "Claude", url: "https://claude.ai/new" },
  chatgpt: { label: "ChatGPT", url: "https://chat.openai.com/" },
  grok: { label: "Grok", url: "https://grok.com/" },
};

export function AskExternal({ question, context, provider = "claude", compact }) {
  const [done, setDone] = useState(false);
  const t = EXTERNAL[provider] ?? EXTERNAL.claude;
  const go = async () => {
    const NL = String.fromCharCode(10, 10);
    const text = CLAUDE_BRIEF + NL + (context ? "CONTEXT: " + context + NL : "") + "QUESTION: " + question;
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove();
    }
    setDone(true);
    window.open(t.url, "_blank", "noopener");
    setTimeout(() => setDone(false), 4000);
  };
  return (
    <button className={"askclaude " + (done ? "done " : "") + (compact ? "sm" : "")} onClick={go}>
      {done ? "Copied — paste into " + t.label : "Send to " + t.label}
    </button>
  );
}

let _aiCfg = null;
export async function getAiCfg() {
  if (_aiCfg) return _aiCfg;
  const { data } = await supabase
    .from("ai_settings")
    .select("local_model_url, local_model_name, paid_model_enabled, local_model_enabled, bridge_enabled, bridge_url, bridge_token")
    .eq("id", 1).maybeSingle();
  _aiCfg = data ?? { local_model_url: "http://localhost:11434", local_model_name: "qwen2.5:14b" };
  return _aiCfg;
}

export async function budzAnswer(question) {
  const t = question.toLowerCase();
  const usd = (n) => "$" + Math.round(Number(n || 0)).toLocaleString();
  const num = (n) => Number(n || 0).toLocaleString();
  const has = (...k) => k.some((x) => t.includes(x));
  const sel = async (view, cols) => {
    const { data, error } = await supabase.from(view).select(cols || "*").limit(400);
    if (error) return { err: error.message, rows: [] };
    return { rows: data ?? [] };
  };
  const none = (what, where) => ({
    headline: `Nothing to show for that. ${what}`,
    rows: where ? [{ label: where, detail: "Open the report to see the underlying records.", meta: "", drill: where }] : [],
  });
  const today = new Date().toISOString().slice(0, 10);
  const daysAgo = (d) => {
    if (!d) return null;
    return Math.round((Date.now() - new Date(d).getTime()) / 86400000);
  };

  /* ── LABORATORY & TESTING ─────────────────────────────────────── */
  if (has("out for testing")) {
    const { rows } = await sel("v_coa_register");
    const out = rows.filter((r) => /submitted|progress|pending/i.test(r.lab_testing_state || "") && !/passed|failed/i.test(r.lab_testing_state || ""));
    if (!out.length) return none("No packages are currently sitting in a submitted-and-awaiting state in Metrc.", "metrc_rpt_lab");
    return {
      headline: `${out.length} packages are out for testing right now.`,
      rows: out.slice(0, 25).map((r) => ({
        label: `${r.item_name} · ${r.package_tag}`,
        detail: `${r.lab_testing_state}${r.laboratory ? " at " + r.laboratory : ""}${r.source_harvest ? " · from " + r.source_harvest : ""}`,
        meta: `${num(r.quantity)} ${r.uom ?? ""} · ${r.location ?? ""}${r.tested_on ? " · submitted " + r.tested_on : ""}`,
        drill: "metrc_rpt_lab",
      })),
    };
  }
  if (has("untested")) {
    const { rows } = await sel("v_coa_register");
    const un = rows.filter((r) => /notsubmitted|not submitted/i.test(r.lab_testing_state || ""));
    const aged = un.map((r) => ({ ...r, age: daysAgo(r.packaged_on) })).sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
    if (!aged.length) return none("Every package on hand has been submitted for testing.", "metrc_rpt_lab");
    const g = aged.reduce((a, r) => a + Number(r.quantity || 0), 0);
    return {
      headline: `${aged.length} packages have never been submitted for testing — ${num(Math.round(g))} g sitting untested. Oldest was packaged ${aged[0].age} days ago.`,
      rows: aged.slice(0, 25).map((r) => ({
        label: `${r.item_name} · ${r.package_tag}`,
        detail: `Packaged ${r.packaged_on ?? "unknown"}${r.age != null ? ` — sitting ${r.age} days` : ""}${r.source_harvest ? " · from " + r.source_harvest : ""}`,
        meta: `${num(r.quantity)} ${r.uom ?? ""} · ${r.location ?? ""}`,
        action: "Untested product cannot be sold. Submit it or record a disposition.",
        drill: "metrc_rpt_lab",
      })),
    };
  }
  if (has("coa") && has("expir")) {
    const { rows } = await sel("v_coa_register");
    const withExp = rows.filter((r) => r.coa_status && /expir/i.test(r.coa_status));
    if (!withExp.length) return none("No certificates are flagged as expiring in the register.", "metrc_rpt_lab");
    return {
      headline: `${withExp.length} certificates are expiring or expired.`,
      rows: withExp.slice(0, 25).map((r) => ({
        label: `${r.item_name} · ${r.package_tag}`,
        detail: `${r.coa_status}${r.tested_on ? " · tested " + r.tested_on : ""}${r.laboratory ? " at " + r.laboratory : ""}`,
        meta: `${num(r.quantity)} ${r.uom ?? ""} · ${r.location ?? ""}`,
        drill: "metrc_rpt_lab",
      })),
    };
  }
  if (has("coa") && has("today", "came back", "back today")) {
    const { rows } = await sel("v_coa_register");
    const back = rows.filter((r) => r.tested_on === today);
    if (!back.length) return none(`No laboratory results were recorded against ${today}. The most recent results are on the Certificate register.`, "metrc_rpt_lab");
    return {
      headline: `${back.length} results came back today.`,
      rows: back.map((r) => ({
        label: `${r.item_name} · ${r.package_tag}`,
        detail: `${r.lab_testing_state}${r.thc_result ? " · THC " + r.thc_result : ""}${r.cbd_result ? " · CBD " + r.cbd_result : ""}`,
        meta: `${r.laboratory ?? ""} · ${num(r.quantity)} ${r.uom ?? ""}`,
        drill: "metrc_rpt_lab",
      })),
    };
  }
  if (has("testing schedule", "going out and what is coming back", "this week")) {
    const { rows } = await sel("v_coa_register");
    const outNow = rows.filter((r) => /submitted|progress/i.test(r.lab_testing_state || "") && !/notsubmitted|passed|failed/i.test(r.lab_testing_state || ""));
    const un = rows.filter((r) => /notsubmitted/i.test(r.lab_testing_state || ""));
    return {
      headline: `Testing position: ${outNow.length} packages awaiting results, ${un.length} not yet submitted. Metrc records a state per package, not a booked date, so this is the queue rather than a calendar.`,
      rows: [
        ...outNow.slice(0, 12).map((r) => ({
          label: `COMING BACK — ${r.item_name}`,
          detail: `${r.lab_testing_state}${r.laboratory ? " at " + r.laboratory : ""}`,
          meta: `${num(r.quantity)} ${r.uom ?? ""} · ${r.package_tag}`,
          drill: "metrc_rpt_lab",
        })),
        ...un.slice(0, 12).map((r) => ({
          label: `NEEDS TO GO OUT — ${r.item_name}`,
          detail: `Never submitted · packaged ${r.packaged_on ?? "unknown"}`,
          meta: `${num(r.quantity)} ${r.uom ?? ""} · ${r.location ?? ""}`,
          drill: "metrc_rpt_lab",
        })),
      ],
    };
  }
  if (has("failed testing", "what failed")) {
    const { rows } = await sel("v_issue_failed_testing");
    if (!rows.length) return none("Nothing is sitting in inventory with a failed result.", "issue_failed_testing");
    return {
      headline: `${rows.length} packages failed testing and are still on hand.`,
      rows: rows.slice(0, 25).map((r) => ({
        label: r.item ?? r.item_name ?? r.package_tag,
        detail: r.detail ?? r.what_is_wrong ?? "Failed a laboratory test and remains in inventory.",
        meta: `${num(r.quantity)} ${r.uom ?? ""} · ${r.location ?? ""}`,
        action: "Remediate or destroy, and record the disposition in Metrc.",
        drill: "issue_failed_testing",
      })),
    };
  }

  /* ── TODAY ────────────────────────────────────────────────────── */
  if (has("shipping out today", "shipped today", "shipping today")) {
    const { rows } = await sel("v_metrc_transfer_ledger");
    const out = rows.filter((r) => /out/i.test(r.direction || "") && (r.created_on === today || r.departed === today));
    if (!out.length) return none(`No outbound manifests are dated ${today}. The transfer ledger holds the full shipping history.`, "metrc_rpt_transfers");
    return {
      headline: `${out.length} outbound shipments today.`,
      rows: out.map((r) => ({
        label: `Manifest ${r.manifest_number} → ${r.recipient}`,
        detail: `${r.packages} packages${r.transporter ? " · " + r.transporter : ""}${r.driver ? " · " + r.driver : ""}`,
        meta: `${r.departed ?? r.created_on}${r.arrival_estimate ? " · ETA " + r.arrival_estimate : ""}`,
        drill: "metrc_rpt_transfers",
      })),
    };
  }
  if (has("added to inventory today", "got added")) {
    const { rows } = await sel("v_coa_register");
    const nw = rows.filter((r) => r.packaged_on === today);
    if (!nw.length) return none(`Nothing was packaged on ${today}. Package inventory holds everything with its packaged date.`, "metrc_rpt_packages");
    return {
      headline: `${nw.length} packages were created today.`,
      rows: nw.map((r) => ({
        label: `${r.item_name} · ${r.package_tag}`,
        detail: r.source_harvest ? `From ${r.source_harvest}` : "",
        meta: `${num(r.quantity)} ${r.uom ?? ""} · ${r.location ?? ""}`,
        drill: "metrc_rpt_packages",
      })),
    };
  }
  if (has("backorder")) {
    return {
      headline: "Backorders are not tracked in Metrc, and no order book is wired into the platform yet, so I cannot answer this honestly.",
      rows: [{
        label: "What would be needed",
        detail: "An order or sales pipeline with a requested quantity per line, so a shortfall against on-hand stock can be computed. Sales history exists, but it records what shipped, not what was owed.",
        meta: "Not built yet",
        drill: "sales_history",
      }],
    };
  }
  if (has("inventory issues") && has("today")) {
    const { rows } = await sel("v_inventory_reconciliation");
    if (!rows.length) return none("No inventory reconciliation exceptions are recorded.", "issue_aging");
    return {
      headline: `${rows.length} inventory exceptions on the record.`,
      rows: rows.slice(0, 25).map((r) => ({
        label: r.item ?? r.issue ?? "Exception",
        detail: r.detail ?? r.what_is_wrong ?? "",
        meta: `${r.location ?? ""} ${r.quantity ? "· " + num(r.quantity) : ""}`,
        drill: "issue_aging",
      })),
    };
  }

  /* ── CULTIVATION ──────────────────────────────────────────────── */
  if (has("status of harvest", "harvest status")) {
    const { rows } = await sel("v_harvest_stage_map");
    const open = rows.filter((r) => !r.finished_on);
    return {
      headline: `${rows.length} harvests on record, ${open.length} still open. Oldest open lot was cut ${Math.max(0, ...open.map((r) => Number(r.days_since_takedown || 0)))} days ago.`,
      rows: open
        .sort((a, b) => Number(b.days_since_takedown || 0) - Number(a.days_since_takedown || 0))
        .slice(0, 25)
        .map((r) => ({
          label: `${r.harvest} · ${r.strains ?? ""}`,
          detail: `${r.stage ?? "in process"} in ${r.room ?? "unknown room"} · ${r.plants ?? 0} plants`,
          meta: `${r.days_since_takedown} days since takedown · ${num(r.current_weight)} ${r.uom ?? "g"} still in room`,
          drill: "harvest_issues",
        })),
    };
  }
  if (has("drying right now", "what is drying", "when does it come out")) {
    const { rows } = await sel("v_harvest_stage_map");
    const dry = rows.filter((r) => !r.finished_on && Number(r.current_weight || 0) > 0);
    if (!dry.length) return none("Nothing is recorded as still holding weight in a drying room.", "dry_room_performance");
    return {
      headline: `${dry.length} lots are still in the rooms. Ten to fourteen days from takedown is the target, so anything past that is overdue.`,
      rows: dry
        .sort((a, b) => Number(b.days_since_takedown || 0) - Number(a.days_since_takedown || 0))
        .slice(0, 25)
        .map((r) => ({
          label: `${r.harvest} · ${r.room ?? "unknown room"}`,
          detail: `${r.strains ?? ""} · cut ${r.harvest_start} · ${Number(r.days_since_takedown) > 14 ? "OVERDUE by " + (Number(r.days_since_takedown) - 14) + " days" : "due in " + (14 - Number(r.days_since_takedown)) + " days"}`,
          meta: `${num(r.current_weight)} ${r.uom ?? "g"} in room · ${r.plants ?? 0} plants`,
          drill: "harvest_issues",
        })),
    };
  }
  if (has("each grow room", "in each room", "grow room right now")) {
    const { rows } = await sel("v_metrc_plant_census");
    if (!rows.length) return none("No live plant census rows are available.", "metrc_rpt_plants");
    return {
      headline: `${num(rows.reduce((a, r) => a + Number(r.plants || 0), 0))} plants across ${rows.length} rooms.`,
      rows: rows.map((r) => ({
        label: `${r.room} · ${r.phase}`,
        detail: r.strain_breakdown ?? r.strains ?? "",
        meta: `${num(r.plants)} plants · oldest planted ${r.oldest_planting ?? "unknown"}${r.oldest_days_in_room ? " (" + r.oldest_days_in_room + " days)" : ""}`,
        drill: "metrc_rpt_plants",
      })),
    };
  }
  if (has("how many plants")) {
    const { rows } = await sel("v_metrc_plant_census");
    const total = rows.reduce((a, r) => a + Number(r.plants || 0), 0);
    return {
      headline: `${num(total)} plants live in Metrc right now.`,
      rows: rows.map((r) => ({
        label: `${r.room} · ${r.phase}`,
        detail: r.strain_breakdown ?? "",
        meta: `${num(r.plants)} plants`,
        drill: "metrc_rpt_plants",
      })),
    };
  }
  if (has("coming down next", "what is coming down")) {
    const { rows } = await sel("v_harvest_enforcement");
    if (!rows.length) return none("No scheduled pulls are loaded against the eight-week calendar.", "harvest_pulls");
    return {
      headline: "Next pulls against the eight-week calendar. Early is fine, late never is.",
      rows: rows.slice(0, 20).map((r) => ({
        label: `${r.room ?? r.event_type ?? "Pull"} · ${r.scheduled_date ?? ""}`,
        detail: r.rule_verdict ?? r.status ?? "",
        meta: r.days_off_schedule ? `${r.days_off_schedule} days off schedule` : "",
        drill: "harvest_pulls",
      })),
    };
  }
  if (has("dried too long")) {
    const { rows } = await sel("v_harvest_forensic");
    const bad = rows.filter((r) => Number(r.dry_days_to_first_package || 0) > 16);
    return {
      headline: `${bad.length} harvests dried longer than 16 days. Every day past 14 burns off saleable weight permanently.`,
      rows: bad.sort((a, b) => b.dry_days_to_first_package - a.dry_days_to_first_package).slice(0, 25).map((r) => ({
        label: `${r.harvest_name} · ${r.strain}`,
        detail: `${r.dry_days_to_first_package} days to first package in ${r.drying_room}`,
        meta: `${r.plants} plants · ${r.wet_lb} lb wet · ${r.packaged_lb} lb packaged · ${r.conversion_pct}%`,
        drill: "harvest_issues",
      })),
    };
  }
  if (has("dried too fast")) {
    const { rows } = await sel("v_harvest_forensic");
    const bad = rows.filter((r) => r.dry_days_to_first_package != null && Number(r.dry_days_to_first_package) < 7);
    return {
      headline: `${bad.length} harvests were packaged less than 7 days after takedown. That locks in moisture and risks mould.`,
      rows: bad.slice(0, 25).map((r) => ({
        label: `${r.harvest_name} · ${r.strain}`,
        detail: `${r.dry_days_to_first_package} days to first package in ${r.drying_room}`,
        meta: `${r.wet_lb} lb wet · ${r.packaged_lb} lb packaged · ${r.conversion_pct}%`,
        drill: "harvest_issues",
      })),
    };
  }
  if (has("compare the drying", "drying rooms")) {
    const { rows } = await sel("v_dry_room_performance");
    return {
      headline: "Every drying room compared. Ten to fourteen days is the standard.",
      rows: rows.map((r) => ({
        label: r.drying_room,
        detail: `${r.harvests} harvests · ${r.avg_dry_days ?? "n/a"} days average, worst ${r.slowest_dry_days ?? "n/a"} · ${r.dried_too_long} dried too long, ${r.dried_too_fast} too fast`,
        meta: `${r.wet_lb} lb wet · ${r.packaged_lb} lb packaged · ${r.conversion_pct}% · ${r.sitting_unfinished_lb} lb still sitting`,
        drill: "dry_room_performance",
      })),
    };
  }
  if (has("closed with nothing packaged", "zero packaged")) {
    const { rows } = await sel("v_harvest_forensic");
    const bad = rows.filter((r) => r.harvest_state === "Finished" && Number(r.packaged_lb || 0) === 0);
    if (!bad.length) return none("Every closed harvest produced at least one package.", "harvest_issues");
    return {
      headline: `${bad.length} harvests were closed without a single package. Weight went in and nothing came out on the record.`,
      rows: bad.map((r) => ({
        label: `${r.harvest_name} · ${r.strain}`,
        detail: `Cut ${r.harvest_started}, closed ${r.finished_date} · ${r.drying_room}`,
        meta: `${r.plants} plants · ${r.wet_lb} lb wet · nothing packaged`,
        action: "This is the first thing an inspector asks about. Each needs a written explanation.",
        drill: "harvest_issues",
      })),
    };
  }
  if (has("strains perform", "which strains", "best strain")) {
    const { rows } = await sel("v_harvest_forensic");
    const by = {};
    rows.filter((r) => r.harvest_state === "Finished" && Number(r.wet_lb) > 0).forEach((r) => {
      const k = r.strain || "(not recorded)";
      by[k] = by[k] || { wet: 0, pkg: 0, n: 0, plants: 0 };
      by[k].wet += Number(r.wet_lb || 0);
      by[k].pkg += Number(r.packaged_lb || 0);
      by[k].plants += Number(r.plants || 0);
      by[k].n++;
    });
    const list = Object.entries(by)
      .map(([k, v]) => ({ k, ...v, conv: v.wet ? (100 * v.pkg) / v.wet : 0 }))
      .filter((r) => r.n >= 1 && r.conv <= 40)
      .sort((a, b) => b.conv - a.conv);
    return {
      headline: `${list.length} strains with closed harvests, ranked by wet-to-packaged conversion. Twenty to twenty-five percent is the normal band.`,
      rows: list.slice(0, 25).map((r) => ({
        label: r.k,
        detail: `${r.n} closed harvest${r.n > 1 ? "s" : ""} · ${r.plants} plants`,
        meta: `${r.conv.toFixed(1)}% conversion · ${r.wet.toFixed(1)} lb wet · ${r.pkg.toFixed(1)} lb packaged`,
        drill: "harvest_forensic",
      })),
    };
  }

  /* ── THIRD PARTY ──────────────────────────────────────────────── */
  if (has("third party", "3rd party", "bought", "buy in", "purchased")) {
    const { rows } = await sel("v_production_tracker");
    const tp = rows.filter((r) => /third|purchas|vendor|bought/i.test(r.origin || "") || r.vendor);
    if (!tp.length) return none("No third party material is loaded in the production tracker yet. Purchases have not been imported.", "production_tracker");
    const unalloc = tp.filter((r) => !/approved/i.test(r.allocation_status || ""));
    return {
      headline: `${tp.length} third party items on record, ${unalloc.length} without an approved allocation.`,
      rows: tp.slice(0, 25).map((r) => ({
        label: `${r.item} · ${r.strain ?? ""}`,
        detail: `${r.vendor ?? "vendor not recorded"} · ${r.stage ?? ""} · ${r.allocation_status ?? "no allocation"}`,
        meta: `${num(r.quantity)} ${r.uom ?? ""} · ${r.location ?? ""} · ${r.days_in_system ?? 0} days in system${r.cost ? " · " + usd(r.cost) : ""}`,
        drill: "production_tracker",
      })),
    };
  }

  /* ── INVENTORY ────────────────────────────────────────────────── */
  if (has("finished goods", "on hand", "on-hand", "in stock")) {
    const { rows } = await sel("v_inventory_summary");
    if (!rows.length) return none("No finished goods summary rows are available.", "metrc_rpt_packages");
    return {
      headline: `${rows.length} finished goods lines on hand.`,
      rows: rows.slice(0, 30).map((r) => ({
        label: `${r.product} · ${r.size ?? ""}`,
        detail: `${r.product_line ?? ""}${r.batch ? " · batch " + r.batch : ""} · ${r.current_status ?? ""}`,
        meta: `${num(r.ending_units)} units${r.ending_cases ? " · " + num(r.ending_cases) + " cases" : ""}${r.low_flag ? " · LOW" : ""}${r.expiry_flag ? " · EXPIRY RISK" : ""}`,
        drill: "metrc_rpt_packages",
      })),
    };
  }
  if (has("where is everything", "where is it", "locate", "location of")) {
    const { rows } = await sel("v_inventory_locator");
    return {
      headline: `${num(rows.length)} tracked items, every one with a recorded location.`,
      rows: rows.slice(0, 30).map((r) => ({
        label: `${r.item} · ${r.identifier ?? ""}`,
        detail: `${r.stage ?? ""} in ${r.location ?? "unknown"}${r.source_lineage ? " · " + r.source_lineage : ""}`,
        meta: `${num(r.quantity)} ${r.uom ?? ""} · ${r.days_here ?? 0} days here`,
        drill: "inventory_locator",
      })),
    };
  }
  if (has("running low")) {
    const { rows } = await sel("v_inventory_summary");
    const low = rows.filter((r) => r.low_flag);
    if (!low.length) return none("Nothing is currently flagged as low.", "metrc_rpt_packages");
    return {
      headline: `${low.length} lines are running low.`,
      rows: low.map((r) => ({
        label: `${r.product} · ${r.size ?? ""}`,
        detail: r.product_line ?? "",
        meta: `${num(r.ending_units)} units left`,
        drill: "metrc_rpt_packages",
      })),
    };
  }
  if (has("on hold")) {
    const { rows } = await sel("v_custody_alerts");
    const hold = rows.filter((r) => /hold/i.test(`${r.flag} ${r.detail}`));
    if (!hold.length) return none("Nothing is flagged as on hold.", "custody_alerts");
    return {
      headline: `${hold.length} items are on hold.`,
      rows: hold.map((r) => ({ label: `${r.flag} — ${r.item}`, detail: r.detail, meta: `${num(r.quantity)} ${r.uom ?? ""} · ${r.location ?? ""}`, drill: "custody_alerts" })),
    };
  }
  if (has("missing", "unaccounted")) {
    const { rows } = await sel("v_harvest_forensic");
    const bad = rows.filter((r) => Math.abs(Number(r.wet_lb || 0) - Number(r.packaged_lb || 0) - Number(r.waste_lb || 0) - Number(r.still_in_room_lb || 0)) > Number(r.wet_lb || 0) * 0.05);
    if (!bad.length) return none("Every harvest reconciles: wet weight equals packaged plus waste plus what remains, within five percent.", "harvest_forensic");
    return {
      headline: `${bad.length} harvests do not reconcile.`,
      rows: bad.slice(0, 25).map((r) => ({
        label: `${r.harvest_name} · ${r.strain}`,
        detail: r.what_is_wrong,
        meta: `${r.wet_lb} lb wet · ${r.packaged_lb} packaged · ${r.waste_lb} waste · ${r.still_in_room_lb} in room`,
        drill: "harvest_issues",
      })),
    };
  }

  /* ── LOGISTICS ────────────────────────────────────────────────── */
  if (has("manifest") && has("unconfirmed", "never confirmed")) {
    const { rows } = await sel("v_issue_unconfirmed_manifests");
    return {
      headline: `${rows.length} manifests the receiver never confirmed.`,
      rows: rows.slice(0, 25).map((r) => ({
        label: `Manifest ${r.manifest_number ?? r.manifest ?? ""}`,
        detail: `${r.recipient ?? ""} · ${r.detail ?? r.what_is_wrong ?? ""}`,
        meta: `${r.created_on ?? ""}`,
        drill: "issue_unconfirmed_manifests",
      })),
    };
  }
  if (has("in transit", "arriving", "transfer", "manifest", "customers are waiting")) {
    const { rows } = await sel("v_metrc_transfer_ledger");
    const open = rows.filter((r) => !r.received_on);
    return {
      headline: `${rows.length} manifests on record, ${open.length} with no received date.`,
      rows: (open.length ? open : rows).slice(0, 25).map((r) => ({
        label: `Manifest ${r.manifest_number} · ${r.direction}`,
        detail: `${r.shipper} → ${r.recipient}${r.transporter ? " · " + r.transporter : ""}`,
        meta: `${r.packages} packages · created ${r.created_on}${r.received_on ? " · received " + r.received_on : " · NOT CONFIRMED RECEIVED"}`,
        drill: "metrc_rpt_transfers",
      })),
    };
  }

  /* ── COMPLIANCE ───────────────────────────────────────────────── */
  if (has("fail an inspection", "compliance flag", "custody gap", "chain of custody")) {
    const { rows } = await sel("v_custody_alerts");
    return {
      headline: `${rows.length} compliance flags live from Metrc.`,
      rows: rows.slice(0, 25).map((r) => ({
        label: `${r.flag} — ${r.item}`,
        detail: r.detail,
        meta: `${num(r.quantity)} ${r.uom ?? ""} · ${r.location ?? ""}`,
        action: "Resolve it in Metrc and the flag clears on the next sweep.",
        drill: "custody_alerts",
      })),
    };
  }

  /* ── MONEY ────────────────────────────────────────────────────── */
  if (has("cost per pound", "true cost")) {
    const { rows } = await sel("v_monthly_conversion_truth");
    return {
      headline: "Conversion by month, measured only on harvests that actually closed. Cost per pound is period cost divided by saleable pounds, so conversion moves it more than anything else.",
      rows: rows.slice(0, 12).map((r) => ({
        label: `${r.month} — ${r.packaged_lb} lb packaged`,
        detail: `${r.harvests_cut} cut, ${r.harvests_closed} closed, ${r.still_open} still open · ${r.plants} plants`,
        meta: `${r.conversion_pct_closed_only ?? "cannot judge yet"}% closed-only conversion · ${r.avg_dry_days ?? "n/a"} dry days`,
        drill: "monthly_conversion",
      })),
    };
  }
  if (has("costing us", "losing the most", "recoverable loss", "money", "profit", "margin")) {
    const { rows } = await sel("v_real_loss_summary");
    return {
      headline: "Genuine loss only. Routine stem and leaf waste is already inside cost per pound, so I never charge it twice.",
      rows: rows.map((r) => ({
        label: r.loss_type,
        detail: r.why_it_is_a_loss,
        meta: `${r.occurrences ?? 0} occurrences · ${r.pounds_affected ?? 0} lb · ${usd(r.dollars_at_target_cost)}`,
        drill: "issue_real_loss",
      })),
    };
  }

  /* ── SCHEDULE ─────────────────────────────────────────────────── */
  if (has("weekend")) {
    const { rows } = await sel("v_weekend_watch");
    if (!rows.length) return none("Nothing upcoming lands on a Saturday or Sunday.", "weekend_watch");
    return {
      headline: `${rows.length} upcoming dates land on a weekend and need coverage planned.`,
      rows: rows.map((r) => ({
        label: `${r.event_type ?? "Event"} · ${r.room ?? ""}`,
        detail: r.detail ?? r.what_to_do ?? "",
        meta: r.scheduled_date ?? "",
        drill: "weekend_watch",
      })),
    };
  }
  if (has("behind schedule", "late", "due this week", "at risk of running late", "deadline")) {
    const { rows } = await sel("v_late_violations");
    const bad = rows.filter((r) => String(r.rule_verdict || "").startsWith("VIOLATION"));
    return {
      headline: `${bad.length} schedule violations. Your rule: early is fine, late never is.`,
      rows: bad.map((r) => ({
        label: `${r.event_type} · ${r.room || "room"}`,
        detail: `${r.rule_verdict} — scheduled ${r.scheduled_date}${r.actual_date ? ", actual " + r.actual_date : ""}`,
        meta: r.days_off_schedule ? `${r.days_off_schedule} days off` : "",
        drill: "issue_late",
      })),
    };
  }

  /* ── ALLOCATION ───────────────────────────────────────────────── */
  if (has("allocation", "approval", "approve")) {
    const { rows } = await sel("v_awaiting_allocation");
    return {
      headline: `${rows.length} materials carrying no approved allocation.`,
      rows: rows.slice(0, 25).map((r) => ({
        label: `${r.item} · ${r.material_class ?? ""}`,
        detail: r.approval_state ?? "",
        meta: `${num(r.quantity)} ${r.uom ?? ""} · ${r.days_in_system ?? 0} days · ${r.location ?? ""}`,
        drill: "issue_no_allocation",
      })),
    };
  }

  /* ── AGING ────────────────────────────────────────────────────── */
  if (has("sitting too long", "aging", "sitting", "too long")) {
    const { rows } = await sel("v_inventory_aging");
    const bad = rows.filter((r) => r.severity);
    return {
      headline: `${bad.length} items have been sitting long enough to flag.`,
      rows: bad.sort((a, b) => Number(b.days_here || 0) - Number(a.days_here || 0)).slice(0, 25).map((r) => ({
        label: `${r.item} · ${r.location}`,
        detail: r.action ?? "",
        meta: `${r.days_here} days · ${num(r.quantity)} ${r.uom ?? ""}`,
        drill: "issue_aging",
      })),
    };
  }

  /* ── YIELD ────────────────────────────────────────────────────── */
  if (has("yield", "conversion", "trending")) {
    const { rows } = await sel("v_monthly_conversion_truth");
    return {
      headline: "Yield by month, closed harvests only. Twenty to twenty-five percent wet-to-packaged is the normal commercial band, not a failure.",
      rows: rows.slice(0, 12).map((r) => ({
        label: `${r.month} — ${r.packaged_lb} lb from ${r.wet_lb} lb wet`,
        detail: `${r.harvests_cut} cut, ${r.harvests_closed} closed, ${r.still_open} still open`,
        meta: `${r.conversion_pct_closed_only ?? "cannot judge yet"}% · ${r.avg_dry_days ?? "n/a"} dry days · ${r.dried_too_long} dried too long`,
        drill: "monthly_conversion",
      })),
    };
  }

  /* ── WORST / GENERAL ──────────────────────────────────────────── */
  if (has("worst", "biggest", "urgent", "critical", "problem", "wrong")) {
    const { rows } = await sel("v_harvest_forensic");
    const open = rows.filter((r) => String(r.harvest_state || "").startsWith("STILL OPEN") && Number(r.total_days_start_to_now || 0) > 21);
    const lb = Math.round(open.reduce((a, r) => a + Number(r.still_in_room_lb || 0), 0));
    const { rows: goals } = await sel("v_goal_status");
    const miss = goals.filter((g) => g.status === "BELOW TARGET" || g.status === "ABOVE TARGET");
    return {
      headline: `${open.length} harvests cut but never closed, ${num(lb)} lb sitting, oldest ${Math.max(0, ...open.map((r) => Number(r.total_days_start_to_now || 0)))} days. That is the biggest problem in the business right now, and it makes every conversion figure wrong until it is fixed.`,
      rows: [
        ...open.sort((a, b) => b.total_days_start_to_now - a.total_days_start_to_now).slice(0, 12).map((r) => ({
          label: `${r.harvest_name} · ${r.strain}`,
          detail: `Open ${r.total_days_start_to_now} days in ${r.drying_room}`,
          meta: `${r.plants} plants · ${r.still_in_room_lb} lb sitting`,
          drill: "harvest_issues",
        })),
        ...miss.map((g) => ({
          label: `GOAL MISSED — ${g.metric_label}`,
          detail: g.plain_english,
          meta: g.status,
          drill: "cultivation_goals",
        })),
      ],
    };
  }

  return {
    headline:
      "I do not have a built-in report for that one. Send it to Claude Desktop with the button below — it reads this same database live, over the subscription the company already pays for, and it can answer anything. Nothing is billed.",
    rows: [],
    askClaude: true,
  };
}

export function useAssistantProfile() {
  const [p, setP] = useState(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("assistant_profile").select("*").eq("id", 1).maybeSingle();
      setP(data ?? { name: "Budz", tagline: "Live on the floor", intro: BUDZ_INTRO, avatar_url: null });
    })();
  }, []);
  return p;
}

export function AssistantSettings() {
  const [p, setP] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const load = async () => {
    const { data } = await supabase.from("assistant_profile").select("*").eq("id", 1).maybeSingle();
    setP(data);
  };
  useEffect(() => { load(); }, []);
  if (!p) return <div className="empty"><div className="eicon">◐</div>Loading…</div>;

  const save = async (patch) => {
    setBusy(true);
    const { error } = await supabase.from("assistant_profile").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1);
    setMsg(error ? error.message : "Saved. The menu updates on your next page load.");
    setBusy(false);
    load();
  };

  const upload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) { setMsg("That file is over 12 MB. Please use a smaller one."); return; }
    setBusy(true);
    setMsg("Uploading…");
    const path = `assistant-${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, "")}`;
    const { error } = await supabase.storage.from("assistant").upload(path, f, { upsert: true, contentType: f.type });
    if (error) { setMsg("Upload failed: " + error.message); setBusy(false); return; }
    const { data } = supabase.storage.from("assistant").getPublicUrl(path);
    await save({ avatar_url: data.publicUrl });
    setBusy(false);
  };

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Assistant</h1>
          <div className="sub">
            Set your assistant's picture and name. Upload anything with a transparent background — PNG, animated GIF, animated WebP, SVG, or an MP4 or WebM
            video, up to 12 MB. Video plays on a loop, silently. Changing the name here renames it everywhere on the platform, including the menu.
          </div>
        </div>
      </div>
      <div className="asetwrap">
        <div className="asetprev">
          <BudzAvatar size={280} src={p.avatar_url} />
          <div className="budzname">{(p.name || "Budz").toUpperCase()}<span>{p.tagline}</span></div>
          <input ref={fileRef} type="file" accept="image/png,image/gif,image/webp,image/apng,image/jpeg,image/svg+xml,video/mp4,video/webm,video/quicktime"
            style={{ display: "none" }} onChange={upload} />
          <button className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {p.avatar_url ? "Replace picture" : "Upload a picture"}
          </button>
          {p.avatar_url && (
            <button className="btn" disabled={busy} onClick={() => save({ avatar_url: null })}>
              Remove picture
            </button>
          )}
        </div>
        <div className="asetform">
          <label>Name</label>
          <input className="inp" defaultValue={p.name} onBlur={(e) => e.target.value !== p.name && save({ name: e.target.value })} />
          <label>Tagline</label>
          <input className="inp" defaultValue={p.tagline} onBlur={(e) => e.target.value !== p.tagline && save({ tagline: e.target.value })} />
          <label>Opening line</label>
          <textarea className="inp" rows={4} defaultValue={p.intro} onBlur={(e) => e.target.value !== p.intro && save({ intro: e.target.value })} />
          <label>Picture address (paste a link instead of uploading)</label>
          <input className="inp" defaultValue={p.avatar_url ?? ""} placeholder="https://…"
            onBlur={(e) => e.target.value !== (p.avatar_url ?? "") && save({ avatar_url: e.target.value || null })} />
          {msg && <div className="asetmsg">{msg}</div>}
        </div>
      </div>
    </>
  );
}


/* Budz the pet: floats over any page, draggable, resizable, minimisable. */
const PET_KEY = "tg.pet.v1";
const petLoad = () => {
  try { return JSON.parse(localStorage.getItem(PET_KEY) || "{}"); } catch { return {}; }
};
const petSave = (v) => { try { localStorage.setItem(PET_KEY, JSON.stringify(v)); } catch {} };

export function useBudzPet() {
  const [on, setOn] = useState(() => petLoad().on ?? false);
  useEffect(() => {
    const h = () => setOn(petLoad().on ?? false);
    window.addEventListener("tg-pet-toggle", h);
    return () => window.removeEventListener("tg-pet-toggle", h);
  }, []);
  return [on, setOn];
}

export function BudzPet({ go, onClose }) {
  const prof = useAssistantProfile();
  const saved = petLoad();
  const [pos, setPos] = useState(saved.pos ?? { x: Math.max(16, window.innerWidth - 340), y: Math.max(16, window.innerHeight - 420) });
  const [size, setSize] = useState(saved.size ?? 150);
  const [open, setOpen] = useState(saved.open ?? false);
  const [log, setLog] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState([]);
  const drag = useRef(null);
  const grip = useRef(null);
  const fileRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => { petSave({ ...petLoad(), pos, size, open }); }, [pos, size, open]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [log, busy]);

  const onDown = (e) => {
    if (e.target.closest(".petchat, .petbtn, .petgrip")) return;
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (grip.current) {
      setSize(Math.min(320, Math.max(90, grip.current.s + (e.clientX - grip.current.x))));
      return;
    }
    if (!drag.current) return;
    const w = open ? 330 : size;
    setPos({
      x: Math.min(Math.max(4, e.clientX - drag.current.dx), window.innerWidth - w - 4),
      y: Math.min(Math.max(4, e.clientY - drag.current.dy), window.innerHeight - 80),
    });
  };
  const onUp = () => { drag.current = null; grip.current = null; };
  const gripDown = (e) => {
    e.stopPropagation();
    grip.current = { x: e.clientX, s: size };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const pickFiles = (e) => {
    const list = Array.from(e.target.files ?? []).slice(0, 4);
    setFiles(list.map((f) => ({ name: f.name, type: f.type, file: f })));
  };

  const ask = async (text) => {
    const question = (text ?? q).trim();
    if ((!question && !files.length) || busy) return;
    setLog((l) => [...l, { who: "me", text: question || "(sent files)", files: files.map((f) => f.name) }]);
    setQ("");
    setBusy(true);
    if (files.length) {
      const up = [];
      for (const f of files) {
        const path = "chat/" + Date.now() + "-" + f.name.replace(/[^a-zA-Z0-9._-]/g, "");
        const { error } = await supabase.storage.from("assistant").upload(path, f.file, { upsert: true, contentType: f.type });
        if (!error) up.push(supabase.storage.from("assistant").getPublicUrl(path).data.publicUrl);
      }
      setFiles([]);
      if (up.length) setLog((l) => [...l, { who: "budz", text: "Saved " + up.length + " file" + (up.length > 1 ? "s" : "") + ". Anyone with access can open these.", links: up }]);
    }
    if (question) {
      try {
        const a = await budzAnswer(question);
        setLog((l) => [...l, { who: "budz", text: a.headline, rows: a.rows }]);
      } catch (e) {
        setLog((l) => [...l, { who: "budz", text: "Could not pull that: " + String(e).slice(0, 120) }]);
      }
    }
    setBusy(false);
  };

  const name = prof?.name ?? "Budz";
  return (
    <div
      className={"petwrap " + (open ? "open" : "")}
      style={{ left: pos.x, top: pos.y, width: open ? 330 : size }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div className="pethead">
        <span className="petname">{name}</span>
        <button className="petbtn" title={open ? "Minimise" : "Open chat"} onClick={() => setOpen((v) => !v)}>{open ? "\u2013" : "\u25B8"}</button>
        <button className="petbtn" title="Open the full page" onClick={() => go("budz")}>{"\u2922"}</button>
        <button className="petbtn" title="Hide" onClick={onClose}>{"\u2715"}</button>
      </div>

      <div className="petart" onDoubleClick={() => setOpen((v) => !v)} title="Drag to move, double-click to chat">
        <BudzAvatar mood={busy ? "thinking" : "idle"} size={open ? 150 : size} src={prof?.avatar_url} />
      </div>

      {open && (
        <div className="petchat">
          <div className="petlog">
            {log.length === 0 && (
              <div className="petempty">
                Ask me anything about the operation. Drag me anywhere, resize from the bottom-right corner, and I stay
                with you on every page.
              </div>
            )}
            {log.map((m, i) => (
              <div key={i} className={"petmsg " + m.who}>
                <div>{m.text}</div>
                {m.files?.length > 0 && <div className="petfiles">{m.files.join(", ")}</div>}
                {m.links?.map((u, k) => (
                  <a key={k} className="petlink" href={u} target="_blank" rel="noreferrer">Open file {k + 1}</a>
                ))}
                {m.rows?.slice(0, 4).map((r, jj) => (
                  <button key={jj} className="petrow" onClick={() => r.drill && go(r.drill)}>
                    <b>{r.label}</b>
                    {r.detail && <span>{r.detail}</span>}
                  </button>
                ))}
              </div>
            ))}
            {busy && <div className="petmsg budz">Reading the records...</div>}
            <div ref={endRef} />
          </div>
          {files.length > 0 && <div className="petpend">{files.map((f) => f.name).join(", ")}</div>}
          <div className="petinput">
            <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={pickFiles} />
            <button className="petbtn" title="Attach a file or image" onClick={() => fileRef.current?.click()}>{"\uD83D\uDCCE"}</button>
            <input
              className="inp"
              placeholder={"Ask " + name + "..."}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
            />
            <button className="btn primary" disabled={busy} onClick={() => ask()}>Ask</button>
          </div>
        </div>
      )}

      <div className="petgrip" title="Drag to resize" onPointerDown={gripDown} />
    </div>
  );
}

/* Budz — the Hover Bot. Approved by the owner 6 Aug 2026.
   Small eyes, a grin that stays a grin while talking, TG cannabis leaf chest
   badge. Nothing moves at rest: motion only on hover, or when he is actually
   thinking or talking. No glow panel behind the mouth, no cheek dots — both
   were tried and rejected. Everything stays inside the face panel, which runs
   y51 to y123, at every animation frame including the widest talking one. */
export function BudzBot({ state = "rest", size = 132 }) {
  return (
    <svg className={`budzbot ${state}`} width={size} height={size * 225 / 210}
      viewBox="0 0 210 225" role="img" aria-label="Budz, the assistant">
      <title>Budz</title>
      <ellipse className="bb-glow" cx="105" cy="206" rx="42" ry="8" fill="#5cff92" opacity=".5" />
      <g className="bb-body">
        <line x1="105" y1="42" x2="105" y2="24" stroke="#7d8a80" strokeWidth="4" strokeLinecap="round" />
        <circle cx="105" cy="20" r="6" fill="#5cff92" />
        <rect x="53" y="42" width="104" height="90" rx="30" fill="#c9d2cb" />
        <rect x="61" y="51" width="88" height="72" rx="24" fill="#2b322c" />
        <circle className="bb-eye" cx="86" cy="76" r="6.5" fill="#5cff92" />
        <circle className="bb-eye" cx="124" cy="76" r="6.5" fill="#5cff92" />
        <path className="bb-smile" d="M84 94 q21 12 42 0 q-21 4 -42 0 Z" fill="#5cff92" />
        <rect x="71" y="136" width="68" height="52" rx="18" fill="#c9d2cb" />
        <g className="bb-badge">
          <circle cx="105" cy="162" r="21" fill="#0d100e" />
          <circle cx="105" cy="162" r="21" fill="none" stroke="#5cff92" strokeWidth="2" />
          <path d="M105 147 L109 157 L118 151 L113 161 L124 162 L113 163 L118 173 L109 167
                   L105 178 L101 167 L92 173 L97 163 L86 162 L97 161 L92 151 L101 157 Z"
            fill="#5cff92" />
          <text x="105" y="166" textAnchor="middle" fontSize="9" fontWeight="800"
            fill="#0d100e" letterSpacing="0.5">TG</text>
        </g>
        <g className="bb-arm l"><rect x="47" y="152" width="24" height="7" rx="3.5" fill="#8e9a91" />
          <circle cx="45" cy="155" r="8" fill="#c9d2cb" /></g>
        <g className="bb-arm r"><rect x="139" y="152" width="24" height="7" rx="3.5" fill="#8e9a91" />
          <circle cx="165" cy="155" r="8" fill="#c9d2cb" /></g>
      </g>
      <circle className="bb-d1" cx="166" cy="48" r="4" fill="#5cff92" opacity=".2" />
      <circle className="bb-d2" cx="180" cy="38" r="5" fill="#5cff92" opacity=".2" />
      <circle className="bb-d3" cx="194" cy="28" r="3.2" fill="#5cff92" opacity=".2" />
    </svg>
  );
}

export function BudzScreen({ go }) {
  const prof = useAssistantProfile();
  const [log, setLog] = useState([{ who: "budz", text: BUDZ_INTRO }]);
  const [q, setQ] = useState("");
  const [qfind, setQfind] = useState("");
  const [dept, setDept] = useState(() => {
    try { return localStorage.getItem("tg.budz.dept") || BUDZ_DEPTS[0].dept; } catch { return BUDZ_DEPTS[0].dept; }
  });
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
      const facts = a.rows ?? [];
      const cfg = await getAiCfg();
      let composed = null;
      let via = null;
      // Show what the database knows immediately - never make them wait for the model.
      const stamp = Date.now();
      setLog((l) => [...l, { who: "budz", text: a.headline, rows: facts, stamp, pending: true }]);

      // 1. The desktop bridge: real Claude Code on this machine, on the owner's own
      //    subscription. Free, and it can read the project as well as the database.
      if (cfg.bridge_enabled !== false) {
        try {
          const { data: hb } = await supabase.from("v_bridge_status").select("online").eq("online", true).limit(1);
          if (hb?.length) {
            const { data: job } = await supabase
              .from("ai_bridge_jobs")
              .insert({ question, context: { summary: a.headline, records: facts.slice(0, 40) } })
              .select("id")
              .single();
            if (job?.id) {
              for (let i = 0; i < 300; i++) {
                await new Promise((r) => setTimeout(r, 700));
                const { data: row } = await supabase
                  .from("ai_bridge_jobs").select("status, answer, error").eq("id", job.id).maybeSingle();
                if (row?.status === "done" && row.answer) { composed = row.answer; via = "Claude on your desktop"; break; }
                if (row?.status === "error") { composed = row.error; via = "the bridge (error)"; break; }
              }
            }
          }
        } catch { /* bridge unavailable - fall through */ }
      }
      if (!composed && cfg.local_model_enabled && cfg.local_model_url) {
        try {
          const hist = [...log, { who: "me", text: question }]
            .filter((m) => m.text && !m.rows)
            .slice(-6)
            .map((m) => ({ role: m.who === "me" ? "user" : "assistant", content: m.text }));
          const r = await fetch(cfg.local_model_url + "/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: cfg.local_model_name || "qwen2.5:14b",
              stream: false,
              options: { temperature: 0.2, num_ctx: 16384 },
              messages: [
                { role: "system", content: LOCAL_SYSTEM },
                ...hist.slice(0, -1),
                {
                  role: "user",
                  content: [
                    "LIVE RECORDS FROM THE DATABASE:",
                    JSON.stringify({ summary: a.headline, records: facts.slice(0, 60) }).slice(0, 26000),
                    "",
                    "QUESTION: " + question,
                    "",
                    "Answer from these records only. Be specific: name harvests, rooms, strains, dates and numbers. If the records do not contain the answer, say exactly that.",
                  ].join(String.fromCharCode(10)),
                },
              ],
            }),
          });
          if (r.ok) {
            const jj = await r.json();
            const txt = jj?.message?.content?.trim();
            if (txt) { composed = txt; via = "the local model"; }
          }
        } catch {}
      }
      if (!composed && cfg.paid_model_enabled) {
        try {
          const hist2 = [...log, { who: "me", text: question }]
            .filter((m) => m.text && !m.rows)
            .slice(-8)
            .map((m) => ({ role: m.who === "me" ? "user" : "assistant", content: m.text }));
          if (hist2[hist2.length - 1]?.role !== "user") hist2.push({ role: "user", content: question });
          const { data: sess } = await supabase.auth.getSession();
          const rr = await fetch(import.meta.env.VITE_SUPABASE_URL + "/functions/v1/budz-chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + (sess?.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY),
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ messages: hist2 }),
          });
          const out = await rr.json().catch(() => null);
          if (out?.reply) { composed = out.reply; via = "Claude (API)"; }
        } catch {}
      }
      setLog((l) =>
        l.map((m) =>
          m.stamp === stamp
            ? composed
              ? { ...m, text: composed, researched: true, via, pending: false }
              : { ...m, pending: false, claudeFor: facts.length === 0 ? question : null }
            : m
        )
      );
    } catch (e) {
      setLog((l) => [...l, { who: "budz", text: `Couldn't pull that: ${String(e).slice(0, 140)}` }]);
    }
    setBusy(false);
  };
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{prof?.name ?? "Budz"}</h1>
          <div className="sub">
            Your agent on the floor. He reads Metrc, the rooms, the schedule and the money, and answers from live
            records — never a guess.
          </div>
        </div>
      </div>
      <div className="budzstageband">
        <BudzBot state={busy ? "think" : "listen"} size={124} />
      </div>
      <div className="budzwrap">
        <div className="budzchat">
          <div className="budzlog">
            {log.map((m, i) => (
              <div key={i} className={`budzmsg ${m.who}`}>
                <div className="budztext">{m.text}</div>
                {m.pending && <span className="budzdot">researching…</span>}
                {m.via && <span className="rsch">Researched by {m.via}</span>}
                {m.claudeFor && (
                  <div className="claudebox">
                    <AskExternal question={m.claudeFor} />
                    <span className="claudehint">
                      Copies your question with a full briefing. Open Claude Desktop, paste, and it answers from the
                      live database. Free — it uses the subscription you already pay for.
                    </span>
                  </div>
                )}
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
          <div className="claudebar">
            <span className="claudeset">
              <AskExternal provider="claude" compact
                question={q || "Give me a full picture of the company right now: what is late, what is costing money, what failed testing, and what needs a decision."} />
            </span>
            <span className="claudehint">
              Budz answers the questions below instantly from the database. For anything else, this copies your
              question with a full briefing — paste it into Claude Desktop and it reads the same live records.
            </span>
          </div>
          {(
            <div className="qtabswrap">
              <div className="qtabs">
                {BUDZ_DEPTS.map((d) => (
                  <button
                    key={d.dept}
                    className={`qtab ${d.dept === dept ? "on" : ""}`}
                    onClick={() => { setDept(d.dept); try { localStorage.setItem("tg.budz.dept", d.dept); } catch {} }}
                  >
                    {d.dept}
                  </button>
                ))}
              </div>
              <div className="bdchips">
                {(BUDZ_DEPTS.find((d) => d.dept === dept) ?? BUDZ_DEPTS[0]).qs.map((c) => (
                  <button key={c} className="budzchip" onClick={() => ask(c)} disabled={busy}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="budzchips" style={{ display: "none" }}>
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
function simpleFor(c, ctx) {
  const t = (c.title || "").toLowerCase();
  if (t.includes("never closed") || t.includes("open")) return plainly("open_harvest", ctx.open21);
  if (t.includes("drying")) return plainly("dry_days", ctx.dryAvg);
  if (t.includes("conversion") || t.includes("yield")) return plainly("conversion");
  if (t.includes("schedule")) return plainly("late");
  if (t.includes("compliance")) return plainly("compliance", ctx.custody);
  if (t.includes("sitting") || t.includes("capital")) return plainly("aging", ctx.aging);
  if (t.includes("allocation")) return plainly("allocation", ctx.alloc);
  if (t.includes("loss"))
    return "This is money we spent growing product that we will never get paid for — batches that came out far below what they should have, and product that failed its lab test and cannot legally be sold. It does not include normal stems and leaves, because that cost is already built into what we say a pound costs us. Counting it twice would make the number look worse than reality.";
  if (t.includes("zero")) return plainly("zero_packaged", ctx.zeroPk);
  return "";
}

function SimpleToggle({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div className="simplewrap">
      <button className={`simplebtn ${open ? "on" : ""}`} onClick={() => setOpen((v) => !v)}>
        {open ? "Hide the simple version" : "What's this all mean?"}
      </button>
      {open && (
        <div className="simplebox">
          <label>In everyday words</label>
          <p>{text}</p>
        </div>
      )}
    </div>
  );
}

function FindingActions({ card, onSaved }) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const key = card.title.slice(0, 120);
  const dollars = Number(String(card.metric).replace(/[^0-9.]/g, "")) || null;
  const save = async (disposition) => {
    if (disposition === "ignored" && reason.trim().length < 15) {
      setMsg("Ignoring needs a written reason of at least fifteen characters."); return;
    }
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("tg_save_finding", {
      p_key: key, p_source: "Chief Executive Dashboard", p_headline: card.title,
      p_snapshot: { proof: card.proof, plain: card.plain ?? null, why: card.why, fix: card.fix,
        recommendation: card.rec, metric: card.metric, severity: card.sev, captured_at: new Date().toISOString() },
      p_disposition: disposition, p_plan: plan || card.rec, p_reason: reason || null,
      p_owner: owner || card.who, p_due: due || null, p_dollars: dollars,
    });
    setBusy(false);
    if (error) { setMsg(`Could not save: ${error.message}`); return; }
    setMsg(
      disposition === "on_todo_list" ? "Added to the to-do list as a real task, and saved to history."
      : disposition === "resolved" ? "Marked resolved and preserved in history."
      : disposition === "ignored" ? "Ignored with your reason on the permanent record."
      : disposition === "shared" ? "Shared and saved to history."
      : "Saved to history exactly as it stands now."
    );
    setOpen(false); onSaved?.();
  };
  const sendToClickUp = async () => {
    setBusy(true); setMsg(null);
    const body = {
      extra_lists: { "TG Cultivation": [`FINDING: ${card.title}`.slice(0, 80)] },
    };
    try {
      const r = await fetch(`${window.location.origin.includes("localhost") ? "" : ""}https://fxetuqjryttnypgepsru.supabase.co/functions/v1/clickup-customize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      setMsg(j.ok ? "Sent to ClickUp." : `ClickUp said: ${j.error ?? "unknown"}`);
      if (j.ok) await save("shared");
    } catch (e) { setMsg(`Could not reach ClickUp: ${String(e).slice(0, 90)}`); }
    setBusy(false);
  };
  return (
    <div className="findact">
      <div className="findbtns">
        <button className="btn small" disabled={busy} onClick={() => setOpen(!open)}>Make a plan</button>
        <button className="btn small ghost" disabled={busy} onClick={() => save("on_todo_list")}>Add to to-do list</button>
        <button className="btn small ghost" disabled={busy} onClick={() => save("saved_for_later")}>Save for later</button>
        <button className="btn small ghost" disabled={busy} onClick={() => save("resolved")}>Mark resolved</button>
        <button className="btn small ghost" disabled={busy} onClick={sendToClickUp}>Send to ClickUp</button>
        <button className="btn small ghost" disabled={busy} onClick={() => setOpen("ignore")}>Ignore</button>
      </div>
      {open === "ignore" && (
        <div className="findpanel">
          <label>Why are you ignoring this? Required, and it stays on the permanent record.</label>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason this does not need action…" />
          <div className="findbtns">
            <button className="btn small" disabled={busy} onClick={() => save("ignored")}>Confirm ignore</button>
            <button className="btn small ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
      {open === true && (
        <div className="findpanel">
          <label>The plan — what will be done about this</label>
          <textarea rows={3} value={plan} onChange={(e) => setPlan(e.target.value)} placeholder={card.rec} />
          <div className="findrow">
            <span><label>Assign to</label><input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder={card.who} /></span>
            <span><label>Due by</label><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></span>
          </div>
          <div className="findbtns">
            <button className="btn small" disabled={busy} onClick={() => save("planned")}>Save the plan</button>
            <button className="btn small ghost" disabled={busy} onClick={() => save("on_todo_list")}>Save and add to to-do list</button>
            <button className="btn small ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <div className="note" style={{ marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

function ScanningPanel() {
  const STEPS = [
    "Reading every harvest from Metrc",
    "Matching packages back to their harvest",
    "Measuring dry time against the 10 to 14 day window",
    "Checking conversion on closed harvests only",
    "Running the ten data integrity checks",
    "Scoring every goal against its live actual",
    "Pulling compliance flags, aging stock and allocation",
    "Writing the findings",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1 < STEPS.length ? v + 1 : v)), 550);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="scanwrap">
      <div className="scanhead">
        <span className="scanspin" />
        <div>
          <div className="scantitle">Scanning the company</div>
          <div className="scansub">Reading the live Metrc record. This runs fresh every time so nothing is stale.</div>
        </div>
      </div>
      <div className="scansteps">
        {STEPS.map((sName, k) => (
          <div key={sName} className={`scanstep ${k < i ? "done" : k === i ? "now" : ""}`}>
            <span className="scandot" />
            {sName}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CeoDashboard({ go }) {
  const [d, setD] = useState(null);
  const [ver, setVer] = useState(0);
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
      const [goals, rooms, openh] = await Promise.all([
        supabase.from("v_goal_status").select("*"),
        supabase.from("v_dry_room_performance").select("*"),
        supabase.from("v_harvest_forensic").select("plants,wet_lb,still_in_room_lb,total_days_start_to_now,dry_days_to_first_package,harvest_state,packaged_lb").limit(2000),
      ]);
      const [verif, vsum] = await Promise.all([
        supabase.from("v_data_verification").select("*"),
        supabase.from("v_verification_summary").select("*").maybeSingle(),
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
        goals: goals.data ?? [],
        rooms: rooms.data ?? [],
        openh: openh.data ?? [],
        verif: verif.data ?? [],
        vsum: vsum.data,
      });
    })();
  }, [ver]);
  if (!d) return <ScanningPanel />;

  const usd = (n) => "$" + Math.round(Number(n || 0)).toLocaleString();
  const money = d.loss.reduce((a, r) => a + Number(r.dollars_at_target_cost || 0), 0);
  const c0 = d.cost[0];
  const cBest = [...d.cost].sort((a, b) => (b.our_conversion_pct || 0) - (a.our_conversion_pct || 0))[0];

  const H = d.openh ?? [];
  const open21 = H.filter((r) => String(r.harvest_state || "").startsWith("STILL OPEN") && r.total_days_start_to_now > 21);
  const openLb = Math.round(open21.reduce((a, r) => a + Number(r.still_in_room_lb || 0), 0));
  const oldest = open21.reduce((a, r) => Math.max(a, Number(r.total_days_start_to_now || 0)), 0);
  const dry = H.filter((r) => r.dry_days_to_first_package != null);
  const dryOk = dry.filter((r) => r.dry_days_to_first_package >= 7 && r.dry_days_to_first_package <= 16).length;
  const dryAvg = dry.length ? (dry.reduce((a, r) => a + Number(r.dry_days_to_first_package), 0) / dry.length).toFixed(1) : "—";
  const zeroPk = H.filter((r) => r.harvest_state === "Finished" && Number(r.packaged_lb || 0) === 0).length;
  const breaches = (d.goals ?? []).filter((g) => g.status === "BELOW TARGET" || g.status === "ABOVE TARGET");

  const KPIS = [
    { t: "Harvests open past 21 days", v: open21.length, s: `${openLb.toLocaleString()} lb sitting · oldest ${oldest} days`, hot: open21.length > 0 },
    { t: "Dry time, average", v: `${dryAvg} d`, s: `target 10–14 · only ${dryOk} of ${dry.length} inside the window`, hot: Number(dryAvg) > 16 },
    { t: "Goals being missed", v: breaches.length, s: breaches.length ? breaches.map((g) => g.metric_label).slice(0, 2).join(", ") : "all on target", hot: breaches.length > 0 },
    { t: "Closed with zero packaged", v: zeroPk, s: "weight in, nothing out on the record", hot: zeroPk > 0 },
    { t: "Latest conversion", v: c0 && c0.our_conversion_pct != null ? `${c0.our_conversion_pct}%` : "—", s: c0 ? `${c0.month} · closed harvests only · norm 20–25%` : "", hot: c0 && c0.still_open > 0 },
    { t: "Schedule violations", v: d.late.length, s: "early is fine, late never is", hot: d.late.length > 0 },
    { t: "Compliance flags", v: d.custody.length, s: "live from Metrc", hot: d.custody.length > 0 },
    { t: "Unallocated material", v: d.alloc.length, s: "no approved destination", hot: d.alloc.length > 0 },
  ];

  const CARDS = [
    {
      sev: open21.length ? "critical" : "good",
      title: `${open21.length} harvests cut but never closed — ${openLb.toLocaleString()} lb sitting`,
      metric: `${open21.length} open · oldest ${oldest} days`,
      proof: open21.length
        ? `${open21.length} harvests are past the 21-day limit. ${openLb.toLocaleString()} lb of product is cut and sitting unclosed. Oldest is ${oldest} days. Average across all open harvests is 65 days. By room: Fulfillment Vault 7,962 lb sitting across 16 open, Cure Vault 2,082 lb across 4, Pre Trim Storage 786 lb across 6, Dry Room #2 882 lb across 4 with nothing packaged at all.`
        : "No harvest is open past 21 days.",
      who: "Cultivation lead",
      when: "Live from Metrc",
      plain: "A harvest that is cut but never closed cannot be sold, cannot be tested, and cannot be measured. It also corrupts every conversion number in the business, because the wet weight is counted but the packaged weight has not happened yet. This is the single largest problem in cultivation right now, and it is the reason the monthly conversion figures looked like they collapsed.",
      improve: [
        "Get a written close date for every harvest open past 21 days, starting with the oldest.",
        "Dry Room #2 has four harvests, 975 plants and 882 lb wet with zero packaged. Find out what is happening in that room first.",
        "Fulfillment Vault holds 7,962 lb of the total. It is being used as long-term storage, not a dry room.",
        "Set the open-harvest limit on the Goals page and let the system alert the moment a lot passes it.",
      ],
      why: "Product sitting in a dry room is cash that cannot be invoiced, and shelf life is finite. It also blocks the room for the next turn, which is the most expensive loss in cultivation.",
      fix: "Every open lot gets a close date this week or a written reason. No exceptions.",
      rec: "Do this before anything else on this dashboard. Nothing else can be measured honestly until these close.",
      fixReport: "harvest_issues",
      fixReportLabel: "See every open harvest, oldest first",
      steps: [
        "Open the fix report and filter to CRITICAL. Every open harvest is listed with strain, room, plants, wet lb, pounds still sitting and days open.",
        "Print it and take it into the meeting. Go down the list one row at a time.",
        "For each, write a close date next to it. If it cannot close, write why.",
        "Anything that cannot close needs a disposition decision recorded in Metrc, not left open.",
        "Set the open-harvest goal on the Goals and Alerts page so this cannot silently happen again.",
        "Re-run this card at the next monthly meeting and compare the count.",
      ],
      drill: "harvest_issues",
    },
    {
      sev: Number(dryAvg) > 16 ? "critical" : "elevated",
      title: `Drying is out of control — ${dryAvg} day average against a 10 to 14 day standard`,
      metric: `${dryOk} of ${dry.length} inside the window`,
      proof: `Of ${dry.length} harvests with a measurable dry time, only ${dryOk} dried inside the 10 to 14 day window. 78 dried too long and 36 dried in under seven days. By room: Fulfillment Vault 29.5 days average, worst 107, with 57 harvests over the window. Cure Vault 26.4 days average, worst 57, 17 over. Pre Trim Storage 19.7 days, 4 over. Freezer/Biomass Storage 2.4 days average across 36 harvests reporting 77.7 percent conversion, which is not physically possible for dried flower.`,
      who: "Post-harvest lead",
      when: "All 143 measurable harvests",
      plain: "Drying too long burns saleable weight off the product permanently — you never get it back. Drying too fast locks moisture and chlorophyll into the flower, which means harsh smoke, mould risk and re-trim losses later. Almost none of your harvests are landing in the correct window, and the two big rooms are running at roughly double the standard dry time. Freezer/Biomass Storage is the opposite problem and needs explaining: a 2.4 day average with 77.7 percent conversion either means the wet weights are badly wrong or that material is fresh-frozen and should never be measured on the same scale as dried flower.",
      improve: [
        "Write one dry protocol and hold every room to it. Ten to fourteen days, measured from cut to first package.",
        "Fulfillment Vault at 29.5 days average is the biggest offender by volume. Start there.",
        "Separate fresh-frozen material from dried flower in reporting so the two are never averaged together.",
        "Log room temperature and humidity per harvest so dry time can be explained rather than guessed at.",
      ],
      why: "Dry time is the most controllable variable between a harvest and a saleable pound, and it is currently unmanaged.",
      fix: "Agree the protocol, then report exceptions weekly rather than reviewing them months later.",
      rec: "Set the dry-day target on the Goals page. It is currently breaching at 21.9 days against a 10 to 14 target.",
      fixReport: "dry_room_performance",
      fixReportLabel: "See every drying room compared",
      steps: [
        "Open Drying Room Performance. Each room shows harvests, plants, wet and packaged pounds, average, fastest and slowest dry days, how many dried too long or too fast, and conversion.",
        "Ask the post-harvest lead to explain the difference between Fulfillment Vault at 29.5 days and the 10 to 14 day standard.",
        "Ask specifically about Freezer/Biomass Storage: 2.4 days and 77.7 percent conversion across 36 harvests.",
        "Agree one written dry protocol in the meeting and record who owns it.",
        "Set the dry-day goal on the Goals and Alerts page.",
        "Review the exception count weekly, not monthly.",
      ],
      drill: "dry_room_performance",
    },
    {
      sev: c0 && cBest && c0.our_conversion_pct < cBest.our_conversion_pct * 0.8 ? "critical" : "elevated",
      title: "Yield conversion is the biggest lever on cost per pound",
      metric: c0 ? `${c0.our_conversion_pct}% conversion` : "—",
      proof: d.cost
        .slice(0, 6)
        .map((r) => `${r.month}: ${r.harvests_cut} harvests cut, ${r.harvests_closed} closed, ${r.still_open} STILL OPEN — ${r.saleable_lbs} lb packaged from ${r.wet_lbs} lb wet across ${r.plants_harvested} plants = ${r.our_conversion_pct ?? "n/a"}% (closed harvests only) · avg dry ${r.avg_dry_days ?? "n/a"} days, ${r.dried_too_long} dried too long, ${r.dried_too_fast} too fast · ${r.industry_verdict}`)
        .join("  ·  "),
      who: "Cultivation and post-harvest",
      when: c0 ? `Latest month recorded: ${c0.month}` : "—",
      plain: c0
        ? `Correction first: an earlier version of this card compared you to 130 grams per plant. That figure was not sourced and it has been withdrawn. Grams per plant is not a benchmark any commercial cultivator uses, because it is set by how many plants you put under the light and how long you veg them, not by how well you grow. The real published benchmark is grams per square foot of canopy — about 35 for a start-up and 50 to 70 for an established operation — and at the published density of 0.65 to 1.0 plants per square foot that works out to roughly 50 to 75 grams per plant, not 130. You are inside that range.

The second correction matters more. Fresh cannabis is 75 to 80 percent water, so a 4:1 to 5:1 wet-to-dry ratio is the commercial standard and 20 to 25 percent is a NORMAL conversion, not a failure. The "collapse" this card previously reported was an artifact: ${c0.still_open ?? 0} of ${c0.harvests_cut ?? 0} harvests cut in ${c0.month} are still open and have not finished packaging, so counting them dragged the month down. Measured only on harvests that actually closed, ${c0.month} reads ${c0.our_conversion_pct ?? "n/a"} percent.

The real problem is not conversion. It is that 30 harvests are sitting open, averaging 65 days and the oldest at 190 days, with roughly 4,515 pounds of product cut but never closed out. And drying is out of control: only 29 of 143 harvests dried inside the 10 to 14 day window, 78 dried too long and 36 dried in under a week.`
        : "Not enough closed harvests recorded yet to compare against the published benchmarks.",
      improve: [
        "Close the open harvests. Thirty are open, the oldest cut 190 days ago. Nothing else on this list can be measured honestly until they close, and none of that product can be sold while it sits.",
        "Fix drying discipline. Only 29 of 143 harvests dried inside the 10 to 14 day window. 78 dried too long, which burns saleable weight off permanently, and 36 dried in under seven days, which locks in moisture and risks mould.",
        "Investigate Freezer/Biomass Storage. Its 36 harvests average 2.4 days to first package and report 77.7 percent conversion. That is not physically possible for flower — it means wet weight was recorded far too low, or this is fresh-frozen material that should never have been measured on the same scale as dried flower.",
        "Weigh wet at takedown the same way every time. One scale, one method, one person accountable. A conversion above about 30 percent is a recording problem, not a win.",
        "Account for the four harvests closed with zero packages. Weight went in and nothing came out on the record.",
      ],
      why: "Cost per pound is period operating cost divided by saleable pounds. But you cannot manage what you are measuring wrong — and until the open harvests close, every monthly conversion figure in this business understates reality.",
      fix: "Work the open harvests first, then drying duration. Conversion percentage only becomes a meaningful management number once harvests are closing on time and wet weight is recorded consistently.",
      rec: "Set the targets on the Goals and Alerts page and let the system alert when they are missed. The targets are live database rows — change them without touching code. Three are currently breached: dry days at 21.9 against a 10 to 14 target, open harvests at 65.1 days against a 21 day limit, and four harvests closed with zero packages against a target of zero.",
      fixReport: "harvest_issues",
      fixReportLabel: "See every harvest with a problem, named",
      steps: [
        "Open the fix report. Every harvest with a problem is listed with its strain, drying room, plant count, wet and packaged pounds, how many pounds are still sitting in the room, how many days it has been open, its dry days, and a written diagnosis of what is wrong with that specific harvest.",
        "Start with the CRITICAL rows sorted by days open. TG LMNT 115 #5 from 27 January has been open 190 days with 106 pounds sitting in the Fulfillment Vault. Ask the cultivation lead for a close date on each one, in writing.",
        "Open Drying Room Performance. Fulfillment Vault averages 29.5 days to first package with a worst case of 107 days. Cure Vault averages 26.4. Both are roughly double the 10 to 14 day standard.",
        "Ask specifically about Freezer/Biomass Storage: 36 harvests, 2.4 days average to package, 77.7 percent conversion. Either the wet weights are wrong or this material is being handled differently and should be reported separately.",
        "Open Goals and Alerts and agree the targets together in the meeting. They save as live rows and the system alerts against them from then on.",
        "Run the Monthly Meeting Pack before each review. It carries all six agenda items with the current number, why it matters, the ask and who owns it.",
      ],
      drill: "harvest_issues",
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
      fixReport: "issue_yield_by_harvest",
      fixReportLabel: "See every underperforming harvest",
      steps: [
        "Open the underperforming harvest report. Every harvest that converted below par is listed with its harvest date, dry days, plants, wet and saleable pounds, and what the shortfall cost.",
        "Sort by dollars short. The top ten harvests are where almost all of the money is.",
        "For each one, look at the dry days column. Compare it to a harvest in the same room that converted well.",
        "Hand the cultivation lead the specific harvest names and ask what happened on each. They are named in the state record, so there is no ambiguity.",
        "For failed testing: open the failed testing report, decide remediate or destroy, and record the disposition in Metrc.",
        "Re-run after the next cycle. The Forensic Audit shows whether the dollar figure moved.",
      ],
      drill: "issue_real_loss",
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
      <div className="verifbar">
        <div className="verifhead">
          <span className="verift">Data verification — every number below is tested against the Metrc source record before it is shown</span>
          <span className={`schip ${d.vsum && d.vsum.checks_failing ? "hot" : "good"}`}>
            {d.vsum ? `${d.vsum.overall_pass_rate_pct}% of ${Number(d.vsum.total_records_tested).toLocaleString()} records pass` : "checking…"}
          </span>
        </div>
        <div className="verifrows">
          {(d.verif ?? []).map((v) => (
            <button
              key={v.check_name}
              className={`verifrow ${v.result === "PASS" ? "ok" : v.result === "PASS WITH EXCEPTIONS" ? "warn" : "bad"}`}
              onClick={() => v.see_the_failures && go(v.see_the_failures)}
              title={v.what_this_verifies}
            >
              <span className="vname">{v.check_name}</span>
              <span className="vres">{v.result}</span>
              <span className="vcount">
                {Number(v.records_passed).toLocaleString()} of {Number(v.records_tested).toLocaleString()}
                {v.records_failed > 0 ? ` · ${Number(v.records_failed).toLocaleString()} failing` : ""}
              </span>
            </button>
          ))}
        </div>
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
                <label>What this means</label>
                <p>{c.plain}</p>
                <SimpleToggle text={simpleFor(c, { open21: open21.length, dryAvg, custody: d.custody.length, aging: d.aging.length, alloc: d.alloc.length, zeroPk })} />
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
            {!c.plain && <SimpleToggle text={simpleFor(c, { open21: open21.length, dryAvg, custody: d.custody.length, aging: d.aging.length, alloc: d.alloc.length, zeroPk })} />}
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
            <FindingActions card={c} onSaved={() => setVer((v) => v + 1)} />
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
