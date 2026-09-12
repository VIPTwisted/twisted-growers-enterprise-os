"""De-VIP the content-in-code screens of the HR clone (app/hr).

VIP's handbook, store procedures, policies, law alerts, sample documents, retail sales course text and
Connecticut statute checklists are hard-coded in a handful of screens as the fallback shown when the
database is empty. For Twisted Growers that content is VIP data. This script replaces each block with:
  - a Twisted Growers / Massachusetts skeleton, every paragraph marked DRAFT for HR to complete, where the
    screen needs a structure to edit (handbook, ops manual, policy list, law alerts, course lessons); or
  - an honest empty state (no sample rows) where the screen is a list of real records.
Run once from the repo root: python tools/hr-clone/devip_content.py
"""
import re, sys, io
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "app" / "hr" / "src" / "screens"

def replace_const(src: str, name: str, new_value: str, opener: str = "[") -> str:
    """Replace `const NAME = [ ... ]` (or { ... }) whose closing bracket sits at column 0."""
    closer = "]" if opener == "[" else "}"
    pattern = "^(export )?const " + name + " = " + re.escape(opener) + "\\n.*?^" + re.escape(closer) + "\\n"
    m = re.search(pattern, src, flags=re.S | re.M)
    if not m:
        raise SystemExit(f"{name} not found")
    prefix = m.group(1) or ""
    return src[:m.start()] + f"{prefix}const {name} = {new_value}\n" + src[m.end():]

DRAFT = "DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder."

# ── Manual.jsx ──────────────────────────────────────────────────────────────────────────────────
HANDBOOK = """[
  {
    id: 'hb-overview', title: 'Company Overview', icon: '🏢',
    content: [
      { type: 'heading', text: 'About Twisted Growers' },
      { type: 'para', text: 'Twisted Growers is a licensed Massachusetts cannabis cultivator (MC281714) and product manufacturer (MP281909) at 415 Millennium Circle, Lakeville, MA, with a dispensary planned. Every plant and package we touch is tracked in Metrc, the Commonwealth\\'s seed-to-sale system.' },
      { type: 'heading', text: 'Our Mission' },
      { type: 'para', text: '""" + DRAFT + """' },
    ],
  },
  {
    id: 'hb-employment', title: 'Employment Basics', icon: '📋',
    content: [
      { type: 'heading', text: 'At-Will Employment' },
      { type: 'para', text: 'Employment with Twisted Growers is at-will under Massachusetts law: either the employee or the company may end the relationship at any time, with or without cause or notice, subject to applicable law. Nothing in this handbook creates a contract of employment. """ + DRAFT + """' },
      { type: 'heading', text: 'Equal Employment Opportunity' },
      { type: 'para', text: 'Twisted Growers does not discriminate on any basis protected by M.G.L. c.151B or federal law, including hair texture and protective hairstyles (CROWN Act, 2022). """ + DRAFT + """' },
      { type: 'heading', text: 'Agent Registration' },
      { type: 'para', text: 'Every employee must hold a Cannabis Control Commission agent registration before working with product and must wear the agent badge on shift (935 CMR 500.030). A lapsed registration means no floor work until it is renewed. """ + DRAFT + """' },
    ],
  },
  {
    id: 'hb-attendance', title: 'Attendance & Scheduling', icon: '🕒',
    content: [
      { type: 'heading', text: 'Schedules' },
      { type: 'para', text: 'Schedules are drafted in the HR platform and posted a week at a time by a sign-off role. Swaps, call-outs and availability changes are made in the app so the floor is never short without notice. """ + DRAFT + """' },
      { type: 'heading', text: 'Call-outs' },
      { type: 'para', text: 'Call out through the app as early as you can; the notice window is set in Settings › Attendance. A no-call/no-show is recorded against the attendance policy. """ + DRAFT + """' },
    ],
  },
  {
    id: 'hb-pay', title: 'Pay & Time', icon: '💵',
    content: [
      { type: 'heading', text: 'Wages & Overtime' },
      { type: 'para', text: 'Massachusetts minimum wage is $15.00 per hour (M.G.L. c.151 §1). Overtime is paid at 1.5× for hours over 40 in a week (c.151 §1A). Wages are paid on the schedule set in Settings and within the timing M.G.L. c.149 §148 requires. """ + DRAFT + """' },
      { type: 'heading', text: 'Meal Breaks' },
      { type: 'para', text: 'A 30-minute unpaid meal break is provided on any shift longer than six hours (M.G.L. c.149 §100); breaks run in two waves so the floor is never empty. """ + DRAFT + """' },
      { type: 'heading', text: 'Time Clock' },
      { type: 'para', text: 'Clock in and out at the kiosk or in the app with your Employee ID and PIN. Edits to a punch are requested through your manager and are kept in the audit trail. """ + DRAFT + """' },
    ],
  },
  {
    id: 'hb-timeoff', title: 'Time Off & Leave', icon: '🏖️',
    content: [
      { type: 'heading', text: 'Earned Sick Time' },
      { type: 'para', text: 'Under M.G.L. c.149 §148C employees accrue one hour of earned sick time for every 30 hours worked, up to 40 hours per year. """ + DRAFT + """' },
      { type: 'heading', text: 'Paid Family & Medical Leave' },
      { type: 'para', text: 'Massachusetts PFML (M.G.L. c.175M) provides paid family and medical leave through the Department of Family and Medical Leave; the notice of rights is provided at hire. """ + DRAFT + """' },
      { type: 'heading', text: 'PTO' },
      { type: 'para', text: '""" + DRAFT + """' },
    ],
  },
  {
    id: 'hb-conduct', title: 'Conduct, Safety & Drug-Free Workplace', icon: '🛡️',
    content: [
      { type: 'heading', text: 'Drug-Free Workplace' },
      { type: 'para', text: 'No cannabis or alcohol may be consumed on the premises or during a shift, and no employee may work impaired (935 CMR 500.105). """ + DRAFT + """' },
      { type: 'heading', text: 'Safety' },
      { type: 'para', text: 'Gloves, eye protection and closed-toe footwear are required in grow and production rooms; extraction rooms follow their own written safety procedures. Report every injury the same day. """ + DRAFT + """' },
      { type: 'heading', text: 'Anti-Harassment' },
      { type: 'para', text: 'Twisted Growers maintains a written sexual-harassment policy distributed annually as M.G.L. c.151B §3A requires. """ + DRAFT + """' },
    ],
  },
  {
    id: 'hb-compliance', title: 'Compliance & Metrc', icon: '🏷️',
    content: [
      { type: 'heading', text: 'Metrc is the Record of Truth' },
      { type: 'para', text: 'Every plant, harvest and package carries a Metrc tag. If it is not tagged, it does not exist. Any difference between a spreadsheet and Metrc is resolved in Metrc\\'s favour and logged for review. Diversion is grounds for immediate termination and is reported to the Commission. """ + DRAFT + """' },
      { type: 'heading', text: 'Security & Confidentiality' },
      { type: 'para', text: 'Access-controlled rooms and video surveillance are required by 935 CMR 500.110. Standard operating procedures, yields, pricing and customer information are confidential. Nothing in this section limits your right to discuss wages or working conditions with coworkers. """ + DRAFT + """' },
    ],
  },
]"""

OPS = """[
  { id: 'ops-opening', title: 'Opening — Grow & Production', icon: '🌅', steps: [
    { num: 1, text: 'Badge in at the kiosk; agent badge visible. """ + DRAFT + """' },
    { num: 2, text: 'Walk every room: temperature, humidity, lights, fans, doors. Log anything off.' },
    { num: 3, text: 'Check the day\\'s posted schedule and your zone in the app.' },
  ]},
  { id: 'ops-closing', title: 'Closing', icon: '🌙', steps: [
    { num: 1, text: 'Rooms tidy, tools cleaned, waste logged in Metrc. """ + DRAFT + """' },
    { num: 2, text: 'Leave zero surprises for the opener: restock, label, note.' },
    { num: 3, text: 'Badge out. Do not leave with product, tags or notes.' },
  ]},
  { id: 'ops-harvest', title: 'Harvest Day', icon: '✂️', steps: [
    { num: 1, text: 'Confirm the harvest batch and plant tags in Metrc before the first cut. """ + DRAFT + """' },
    { num: 2, text: 'Weigh wet at the room; weights are entered once, at the scale.' },
    { num: 3, text: 'Hang in the assigned dry room; label the rack with the harvest name.' },
  ]},
  { id: 'ops-trim', title: 'Trim Room', icon: '🌿', steps: [
    { num: 1, text: 'Gloves on, station wiped, scale zeroed. """ + DRAFT + """' },
    { num: 2, text: 'One harvest per table at a time; never mix tags.' },
  ]},
  { id: 'ops-extraction', title: 'Extraction', icon: '🧪', steps: [
    { num: 1, text: 'Follow the room\\'s written safety procedure; never work alone in the hydrocarbon room. """ + DRAFT + """' },
  ]},
  { id: 'ops-packaging', title: 'Packaging & Labelling', icon: '📦', steps: [
    { num: 1, text: 'Every finished unit carries the Metrc package tag and the required Massachusetts label. """ + DRAFT + """' },
  ]},
]"""

CONTACTS = """[
  // Filled in Settings › Locations once HR enters Twisted Growers contacts. Emergency: 911.
  { name: 'Police / Fire / EMS', role: 'Emergency', phone: '911', email: '—' },
]"""

BENEFIT_DATES = "[]  // HR sets Twisted Growers enrollment windows in Benefits › Administration"
TRAINING_DEADLINES = "[]  // Training deadlines come from Training › Modules once HR assigns them"

# ── HandbookBuilder.jsx ─────────────────────────────────────────────────────────────────────────
FULL_POLICIES = """[
  { id: 1,  category: 'Handbook',   title: 'Purpose of the Employee Handbook',        version: '0.1', effective: '', ackRequired: true,  content: '""" + DRAFT + """' },
  { id: 2,  category: 'Handbook',   title: 'Right to Revise',                          version: '0.1', effective: '', ackRequired: false, content: '""" + DRAFT + """' },
  { id: 3,  category: 'Handbook',   title: 'Confidentiality of this Manual',           version: '0.1', effective: '', ackRequired: true,  content: '""" + DRAFT + """' },
  { id: 4,  category: 'Onboarding', title: 'Welcome — Your First Two Weeks',           version: '0.1', effective: '', ackRequired: false, content: '""" + DRAFT + """' },
  { id: 5,  category: 'Onboarding', title: 'Agent Registration & Badge',               version: '0.1', effective: '', ackRequired: true,  content: 'Every employee holds a CCC agent registration and wears the badge on shift (935 CMR 500.030). """ + DRAFT + """' },
  { id: 6,  category: 'Employment', title: 'At-Will Employment',                       version: '0.1', effective: '', ackRequired: true,  content: '""" + DRAFT + """' },
  { id: 7,  category: 'Employment', title: 'Equal Employment Opportunity',             version: '0.1', effective: '', ackRequired: true,  content: 'M.G.L. c.151B; CROWN Act. """ + DRAFT + """' },
  { id: 8,  category: 'Employment', title: 'Anti-Harassment (M.G.L. c.151B §3A)',      version: '0.1', effective: '', ackRequired: true,  content: 'Distributed annually. """ + DRAFT + """' },
  { id: 9,  category: 'Attendance', title: 'Attendance, Punctuality & Call-outs',      version: '0.1', effective: '', ackRequired: true,  content: '""" + DRAFT + """' },
  { id: 10, category: 'Attendance', title: 'Scheduling, Swaps & Open Shifts',          version: '0.1', effective: '', ackRequired: false, content: '""" + DRAFT + """' },
  { id: 11, category: 'Pay',        title: 'Wages, Overtime & Pay Days',               version: '0.1', effective: '', ackRequired: true,  content: 'MA minimum wage $15.00 (c.151 §1); OT 1.5× over 40 h (c.151 §1A). """ + DRAFT + """' },
  { id: 12, category: 'Pay',        title: 'Meal Breaks (M.G.L. c.149 §100)',          version: '0.1', effective: '', ackRequired: false, content: '30 minutes on shifts over six hours; two waves. """ + DRAFT + """' },
  { id: 13, category: 'Leave',      title: 'Earned Sick Time (M.G.L. c.149 §148C)',    version: '0.1', effective: '', ackRequired: true,  content: '1 hour per 30 worked, up to 40 hours a year. """ + DRAFT + """' },
  { id: 14, category: 'Leave',      title: 'Paid Family & Medical Leave (c.175M)',     version: '0.1', effective: '', ackRequired: true,  content: '""" + DRAFT + """' },
  { id: 15, category: 'Leave',      title: 'PTO & Holidays',                           version: '0.1', effective: '', ackRequired: false, content: '""" + DRAFT + """' },
  { id: 16, category: 'Conduct',    title: 'Drug-Free Workplace (935 CMR 500.105)',    version: '0.1', effective: '', ackRequired: true,  content: '""" + DRAFT + """' },
  { id: 17, category: 'Conduct',    title: 'Code of Conduct',                          version: '0.1', effective: '', ackRequired: true,  content: '""" + DRAFT + """' },
  { id: 18, category: 'Conduct',    title: 'Progressive Discipline',                   version: '0.1', effective: '', ackRequired: true,  content: '""" + DRAFT + """' },
  { id: 19, category: 'Safety',     title: 'PPE, Rooms & Extraction Safety',           version: '0.1', effective: '', ackRequired: true,  content: '""" + DRAFT + """' },
  { id: 20, category: 'Safety',     title: 'Injury Reporting & Workers\\' Compensation', version: '0.1', effective: '', ackRequired: true,  content: '""" + DRAFT + """' },
  { id: 21, category: 'Compliance', title: 'Metrc — Tags, Weights & Record of Truth',  version: '0.1', effective: '', ackRequired: true,  content: 'If it is not tagged, it does not exist. Metrc overrides every spreadsheet. """ + DRAFT + """' },
  { id: 22, category: 'Compliance', title: 'Diversion & Inventory Integrity',          version: '0.1', effective: '', ackRequired: true,  content: '""" + DRAFT + """' },
  { id: 23, category: 'Compliance', title: 'Security, Access & Surveillance (935 CMR 500.110)', version: '0.1', effective: '', ackRequired: true, content: '""" + DRAFT + """' },
  { id: 24, category: 'Compliance', title: 'Confidentiality & Data',                   version: '0.1', effective: '', ackRequired: true,  content: '""" + DRAFT + """' },
]"""

LAW_ALERTS = """[
  { id: 1, title: 'MA Minimum Wage — $15.00/hr', scope: 'State', affects: 'Compensation Policy, Pay Practices', detail: 'Massachusetts minimum wage is $15.00 per hour (M.G.L. c.151 §1). Confirm every rate on file is at or above it. Verify with counsel before publishing.' },
  { id: 2, title: 'MA Earned Sick Time', scope: 'State', affects: 'Leave Policy, PTO', detail: 'Employees accrue 1 hour per 30 hours worked, up to 40 hours a year (M.G.L. c.149 §148C); poster and notice required.' },
  { id: 3, title: 'MA Paid Family & Medical Leave', scope: 'State', affects: 'Leave Policy, Payroll', detail: 'Contributions and the written notice of rights within 30 days of hire (M.G.L. c.175M).' },
  { id: 4, title: 'MA CROWN Act — Hair Discrimination Protections', scope: 'State', affects: 'Dress Code & Appearance', detail: 'Discrimination based on hair texture or protective hairstyle is prohibited (M.G.L. c.151B §4, 2022).' },
  { id: 5, title: 'CCC Agent Registration & Training', scope: 'State', affects: 'Onboarding, Training', detail: 'Every marijuana establishment agent must be registered with the Cannabis Control Commission and complete the required annual training (935 CMR 500.030, 500.105). Verify current hours with the CCC.' },
  { id: 6, title: 'MA Anti-Harassment Policy — Annual Distribution', scope: 'State', affects: 'Conduct, Handbook', detail: 'A written sexual-harassment policy must be adopted and distributed to every employee annually (M.G.L. c.151B §3A).' },
  { id: 7, title: 'Federal FLSA Overtime Threshold', scope: 'Federal', affects: 'Overtime Policy, Pay Practices', detail: 'Review salaried exempt classifications against the current DOL salary threshold.' },
  { id: 8, title: 'Federal Pregnant Workers Fairness Act', scope: 'Federal', affects: 'Leave Policy, EEO', detail: 'EEOC regulations require reasonable accommodation for pregnancy, childbirth and related conditions.' },
]"""

TG_ROLES = "['Admin/Owner', 'CEO', 'CFO', 'HR Manager', 'Department Head', 'Lead', 'Associate']"

# ── CTCompliance.jsx → Massachusetts ────────────────────────────────────────────────────────────
MA_CATEGORIES = """function buildCategories(config) {
  return [
    {
      id: 'wage-hour',
      name: 'MA WAGE & HOUR',
      items: [
        { id: 'mawh1', label: `Minimum wage posted ($${config.min_wage}/hr — M.G.L. c.151 §1)` },
        { id: 'mawh2', label: `Overtime paid at ${config.ot_multiplier}× for >${config.ot_threshold_weekly}h/week (c.151 §1A)` },
        { id: 'mawh3', label: 'Wages paid within the timing of M.G.L. c.149 §148; pay stubs on each pay date' },
        { id: 'mawh4', label: 'Payroll records retained 3+ years (c.151 §15)' },
        { id: 'mawh5', label: 'Discharged employees paid in full on the day of discharge (c.149 §148)' },
        { id: 'mawh6', label: '30-minute meal break on shifts over 6 hours (c.149 §100)' },
      ],
    },
    {
      id: 'sick-time',
      name: 'MA EARNED SICK TIME — c.149 §148C',
      items: [
        { id: 'mast1', label: 'Accrual rate correct (1 hr per 30 h worked)' },
        { id: 'mast2', label: `Cap enforced (${config.paid_leave_accrual_hours} hours/year)` },
        { id: 'mast3', label: 'Earned Sick Time poster displayed' },
        { id: 'mast4', label: 'Employees notified of rights at hire' },
        { id: 'mast5', label: 'Records maintained for 3 years' },
      ],
    },
    {
      id: 'pfml',
      name: 'MA PAID FAMILY & MEDICAL LEAVE — c.175M',
      items: [
        { id: 'mapf1', label: 'PFML poster displayed' },
        { id: 'mapf2', label: 'Written notice of rights given within 30 days of hire (signed)' },
        { id: 'mapf3', label: 'Contributions remitted to the Department of Family and Medical Leave' },
        { id: 'mapf4', label: 'Leave policy in employee handbook' },
      ],
    },
    {
      id: 'cannabis',
      name: 'CANNABIS CONTROL COMMISSION — 935 CMR 500',
      items: [
        { id: 'macc1', label: 'Every employee holds a current agent registration (500.030)' },
        { id: 'macc2', label: 'Agent badges worn on the premises' },
        { id: 'macc3', label: 'Required annual agent training completed and recorded (500.105)' },
        { id: 'macc4', label: 'Diversion and theft reporting procedure in place' },
        { id: 'macc5', label: 'Security, access and surveillance requirements met (500.110)' },
        { id: 'macc6', label: 'Metrc entries current; discrepancies logged and reviewed' },
      ],
    },
    {
      id: 'posters',
      name: 'REQUIRED POSTINGS',
      items: [
        { id: 'mapo1', label: 'MA Wage & Hour laws poster' },
        { id: 'mapo2', label: 'MA Fair Employment (c.151B) poster' },
        { id: 'mapo3', label: 'Unemployment Insurance and Workers\\' Compensation notices' },
        { id: 'mapo4', label: 'Parental Leave notice (c.149 §105D)' },
        { id: 'mapo5', label: 'Federal posters: FLSA, EEO, OSHA, FMLA, USERRA, EPPA' },
      ],
    },
    {
      id: 'harassment',
      name: 'ANTI-HARASSMENT — c.151B §3A',
      items: [
        { id: 'mahr1', label: 'Written sexual-harassment policy adopted' },
        { id: 'mahr2', label: 'Policy distributed to every employee annually (acknowledgments on file)' },
        { id: 'mahr3', label: 'Complaint procedure and MCAD / EEOC contact information included' },
      ],
    },
  ]
}"""

# ── Academy.courses.js ──────────────────────────────────────────────────────────────────────────
COURSES = """// Bilingual course lesson content — loaded dynamically by Academy.jsx
// This module exports buildCourses(lang) which returns full lesson objects.
// Twisted Growers starter curriculum. Every lesson is a DRAFT skeleton for the training lead to
// complete in Academy › Courses; nothing here is a certified procedure until it is reviewed.

const D = { en: 'DRAFT — the training lead completes this lesson in Academy › Courses.', es: 'BORRADOR — el responsable de formación completa esta lección en Academy › Courses.' }
const t = (lang, en, es) => (lang === 'es' ? es : en)

export function buildCourses(lang) {
  const d = t(lang, D.en, D.es)
  return [
    {
      id: 'cultivation-basics',
      lessons: [
        { title: t(lang, 'Welcome to the Grow', 'Bienvenido al cultivo'), content: t(lang, 'The four flowering rooms, veg, mother and clone rooms, and the dry and cure rooms — what happens in each, and why every plant carries a Metrc tag. ' + d, 'Las cuatro salas de floración, vegetativo, madres y clones, y las salas de secado y curado: qué ocurre en cada una y por qué cada planta lleva una etiqueta Metrc. ' + d), quiz: null },
        { title: t(lang, 'Water, IPM, Defoliation', 'Riego, MIP, defoliación'), content: d, quiz: null },
        { title: t(lang, 'Room Readings & Logs', 'Lecturas y registros de sala'), content: d,
          quiz: { question: t(lang, 'A plant without a Metrc tag is…', 'Una planta sin etiqueta Metrc es…'), options: t(lang, ['Fine if the room is labelled', 'A violation — stop and tell your lead', 'Normal for clones'], ['Aceptable si la sala está etiquetada', 'Una infracción: detente y avisa a tu responsable', 'Normal en clones']), answer: 1 } },
      ],
    },
    {
      id: 'metrc-tagging',
      lessons: [
        { title: t(lang, 'Metrc is the Record of Truth', 'Metrc es el registro de la verdad'), content: t(lang, 'Plant tags, harvest batches and package tags: what each one means, and why a spreadsheet never overrides Metrc. ' + d, 'Etiquetas de planta, lotes de cosecha y etiquetas de paquete: qué significa cada una y por qué una hoja de cálculo nunca prevalece sobre Metrc. ' + d), quiz: null },
        { title: t(lang, 'Weights: Weigh Twice, Write Once', 'Pesos: pesa dos veces, escribe una'), content: d, quiz: null },
      ],
    },
    {
      id: 'trim-standards',
      lessons: [
        { title: t(lang, 'Trim Room Setup', 'Preparación de la sala de recorte'), content: d, quiz: null },
        { title: t(lang, 'One Harvest per Table', 'Una cosecha por mesa'), content: d, quiz: null },
      ],
    },
    {
      id: 'extraction-safety',
      lessons: [
        { title: t(lang, 'Hydrocarbon Room Rules', 'Normas de la sala de hidrocarburos'), content: t(lang, 'Never alone in the room; ventilation and gas detection checked before every run. ' + d, 'Nunca solo en la sala; ventilación y detección de gas comprobadas antes de cada ciclo. ' + d), quiz: null },
        { title: t(lang, 'Solventless Basics', 'Fundamentos sin solventes'), content: d, quiz: null },
      ],
    },
    {
      id: 'packaging-labeling',
      lessons: [
        { title: t(lang, 'Massachusetts Label Requirements', 'Requisitos de etiquetado de Massachusetts'), content: d, quiz: null },
        { title: t(lang, 'Finish Pack & the Vault', 'Empaque final y la bóveda'), content: d, quiz: null },
      ],
    },
    {
      id: 'ma-cannabis-compliance',
      lessons: [
        { title: t(lang, 'Agent Registration & Badge', 'Registro de agente y credencial'), content: t(lang, 'Every employee is a registered agent with the Cannabis Control Commission (935 CMR 500.030) and wears the badge on shift. ' + d, 'Cada empleado es un agente registrado ante la Cannabis Control Commission (935 CMR 500.030) y lleva la credencial durante el turno. ' + d), quiz: null },
        { title: t(lang, 'Diversion, Security & Reporting', 'Desvío, seguridad y reportes'), content: d, quiz: null },
      ],
    },
  ]
}
"""

def main():
    # Manual.jsx
    p = ROOT / "Manual.jsx"; s = p.read_text(encoding="utf-8")
    s = replace_const(s, "HANDBOOK_SECTIONS", HANDBOOK)
    s = replace_const(s, "OPS_SECTIONS", OPS)
    s = replace_const(s, "CONTACTS", CONTACTS)
    s = replace_const(s, "BENEFIT_DATES", BENEFIT_DATES)
    s = replace_const(s, "TRAINING_DEADLINES", TRAINING_DEADLINES)
    s = s.replace("status: 'Open – Reduced Hours'", "status: 'To be set by HR'").replace("status: 'Closed'", "status: 'To be set by HR'").replace("status: 'Open'", "status: 'To be set by HR'")
    s = s.replace("// HANDBOOK CONTENT — VIP Employee Handbook", "// HANDBOOK CONTENT — Twisted Growers starter skeleton (DRAFT until published in the Handbook Builder)")
    p.write_text(s, encoding="utf-8", newline="\n")

    # HandbookBuilder.jsx
    p = ROOT / "HandbookBuilder.jsx"; s = p.read_text(encoding="utf-8")
    s = replace_const(s, "FULL_POLICIES", FULL_POLICIES)
    s = replace_const(s, "LAW_ALERTS", LAW_ALERTS)
    s = re.sub(r"^const ROLES = \[.*?\]$", "const ROLES = " + TG_ROLES, s, count=1, flags=re.M)
    p.write_text(s, encoding="utf-8", newline="\n")

    # Documents.jsx — no sample rows, no VIP text
    p = ROOT / "Documents.jsx"; s = p.read_text(encoding="utf-8")
    s = replace_const(s, "DOC_CONTENT", "{}  // document bodies come from the database (get_my_assigned_documents)", opener="{")
    s = re.sub(r"^const LOCATIONS = \[.*?\]$", "const LOCATIONS = ['Lakeville — Cultivation (MC281714)', 'Lakeville — Manufacturing (MP281909)', 'Dispensary (planned)']", s, count=1, flags=re.M)
    for name in ("MY_DOCS", "COMPANY_LIBRARY", "SIG_REQUIRED", "SIG_HISTORY"):
        s = replace_const(s, name, "[]  // no sample rows — real records only")
    s = s.replace("const content = DOC_CONTENT[doc.contentKey] || `VIP — ${doc.title}\\n\\n${doc.desc}\\n\\nThis document is available through the VIP employee portal. Contact HR for a full copy.`",
                  "const content = DOC_CONTENT[doc.contentKey] || `Twisted Growers — ${doc.title}\\n\\n${doc.desc || ''}\\n\\nThe full document is available from HR.`")
    p.write_text(s, encoding="utf-8", newline="\n")

    # MyDocs.jsx — the sample document arrays become empty
    p = ROOT / "MyDocs.jsx"; s = p.read_text(encoding="utf-8")
    for m in list(re.finditer(r"^const ([A-Z_]+) = \[\n(?:.*\n)*?\]\n", s, flags=re.M)):
        block = m.group(0)
        if "daysAgo(" in block or "VIP" in block or "Connecticut" in block:
            s = s.replace(block, f"const {m.group(1)} = []  // no sample rows — real records only\n")
    p.write_text(s, encoding="utf-8", newline="\n")

    # DocManager.jsx — locations and roles
    p = ROOT / "DocManager.jsx"; s = p.read_text(encoding="utf-8")
    s = re.sub(r"^const LOCATIONS  = \[.*?\]$", "const LOCATIONS  = ['All', 'Lakeville — Cultivation', 'Lakeville — Manufacturing', 'Dispensary (planned)']", s, count=1, flags=re.M)
    s = re.sub(r"^const ROLES_LIST = \[.*?\]$", "const ROLES_LIST = ['All Roles', 'Admin/Owner', 'CEO', 'CFO', 'HR Manager', 'Department Head', 'Lead', 'Associate']", s, count=1, flags=re.M)
    s = s.replace("Very Intimate Pleasures", "Twisted Growers").replace("Connecticut", "Massachusetts").replace("VIP", "Twisted Growers")
    p.write_text(s, encoding="utf-8", newline="\n")

    # Benefits.jsx — carrier / plan names are not configured yet
    p = ROOT / "Benefits.jsx"; s = p.read_text(encoding="utf-8")
    s = s.replace('value="Anthem BCBS Connecticut"', 'value="Not configured — HR sets the carrier in Benefits › Administration"')
    s = s.replace("Fidelity target-date funds, index funds, and VIP company stock (up to 5%).", "Not configured — HR sets the plan options in Benefits › Administration.")
    s = s.replace("VIP 401(k) — administered by Fidelity.", "Not configured.")
    s = s.replace("Health, dental, 401k, and CT paid leave — Very Intimate Pleasures", "Health, dental, retirement and Massachusetts leave — Twisted Growers")
    s = s.replace("Applies to employers with 1+ employees in Connecticut.", "Massachusetts Earned Sick Time (M.G.L. c.149 §148C) and PFML (c.175M).")
    s = s.replace("Connecticut", "Massachusetts").replace("VIP", "Twisted Growers")
    p.write_text(s, encoding="utf-8", newline="\n")

    # CTCompliance.jsx → Massachusetts statutes
    p = ROOT / "CTCompliance.jsx"; s = p.read_text(encoding="utf-8")
    m = re.search(r"^function buildCategories\(config\) \{\n.*?^\}\n", s, flags=re.S | re.M)
    if not m: raise SystemExit("buildCategories not found")
    s = s[:m.start()] + MA_CATEGORIES + "\n" + s[m.end():]
    s = s.replace("// ── Static catalog (CT statutory requirements — reference definitions, not data) ──", "// ── Static catalog (Massachusetts statutory requirements — reference definitions, not data; verify with counsel) ──")
    s = s.replace("Connecticut", "Massachusetts").replace("CT Compliance", "MA Compliance").replace("CT compliance", "MA compliance")
    p.write_text(s, encoding="utf-8", newline="\n")

    # Academy.courses.js
    (ROOT / "Academy.courses.js").write_text(COURSES, encoding="utf-8", newline="\n")
    print("de-VIP content pass complete")

if __name__ == "__main__":
    main()
