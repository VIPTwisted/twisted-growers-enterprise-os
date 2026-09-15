import { getConfig } from './config.js'
// greetings.js — the greeting engine (white-label: the company name is read from the config rows at call time).
// Energetic, crew-focused greetings shown at login / clock-in for a cultivation, manufacturing and (soon) retail team. 50+ built-in
// lines; the AI proposes 25 more every 30 days for COO approval; approved lines
// join the rotation and are recycled so messages stay fresh but never stale.
// Good vibes only — every shift starts happy, energetic, and ready to grow.

const LS_APPROVED = 'vip_greetings_approved'   // COO-approved custom lines
const LS_PENDING = 'vip_greetings_pending'     // AI proposals awaiting COO
const LS_LASTGEN = 'vip_greetings_lastgen'     // ISO date of last AI batch
const LS_RECENT = 'vip_greetings_recent'       // recently shown (avoid repeats)

// ── 50+ built-in energetic greetings ──────────────────────────────────
export const BASE_GREETINGS = [
  "Let's make today count — steady hands, clean rooms, healthy plants. 🌱",
  "Good vibes only. Your energy sets the tone for the whole grow. ⚡",
  "New shift, fresh start — bring the focus that makes great flower. 😄",
  "Every plant you touch today is someone's best day later. Treat it that way. ✨",
  "Happy + focused = contagious. Spread it through every room. 💫",
  "Water, IPM, defol — do the small things right and the harvest takes care of itself. 💪",
  "Clean tags, clean rooms, clean weights. That's how we win. 🏷️",
  "Your care is our best product. Show it off today. 🌟",
  "Ready, set, grow — every plant, every time. 🎯",
  "Trim like it's going to be judged — because it is. ✂️",
  "A tidy dry room is a happy dry room. Own it today. 🌬️",
  "Extraction day: precision first, speed second, safety always. 🧪",
  "Pre-rolls that look this good don't happen by accident. Nice work being you. 🔥",
  "Packaging is the last hand on the product. Make it the best one. 📦",
  "Metrc is the record of truth — scan it, log it, no shortcuts. ✅",
  "Big harvest energy today. Bring the good scissors. 🌿",
  "Check the room before you leave it — lights, fans, doors, tags. 👀",
  "Stay hydrated. The plants aren't the only ones who need water. 💧",
  "Ask early, ask often — nobody here minds a question. 🙋",
  "You don't grow a great crop alone. Look after your crew today. 🤝",
  "A clean workstation is a fast workstation. Start there. 🧼",
  "Weights honest, counts exact, notes clear — that's the whole job. 📋",
  "Every seedling is a promise. Keep it. 🌱",
  "Fresh gloves, fresh mind. Let's go. 🧤",
  "Flip day! Move with purpose and keep the lines straight. 🔁",
  "Small wins stack. Get one before your first break. 🧱",
  "Bring your best mood — the room can tell. ☀️",
  "Safety glasses, closed toes, clear head. All day. 🥽",
  "Today is a good day to be the person who noticed the thing. 🔍",
  "Six days straight is a red flag, not a badge. Take your day off. 🛌",
  "Trim table talk is welcome. Trim table shortcuts are not. 🗣️",
  "If it's not tagged, it doesn't exist. Tag it. 🏷️",
  "Great cure needs patience. So does a great team. ⏳",
  "Leave every room better than you found it. 🚪",
  "Coffee, then canopy. ☕",
  "Your consistency is what customers taste. Keep it consistent. 🍃",
  "Make the next person's shift easier — restock, label, wipe down. 🔄",
  "Zero surprises for the closer. That's the standard. 🌙",
  "Two waves for lunch: the floor never goes empty. Eat well, come back sharp. 🥪",
  "Be the calm one when the pump alarm goes off. 🚨",
  "Weigh it twice, write it once. ⚖️",
  "New strain in Flower 3 — go say hello. 👋",
  "Today's tiny detail becomes next month's test result. Nail it. 🧫",
  "Strong start, strong finish — and everything in between labelled. 🏁",
  "Nobody in training works alone. Pair up, teach up. 👥",
  "The best fix is the one you flagged early. Speak up. 📣",
  "Keep the aisles clear and the humidity right. 🌡️",
  "Grind day: masks on, music up, output up. 🎧",
  "Clock in, glove up, own your zone. 🗺️",
  "Thank you for being here. This place runs on you. 💚",
]

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const load = (k, def) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : def } catch { return def } }
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* */ } }
// durably sync the COO-approved + pending greeting queues cross-device
export async function hydrateGreetings() {
  try {
    const { hydrate } = await import('./syncStore.js')
    await Promise.all([hydrate(LS_APPROVED), hydrate(LS_PENDING)])
  } catch (_) {}
}
function saveG(k, v) { save(k, v); try { import('./syncStore.js').then(m => m.saveSynced(k, v)).catch(() => {}) } catch (_) {} }

export function getApproved() { return load(LS_APPROVED, []) }
export function getPending() { return load(LS_PENDING, []) }

// approve / reject an AI-proposed greeting (COO action)
export function approveGreeting(id) {
  const pending = getPending(); const g = pending.find(x => x.id === id); if (!g) return
  saveG(LS_PENDING, pending.filter(x => x.id !== id))
  saveG(LS_APPROVED, [...getApproved(), g.text])
}
export function rejectGreeting(id) { saveG(LS_PENDING, getPending().filter(x => x.id !== id)) }

// AI proposes 25 fresh greetings every 30 days (COO must approve).
// Deterministic recombination of energetic fragments — no external call needed.
const OPENERS = () => ["Let's", 'Today', 'This shift', 'Right now', 'Come on team', getConfig().company_name || 'Team', "Let's go —", 'Starting now', 'Every room —', 'From open to close']
const MIDS = ['bring big energy', 'lead with a smile', 'spread good vibes', 'stay happy and sharp', 'keep every tag honest', 'make it clean and calm', 'keep the rooms dialled in', 'radiate positivity', 'grow with heart', 'own your zone', 'be contagiously upbeat', 'look after your crew']
const CLOSERS = () => ['and watch the harvest follow. 📈', '— the plants can feel it. ✨', 'and make today count. 🔥', 'because good vibes grow. 💚', 'and leave the room better. 😄', `— that's the ${getConfig().company_name || 'team'} way. ⭐`, 'and outshine yesterday. 🌟', 'so the next shift starts easy. 🔄']
function pick(arr, n) { return arr[n % arr.length] }

export function maybeGenerateBatch() {
  const last = load(LS_LASTGEN, null)
  const now = new Date()
  if (last) { const days = (now - new Date(last)) / 86400000; if (days < 30) return { generated: 0 } }
  const seedBase = getApproved().length + getPending().length
  const batch = Array.from({ length: 25 }, (_, i) => {
    const s = seedBase + i
    const text = `${pick(OPENERS(), s * 3)} ${pick(MIDS, s * 5 + 1)} ${pick(CLOSERS(), s * 7 + 2)}`
    return { id: `g-${iso(now)}-${i}`, text, proposed_at: now.toISOString() }
  })
  saveG(LS_PENDING, [...getPending(), ...batch])
  save(LS_LASTGEN, iso(now))
  return { generated: batch.length }
}

// full active pool = built-ins + COO-approved
export function greetingPool() { return [...BASE_GREETINGS, ...getApproved()] }

// recycle without repeating recent ones
function nextGreeting(salt = 0) {
  const pool = greetingPool()
  const recent = load(LS_RECENT, [])
  const fresh = pool.filter(g => !recent.includes(g))
  const avail = fresh.length ? fresh : pool
  // deterministic-but-varied index from time + salt (no Math.random needed)
  const idx = (new Date().getHours() * 7 + new Date().getMinutes() + salt) % avail.length
  const chosen = avail[idx]
  const nextRecent = [chosen, ...recent].slice(0, Math.min(20, Math.floor(pool.length / 2)))
  save(LS_RECENT, nextRecent)
  return chosen
}

// time-of-day salutation
export function salutation(name) {
  const h = new Date().getHours()
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  const first = (name || '').split(' ')[0] || 'there'
  return `${part}, ${first}!`
}

// The full login/clock-in briefing.
// opts: { name, isLate, minutesLate, hasMessages, messageCount, scheduledShift, mode }
export function buildBriefing(opts = {}) {
  maybeGenerateBatch() // lazily queue a COO batch if 30 days elapsed
  const { name, isLate, minutesLate, hasMessages, messageCount, scheduledShift, mode } = opts
  return {
    salutation: salutation(name),
    greeting: nextGreeting(mode === 'clockin' ? 3 : 0),
    lateWarning: isLate ? `⏰ You're clocking in ${minutesLate ? `${minutesLate} min ` : ''}late${scheduledShift ? ` for your ${scheduledShift} shift` : ''}. Please let your manager know — punctuality keeps the floor covered.` : null,
    messageReminder: hasMessages ? `📨 You have ${messageCount || 'new'} message${messageCount === 1 ? '' : 's'} / alert${messageCount === 1 ? '' : 's'} — please check them before you start.` : null,
    floorReminder: mode === 'clockin' ? "🚫 Reminder: no food, drink, or phones in the grow and production rooms — gloves, glasses and closed toes on. New shift: happy, energetic, and ready to grow!" : null,
  }
}
