/* OpenClaw-style runtime for the OS clone.
   Always-on while this tab is open. Skills are reusable jobs.
   Routines fire on the clock. Metrc stays read-only. */

export const SKILLS = {
  topg: [
    { id: "brief", name: "Daily brief", ask: "What is on fire this week? Quiet if clean." },
    { id: "eod", name: "End of day", ask: "End of day brief. Quiet if empty." },
    { id: "board", name: "Research the board", ask: "Research the board. Decisions due today." },
  ],
  command: [
    { id: "now", name: "Need action now", ask: "Need-action-now. Quiet if clean." },
  ],
  cultivation: [
    { id: "harvest", name: "Harvest this week", ask: "Harvest schedule this week. Quiet if empty." },
  ],
  metrc: [
    { id: "queues", name: "Queue sweep", ask: "Need-action-now queues. Read only. Quiet if empty." },
  ],
  cfo: [
    { id: "apex", name: "Apex book", ask: "Open the Apex book. What needs a human today?" },
  ],
  hr: [
    { id: "clock", name: "Who is on the clock", ask: "Who is on the clock? Quiet if empty." },
    { id: "prod", name: "Production schedule", ask: "Production schedule this week. Quiet if empty." },
  ],
  apex: [
    { id: "ship", name: "Receiving and shipping", ask: "Receiving and shipping. Quiet if empty." },
  ],
  quality: [
    { id: "coa", name: "COA gaps", ask: "Failed with no disposition. COA gaps. Quiet if empty." },
  ],
};

const RUNS_KEY = "tg-os-routine-runs";

export function skillsFor(botId) {
  return SKILLS[botId] || [];
}

export function loadRuns() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RUNS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 40) : [];
  } catch { return []; }
}

export function recordRun(entry) {
  const next = [entry, ...loadRuns()].slice(0, 40);
  try { localStorage.setItem(RUNS_KEY, JSON.stringify(next)); } catch { /* private */ }
  return next;
}

function minutesOf(h, m, ap) {
  let hour = Number(h);
  const min = Number(m);
  const p = String(ap || "").toUpperCase();
  if (p === "PM" && hour < 12) hour += 12;
  if (p === "AM" && hour === 12) hour = 0;
  return hour * 60 + min;
}

export function timesInWhen(when) {
  const out = [];
  const re = /(\d{1,2}):(\d{2})\s*(AM|PM)/gi;
  let m;
  while ((m = re.exec(String(when || ""))) !== null) {
    out.push(minutesOf(m[1], m[2], m[3]));
  }
  return out;
}

export function dueThisMinute(when, now = new Date()) {
  const text = String(when || "");
  if (/after every dry/i.test(text)) return false;
  const times = timesInWhen(text);
  if (!times.length) return false;
  const weekday = now.getDay() >= 1 && now.getDay() <= 5;
  if (/weekday/i.test(text) && !weekday) return false;
  const hm = now.getHours() * 60 + now.getMinutes();
  return times.includes(hm);
}

export function dayKey(d = new Date()) {
  return d.toDateString();
}
