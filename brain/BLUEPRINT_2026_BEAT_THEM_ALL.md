# TWISTED GROWERS ENTERPRISE OS — BLUEPRINT 2026: BEAT THEM ALL

**Ruling:** owner, 13 Sep 2026 — *"I want the best of the best for 2026 … NetSuite, beat it … the best cannabis platforms, beat them too."* Confirmed 14 Sep 2026 01:30 UTC: *"I confirmed — now blueprint beating them all."*
**Author:** Claude desk (Agent I, Database COO). **Status:** governing document. Every phase below is a row in the deployment tracker, section **19 Blueprint 2026**, and is not "done" until it is on `main`, published by Netlify, and measured live (hard rule, 13 Sep 2026).

---

## 0. The bar

| Rival | What it owns | What we take from it | Where we beat it |
|---|---|---|---|
| **NetSuite** (+ cannabis partner suites) | The money spine: every operational event posts; saved searches; role centres; self-customisation; system notes | Posting engine, views-for-everyone, role home, custom fields/rules as data, field-level audit | Posting at **tag grain**; provenance and disagreements, not just notes; Metrc/COA/rooms native; no seats; no consultants |
| **365 Cannabis** (Dynamics 365 BC) | Real GL, closed books, multi-entity | One book per licence, consolidated | Cannabis objects first-class instead of bolted on; 2026 interface |
| **Canix** | Floor: RFID/barcode scanning, Metrc sync, COGS by batch | Scanner-first phone | Reasoning over the sync (Compliance agent), Tag 360, COGS by tag |
| **Flourish** | Seed-to-sale ERP breadth, manufacturing BOM/work orders, multi-facility | Work orders, BOM, yield | True cost per unit at run close, posting live |
| **Trym** | Crew tasks, labour by plant/room, sensors, harvest analytics, mobile | Crew day | Rules-driven drafter + training matrix + sensors in the twin; not cultivation-only |
| **Distru** | Orders, manifests, e-sign, invoicing/AR, routes, QuickBooks | Sales ops | Agent-built orders and manifests, COA attached automatically, Apex + LeafLink, portal |
| **AROYA** | Crop steering from sensors | Sensor ingest, steering charts | Simulation on **your** yield history: harvest timing, room allocation, price |
| **Simplifya** | Compliance program (SOPs, audits, licences) | Licences, SOPs, audits as objects | Tied to real events: expiry blocks a schedule, SOP rides the task, audit pack from the ledger |
| **Confident Cannabis** | COA data and lab ordering | COA feed | COA parsed per tag → sellability state, strain/product library |
| **Würk** | Cannabis HR/payroll | HR platform (cloned) | Same database: labour cost flows into cost per pound |
| **LeafLink / Apex Trading** | Wholesale marketplace, buyer network, payments | Order intake | Marketplaces feed the OS; the OS is the record |
| **Headset / BDSA** | Retail sell-through, benchmarks | Benchmarks as an input | Your own sell-through + price simulation |
| **Dutchie / BioTrack / MJ Freeway** | Retail POS; old-guard traceability | — | Dispensary-ready when the retail licence lands (portal + POS door) |

**The tell:** a cultivator-manufacturer of TG's size runs six to ten of these plus NetSuite or QuickBooks, stitched with exports. Every seam leaks money or compliance. **Nobody owns the whole company. Nobody has agents that do the work. Nobody audits its own numbers.** That is the gap this blueprint closes.

---

## 1. What TG already holds (measured 14 Sep 2026 01:30 UTC)

| Asset | Measured | Blueprint role |
|---|---|---|
| Seed-to-sale ledger `tag_event` | 64,856 events | Layer 0 truth; the posting engine's input |
| Metrc mirror (read-only, legal record) | 20,506 distinct package tags · 59,615 plant rows · 389 harvests · 4,097 transfers | Ontology sources |
| COA parser (Agent P) | 983 COAs parsed | COA object → sellability |
| Apex Trading (sales source of record; writes authorised 12 Sep under human review) | live sync, 46 entities | Sales desk agent |
| Facility twin from the blueprint (A1.1) | 30 rooms generated, never typed | Map door; simulation model |
| Scheduling foundation (owner rulings 12 Sep) | policy rows, shift templates, zone staffing, training matrix, `f_draft_schedule` | Crew day; People agent |
| HR platform (vip-hr-hub clone, schema `hr`) | 251 tables, `/hr`, PR #238 pending | People objects; labour cost |
| Agents | 12 desks + 3 reviewers (Verifier, Watchdog, Challenger) | Layer 2 |
| Findings loop | 3,680 agent findings; `finding_state`, `issue_decisions` | Decision stream |
| Sync & Connections (13 Sep) | 34 syncs, 79 active cron jobs, both secret stores, editable | Periodic tasks; Sync object |
| Metric registry / provenance | `metric_registry`, `figure_of_record`, `metric_provenance`, `money_provenance` | Governed views |
| Deployment tracker | 18 sections, ~120 checks, hourly auto-runs | Governance of this blueprint |
| Schema | 496 tables · 557 views · 30 matviews · 1,374 RLS policies · 27 edge functions | — |
| Budz / TG Brain / bots extension | tokenless AI on the owner's subscription; `ANTHROPIC_API_KEY` optional fallback | Ask door; agents' reasoning (Grok's surface for settings) |

We are not starting. We are assembling.

---

## 2. Non-negotiables (owner rulings, encoded)

1. **Metrc is the legal record and stays read-only.** The OS mirrors it; it never writes to it.
2. **Apex writes happen only under human review** with the 12 Sep guardrails.
3. **Every number is a registered measure with provenance and an as-of date.** No page defines its own figure. Two people can never get two numbers.
4. **Nothing silent.** A read that fails says so; a sync that dies is a finding; an agent that stops says why.
5. **No fake data, no placeholders.** Empty is shown as empty with the reason.
6. **RLS on every table; never grant to `anon`.**
7. **No hardwired recipients, thresholds or rules** — rows the owner edits.
8. **One definition per primitive** (DDC discipline); share primitives, never layouts.
9. **AI is tokenless by default**; keys are an optional fallback stored on the Sync page. Bots/AI settings remain Grok's surface — this blueprint coordinates, it does not take them.
10. **Certified deploys only.** Fixed = on main + Netlify published + measured live. Every phase has a live acceptance test named below.
11. **Metrc overrides spreadsheets**; the sheet's figure is kept as a neon-yellow note; weekly review.
12. **Track third party separately from ours** on every metric.

### 2b. Frozen surfaces and the speed rule (owner, 14 Sep 2026)

*"Use what we have and our design so we don't lose days … no changes to theme colours, Facility Map, Top G bot page, Budz, most dashboards … side menu and top menu stay … design this page by page … build this fast."*

- **Untouchable:** theme and colours (styles.css locked), Facility Map, Top G / Bots desk, Budz, TG Brain, the side rail and the top bar (Finance / Tax / HR / Reports), and the department dashboards unless the owner names one.
- **Allowed on menus:** add a child entry under an existing cockpit (as Budz chat, TG Brain, My dashboard, Chief Executive were added 13 Sep). Nothing renamed, moved or removed.
- **New work = new pages, or no page at all.** Agents, the posting engine, the object layer and the decision feed are database and functions first; where a screen is needed it is a *new* page built from the primitives already in the OS (dashkit tiles and wells, `.panel`, `.pill`, `.sbtotals`, `.sbchip`, the report table, the Sync page's expand-in-place row) — never a new primitive, never a new colour.
- **Page by page, owner in the loop:** each page is agreed as a one-screen wire made from existing components before it is built, then built, driven in the browser, and certified. One page at a time, in the order the owner sets.
- **§7 (navigation) is therefore reduced** to what fits inside the menus that stay — see the revised §7.

---

## 3. Architecture — six layers and the outside

```
┌─ 6 · OUTSIDE ──────── dispensary portal · supplier portal · regulator audit pack · employee phone ─┐
│ 5 · SIMULATION ────── the twin as a model: harvest timing · room allocation · price · labour · cash │
│ 4 · INTERFACE ─────── TODAY (decisions) · MAP (rooms→tags) · ASK (question→view) · Object 360    │
│ 3 · DECISION STREAM ─ ranked approvals / decisions / exceptions with $ impact, one tap, push     │
│ 2 · AGENTS ────────── Compliance · Harvest&Rooms · Sales desk · Cash · People · Watchdog/V/X     │
│ 1 · ONTOLOGY ──────── ~30 objects with state, timeline, money, documents, ACTIONS                │
│ 0 · TRUTH ─────────── tag_event ledger · registered measures · provenance · as-of · Metrc mirror │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Layer | Exists | Build |
|---|---|---|
| 0 Truth | ledger, mirror, registry, provenance, PIT as-of | as-of on every list; posting engine (§6) |
| 1 Ontology | tables and views for every object; no object layer | `object_registry` + one 360 view + one action set per object (§4) |
| 2 Agents | 12 desks, 3 reviewers, findings | mandates as data; five process agents (§5) |
| 3 Decision stream | findings, finding_state, issue_decisions | `decision` object, ranked feed, push, one-tap (§8) |
| 4 Interface | facility twin, Spotlight, Budz/Brain, cockpits | Today, Ask→view, Tag 360, scanner phone (§7, §9) |
| 5 Simulation | yield history, cycle data, cost per pound | scenario engine on the twin (§10) |
| 6 Outside | `/hr` proxy, Apex | portals, audit pack (§11) |

---

## 4. The Ontology — objects, not tables

One row per object in `object_registry` (key, label, identity, sources, states, timeline events, money, documents, actions, owner agent). One `v_<object>_360(id)` per object. One `f_<object>_<action>()` per action, RLS-gated, every call logged. **Every page above this layer is generated from it; nobody hand-builds a page again.**

| Object | Identity | Sources | States | Actions (human / agent) | Owner |
|---|---|---|---|---|---|
| **Licence** | MC281714, MP281909 (+ retail to come) | company_licenses, Metrc | active · renewal due · expired | renew, attach document | Compliance |
| **Facility / Room / Zone** | blueprint id | facility_room, twin, zone_staffing, sensors | in cycle · turning · idle · quarantine | schedule turn, assign crew, set staffing | Harvest & Rooms |
| **Strain** | name → Metrc → COA → manifest (ruling D4) | metrc_strains, strain_rule, COA | active · retired | set rule, map alias | Agent H |
| **Plant / Plant batch** | Metrc tag / batch id | metrc_plants, plantbatches, tag_event | immature · vegetative · flowering · harvested · destroyed | move room, flag, destroy (Metrc-side only, recorded) | Harvest & Rooms |
| **Harvest** | Metrc harvest id | metrc_harvests, tag_event, PIT | drying · curing · closed · certified | schedule takedown, record weight at close, certify | Harvest & Rooms |
| **Package (Tag)** | 24-char tag | metrc_packages, tag_event, COA, manifests, sheets | active · in testing · sellable · on hold · transferred · finished | adjust (Metrc-side, recorded), attach COA, allocate to order, quarantine | Compliance |
| **Item / Product** | Metrc item + SKU | metrc_items, sku_pack_sizes, product_inventory | listed · discontinued | set pack size, price | Sales desk |
| **COA** | lab + sample id | coa_extract, documents | received · parsed · passed · failed · R&D | attach to tag, dispute | Agent P |
| **Transfer / Manifest** | Metrc manifest number | metrc_transfers, manifest_extract, Apex | draft · outgoing · received · rejected | build, attach COAs, sign, reconcile | Sales desk |
| **Order** | Apex order id | apex_orders, order lines | quote · confirmed · allocated · shipped · invoiced | allocate tags, ship, post to Apex (review) | Sales desk |
| **Customer** | Apex customer | customers, apex | active · on hold (credit) | set terms, hold | Sales desk |
| **Invoice / Payment** | invoice no | invoices, apex payments, journals | open · partial · paid · overdue | send, record payment, write off | Cash |
| **Supplier / Purchase** | vendor id | vendors, purchase_order_lines, material_purchases | open · received · billed | receive, bill | Cash |
| **Work order / Run** | run id | flow, production runs, turnaround | planned · running · closed | start, close with yield, cost | Manufacturing |
| **BOM** | product + version | bom (disabled page today) | draft · active | version, cost | Manufacturing |
| **Person** | employees ↔ hr.people ↔ app_users | employees, hr.*, credentials, skills | active · on leave · offboarded | schedule, certify skill, offboard | People |
| **Shift / Schedule** | schedule id | shift_templates, drafts, sign-offs | draft · posted · signed | draft (f_draft_schedule), post, sign (CEO/CFO/HR) | People |
| **Credential** | person + type | credential_reminder | valid · due · expired | renew, block schedule | People |
| **SOP** | sop id | sop_training (disabled page) | draft · active | attach to task, train | Compliance |
| **Audit** | audit id | forensic_audits, certification board | open · signed | run pack, sign | Verifier |
| **Finding** | finding id | agent_findings, finding_state | open · challenged · decided · closed | assign, decide, refute | Watchdog / Challenger |
| **Decision** | decision id | issue_decisions (+ new `decision`) | pending · taken · reversed | take, reverse, delegate | owner / role |
| **Task** | task id | tasks, dashboard_tasks | open · done | assign, complete | any |
| **Journal / Account** | journal id | new `journal`, `account` | posted · reversed | post (engine only), reverse | Cash |
| **Sync** | registry key | sync_registry | ok · failing · off | run, switch, reschedule, remove | Integrations |
| **Secret** | name | both stores | set · missing | store, rotate, remove | Integrations |
| **Rule** | rule key | scheduling_policy, notify_rules, strain_rule, thresholds | active · history | edit (history kept) | owner |
| **Metric** | metric key | metric_registry, provenance | certified · indicative | certify, challenge | Verifier |

**Tag 360 (the first object built)** — sections: identity and state · timeline (every `tag_event`, Metrc change, COA, manifest, sheet row, finding, task, decision — one stream) · location and cycle · lab (COA, sellability) · money (cost basis, value, sale) · documents · open findings · **actions** allowed for this role now. Reached by scan, search, map or any list.

---

## 5. Agents that own processes

Each agent is a row in `agent_mandate` (mandate, triggers, autonomous actions, approval-required actions, budget, stop rule, source of truth). Each action it takes is a `decision` or a logged autonomous act. Agents never write to Metrc; they write to Apex only through the human-review path.

| Agent | Mandate | Runs on | Alone | Needs approval | Beats |
|---|---|---|---|---|---|
| **Compliance** | Metrc vs sheets vs OS agree, always; licences and credentials current; audit pack ready at any second | every delta sync; hourly sweep | file finding; annotate sheet (neon note) per "Metrc overrides"; assemble audit pack | any adjustment proposal; anything Metrc-side | Canix, Simplifya, BioTrack |
| **Harvest & Rooms** | takedown calendar, dry/cure capacity, room turns, crew per zone | cycle day; harvest alert rules | draft calendar; propose crew (via `f_schedule_candidates`) | post a schedule; move a takedown | Trym, AROYA |
| **Sales desk** | orders → allocation → manifest → COA → Apex → invoice | Apex pull; order events | draft manifest; attach COA; allocate sellable tags | post to Apex; ship; price change | Distru, LeafLink |
| **Cash** | live P&L, cost per pound, inventory value, cash forecast; collections | every posting | post journals from events; flag overdue | write-off; credit hold; payment plan | NetSuite, 365 |
| **People** | schedules, credentials, onboarding, labour cost | shift calendar; credential dates | draft schedule; block on expired credential | post/sign schedule; offboard | Würk, Trym |
| **Watchdog / Verifier / Challenger** (exist) | nothing fails silently; every figure derived two ways; every finding earns survival | continuous | file, refute, certify | close a finding | nobody has this |

---

## 6. The money spine — posting map (beats NetSuite)

Event-sourced. Every operational event already in `tag_event` (or arriving through the syncs) produces a journal at **tag grain**, with cost basis from `valuation_rates` / actual cost, one book per licence, consolidated. QuickBooks becomes the **mirror** (the existing sync flips direction); TG is the book of record.

| Event (source) | Debit | Credit | Grain | Basis |
|---|---|---|---|---|
| Plant batch created / clones | WIP – cultivation | Supplies / labour | batch · room · cycle | actual inputs |
| Harvest closed (weight captured at close — ruling) | Inventory – wet/dry | WIP – cultivation | harvest · strain · room | cost per gram accumulated |
| Package created from harvest | Inventory – FG (tag) | Inventory – bulk | tag | weight share |
| Manufacturing run closed | Inventory – FG (tag) | Inventory – inputs, labour, overhead | run · tag | BOM + actual |
| COA failed / R&D | (no posting — state only; ruling: R&D leaves lab state alone) | | tag | |
| Transfer out / sale (Apex order shipped) | COGS; AR | Inventory – FG; Revenue | tag · order · customer · licence | tag cost; Apex price |
| Third-party material movement | memo only (never revenue — ruling) | | tag · destination licence | |
| Payment received | Cash | AR | invoice | |
| Purchase received / billed | Supplies / Inventory; AP | | PO line | |
| Payroll (HR) | Labour by room/zone | Wages payable | person · shift · room | hours × rate |
| Waste / destruction | Loss | Inventory | tag / plant | basis |

**Acceptance:** live P&L, cost per pound by strain × room × cycle, inventory value and 13-week cash forecast agree with QuickBooks within the reconciliation tolerance the owner sets in Rules; every figure carries provenance to its journals and every journal to its `tag_event`.

---

## 7. Navigation — nothing moves; the three doors are pages inside the menus that stay

The side rail (14 cockpits) and the top bar stay exactly as they are. The three doors land as **child entries and pages**, not as a new menu:

| Door | Where it lives | What changes on the menu |
|---|---|---|
| **Today** (decision stream) | new page `today`, child of **Command Center** | one child entry added |
| **Facility Map** (spatial door) | the existing page, untouched | nothing; Room 360 is reached from search and lists until the owner chooses to link it from the map |
| **Ask** (question → governed view) | Budz and TG Brain, untouched (Grok's surface) | nothing; Claude supplies `f_ask_view()` as a service the bots may call |
| **Object 360** (Tag, Room, Order, Person…) | new pages reached from the existing lists, Spotlight search, and the scanner — not from the menu | nothing |
| **Views for everyone** | new page `my_views`, child of **Command Center** | one child entry added |

- **Sitemap by data (later, optional):** `nav_group` on `nav_registry` classifies the 694 pages for search and for the dashboards' faces; the rail does not change. Consolidating a page family (Findings ×~40 → one) happens **only when the owner picks that family**, one at a time; old `view_key`s redirect.
- **Gate (now):** a new registry row without `module` and `archetype` fails CI; a second list page for an object that has one fails CI. This stops the sprawl without touching a menu.

---

## 8. The decision stream

`decision` object: what, why (the finding / rule / agent), the number that triggered it captured as it stood, cash impact, options with the agent's recommendation, who may take it (role), due-by, outcome, reversal. Ranked per person (severity × money × age). Delivered on the phone by push (recipients are rows). One tap takes it; the effect executes (sheet annotated, schedule posted, manifest signed, journal reversed) and is logged with provenance.

**Acceptance:** an owner's day of routine operations is ≤ 25 decisions; every decision resolvable from the phone without opening a page; every effect visible in the object's timeline within 60 s.

---

## 9. The generative interface

- **Ask** — a question in words or voice (`useVoice` exists) → a governed view (list/chart/tile) from registered measures, with provenance shown; save, pin, alert. Budz and TG Brain are the front of this; the Bots desk (Grok) keeps model, access and spend settings.
- **Scanner-first phone** — scan a tag or a room QR → its 360 → allowed actions. Works offline for reads; writes queue.
- **Object 360** — generated from `object_registry`: one component, thirty objects, no page code per object.
- **Today** — §8, on phone and desktop.

**Acceptance:** Tag 360 opens in < 1.5 s on the floor Wi-Fi from a scan; Ask answers the twelve benchmark questions the owner sets with certified figures; zero hand-built pages added after the object layer ships (gate).

---

## 10. The twin as a model — simulation (beats AROYA, nobody else has it)

The facility twin becomes a scenario engine over your own history: cycle length, yield per strain per room per cycle (389 harvests), dry/cure capacity, labour by zone, cost per pound, price by product, sell-through from Apex. Scenarios: *harvest F3 two days early* · *move 400 plants to F1* · *raise pre-roll price 8 %* · *add a second trim shift* → yield, labour, cash, compliance impact before you act. Sensors (AROYA-class or Growlink) ingest into the same model when installed.

**Acceptance:** three owner-named scenarios reproduce last cycle's actuals within the tolerance set in Rules before any forward scenario is trusted (Verifier certifies).

---

## 11. Outside the walls

- **Dispensary portal** — live COAs, order status, manifests, invoices, payments; same objects, customer role, RLS.
- **Supplier portal** — POs, receipts, bills.
- **Regulator audit pack** — generated from the ledger on demand: tags, movements, weights, COAs, manifests, licences, SOP training, for any as-of range.
- **Employee phone** — Today, my shift, scan, tasks, credentials, pay — the OS, not a viewer.
- **Retail-ready** — when the dispensary licence lands: POS door, menu, sell-through into the same ledger (Dutchie/Treez territory).

---

## 12. Beat-them-all acceptance (measured, live, certified by Verifier)

| Rival | Test that proves we beat it |
|---|---|
| NetSuite / 365 | Harvest, package, sale, payroll, purchase post within 60 s of the event; live P&L + cost per pound + inventory value reconcile to QuickBooks within tolerance; every figure → journal → tag_event |
| Canix | Scan → Tag 360 < 1.5 s; Compliance agent catches a sheet-vs-Metrc discrepancy within one delta cycle (5 min) and delivers the decision to the phone |
| Flourish | A closed manufacturing run shows true cost per unit at close, posted |
| Trym | A posted schedule drafted through `f_schedule_candidates` with zone staffing met and no expired credential; labour by room in cost per pound |
| Distru | Order → allocation → manifest with COAs → Apex post (under review) → invoice, with no re-keying |
| AROYA | Simulation reproduces last cycle within tolerance; one forward scenario adopted and measured after the fact |
| Simplifya | Audit pack for any as-of range generated in < 60 s; a credential expiry blocks a schedule |
| Confident Cannabis | 100 % of sellable tags carry a parsed COA; a failed COA flips sellability the same cycle |
| Würk | Payroll hours post as labour by room; HR and OS share one person record |
| LeafLink / Apex | Both marketplaces feed orders into the same Order object |
| Headset | Sell-through and price simulation from own data, benchmarks as an input |
| Everyone | Owner's routine day ≤ 25 decisions; zero silent failures (Watchdog); three reviewer agents green |

---

## 12b. The design programme — every page majorly improved, fast, without touching what's frozen (owner, 14 Sep 2026)

*"So many pages — I want major design and user functionality majorly improved."* Of 694 pages, 621 are `page_kind = report`: a heading and a table. The fast lever is not 694 designs and not one template (a roster is not a ledger — ruling). It is **one excellent layout per archetype** — the 14 archetypes already on `nav_registry` — each designed with the owner on one exemplar page from existing primitives, then rolled to every page of that archetype **by data**, the same day. Hundreds of pages improve per exemplar; the theme, the menus and the frozen pages are never touched.

Every archetype layout gets the same functional floor: filters and saved views · the expand-in-place row (the Sync page pattern) opening the record's 360 · actions on the row (assign a task with the number captured — dashboard rule 2) · provenance and as-of on every figure · export · keyboard and phone.

| Order | Archetype | Pages | Exemplar page (owner designs with me) | What "majorly improved" means here |
|---|---|---|---|---|
| 1 | *(new)* Tag 360 | 1 → reached from all | Package 360 | the pattern every archetype opens into |
| 2 | `issue_queue` | 60 | Findings | queue with owner/age/severity views, decide in place, cash impact |
| 3 | `data_browser` | 251 | Valuation rates | Setup form: list + edit-in-place form, validation, history — not a grid dump |
| 4 | `stock_position` | 29 | Stock & location | position by room/strain/state with as-of, drill to tags, allocate |
| 5 | `custody_chain` | 24 | Package custody | timeline view, gaps highlighted, manifest/COA attached |
| 6 | `cost_sheet` | 29 | Cost per pound | basis shown, journal drill (money spine), compare cycles |
| 7 | `schedule` | 36 | Harvest schedule | calendar + list, drag to reschedule (rules enforced), crew and rooms |
| 8 | `document_register` | 24 | COA register | preview, parse status, attach to object, missing-document queue |
| 9 | `reconciliation` | 16 | Sheet vs Metrc | side-by-side, "Metrc overrides" one tap, neon note, weekly review |
| 10 | `scorecard` | 16 | Goals & scorecards | targets vs actuals with trend, owner per line, drill |
| 11 | `rules_editor` | 39 | Business rules | edit with history, who/when, where the rule is used |
| 12 | `catalogue` / `roster` / `punch_log` | 23 | Strains · Employees · Timesheets | catalogue cards; roster with skills/credentials; punch log with exceptions |
| 13 | unclassified | 107 | — | classified into the above first (data), then inherit |
| — | `dashboard` | 30 | frozen unless the owner names one | — |

One exemplar ≈ 1–2 days (wire from existing components → owner yes → build → drive in the browser → certify → roll by data). Fourteen archetypes ≈ 4–5 weeks, running alongside the backend phases below, which carry no design risk.

## 13. Phases — order, weeks, deliverables, gates

| Phase | Weeks | Deliverables | Live acceptance | Lane |
|---|---|---|---|---|
| **0 · Foundations** (now) | 1 | `object_registry`, `agent_mandate`, `decision` tables + RLS; tracker section 19; nav gate; HR PR #238 merged and the owner's two Supabase switches | tracker rows exist; gate refuses an unclassified page; `/hr` live | Claude · owner |
| **1 · Floor** | 4 | Tag 360 + Room 360 (generated); scanner-first phone; Compliance agent (Metrc vs sheets, "Metrc overrides" applied, neon note, weekly review); decision stream v1 with push | §12 Canix + Simplifya rows | Claude (TG-01/04), Grok for bots surface |
| **2 · Money** | 6 | posting engine on `tag_event`; `journal`/`account`; live P&L, cost per pound (strain × room × cycle), inventory value, 13-week cash; QuickBooks mirror; one book per licence | §12 NetSuite row | Claude (TG-06), Verifier |
| **3 · Sales & outside** | 4 | Sales desk agent; Order/Manifest/Invoice 360; Apex writes under review live; dispensary portal; audit pack | §12 Distru, Confident, LeafLink rows | Claude (TG-07), Agent S |
| **4 · Crew & rooms** | 4 | Harvest & Rooms agent; People agent; crew day on phone; schedule sign-off; labour into cost; sensor ingest | §12 Trym, Würk rows | Claude (TG-02/05), Grok (HR pages per lane) |
| **5 · Navigation & views** | 3 | sitemap by data (694 classified); one List + 360 per object; views-for-everyone; role centres; Ask → governed view | §12 Dynamics/NetSuite navigation; zero hand-built pages | Claude (TG-10), Grok (Budz/Brain front) |
| **6 · Simulation** | 4 | scenario engine on the twin; three certified back-tests; forward scenarios | §12 AROYA row | Claude (TG-02), Verifier |

Phases 1 → 2 are strict (the ledger must be trustworthy before it posts money). 3 and 4 can run in parallel after 2. 5 depends on the object layer from 1–4. 6 last.

**Every phase ships through the same pipeline:** migration files recorded byte-for-byte · digest re-pinned · 46 gates · CI · merge · Netlify published · live measurement · tracker row flipped by the measurement, never by hand.

---

## 14. Risks and dependencies (named, owned)

| Risk | Owner | Mitigation |
|---|---|---|
| Metrc API scope: the feed covers ~29 % of tags; grid export is the complete source | Claude | the vault pull and grid export stay in the sync registry; Compliance agent reconciles all three |
| Apex write guardrails must hold under an agent | Agent S + owner | every post is a decision; dry-run mode first; rotation last |
| Sensors not installed | owner | simulation runs on history first; sensors are additive |
| HR platform depends on two owner Supabase switches | owner | Phase 0 item |
| Bots/AI settings are Grok's surface | Grok | Ask and agents call the same gateway; settings untouched by Claude |
| Gates fail on Windows only (extzip, secrets stub, licences) | Claude | CI/Netlify are the judges; documented |
| Scope creep into pages | everyone | the nav gate; the object layer; "views not pages" |

---

## 15. Decisions the owner takes now

1. **Go on Phase 0 this week** (foundations + HR switches + tracker section 19).
2. **Tag 360 field list** — I bring it for approval before it's built (Phase 1, first artefact).
3. **Reconciliation tolerance** for the money spine (Rules row; suggest 0.5 %).
4. **The twelve benchmark questions** Ask must answer with certified figures.
5. **Three simulation scenarios** to back-test first.

Everything else in this document is already ruled or already built.
