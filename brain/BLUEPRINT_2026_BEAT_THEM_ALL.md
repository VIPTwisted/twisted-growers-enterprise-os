# TWISTED GROWERS ENTERPRISE OS — BLUEPRINT 2026: BEAT THEM ALL
## The total, detailed build plan — every ruling, every item, every KPI, every page decision, every hour

**Rulings this document encodes (owner, 13–14 Sep 2026):**
- *"I want the best of the best for 2026 … NetSuite, beat it … the best cannabis platforms, beat them too. I confirmed — now blueprint beating them all."*
- *"Use what we have and our design so we don't lose days. No changes to theme colours, Facility Map, Top G bot page, Budz, most dashboards. Side menu and top menu stay. Design this page by page. Build fast."*
- *"So many pages — I want major design and user functionality majorly improved. I still need KPIs and design upgrades — not every single page, I will go through each and decide. Plan remains the same for cloning ClickUp too. Do not omit any of my details for this build."*
- *"Delivery was the 15th; Friday 18 Sep is the latest. Delivery is to the customer for onboarding; go-live is Wednesday 23 Sep in their facility. We work 7 am to midnight. I will use Claude, Grok and GPT. Estimated time for each — I want to push to the maximum."*

**Author:** Claude desk (Agent I, Database COO). **Status:** governing document, v2 (total). **Governance:** every item below is a row in the deployment tracker (sections 1–19); an item is *done* only when it is on `main`, published by Netlify, and measured live (hard rule 13 Sep 2026). **Hours** are agent-hours at the 7 am–midnight cadence (≈15 productive hours per agent-day); three agents in parallel where lanes allow.

---

## 0a. Delivery governance revision — GPT's review of 14 Sep 2026, reconciled (one document, no drift) (BP-0a)

GPT reviewed v2 and returned a "Part I — controlling enterprise delivery revision" (owner: *"review this from GPT and share thoughts — collaborate"*). The Bible stays one document (§16.1): every point is adopted, adapted or rejected **here**, with the reason. Owner decisions incorporated: **QuickBooks → phase 2; the advanced security program → phase 2** (board rows marked *PHASE 2 (owner 14 Sep)*).

| GPT point | Verdict | What changes in this document |
|---|---|---|
| **The hours table does not add up:** 412 h listed (Claude 242 · Grok 86 · GPT 84), not ≈330; Claude's lane is 107 h over a 135 h capacity; Monday alone carries 43 h | **Adopted — the arithmetic was wrong.** The estimates are engineer-hours; Claude's measured throughput on night one was ≈4× (16 estimated hours delivered in 4 wall-clock hours, certified), but a table must reconcile to its own stated capacity | §13 carries the corrected totals, a measured-throughput note, and a rebalance: scorecards, rules editor and document register move to Grok; cost sheet and custody move to GPT. Re-estimate after day 2 from measured throughput, not assumption |
| Replace daily bundles with dependency gates G0–G5 | **Adapted.** The day-by-day order stays (the owner's demand for speed and visibility); G0–G5 become the **exit evidence** each journey must show, not a replacement | §13 gains the G-gate column; a row cannot flip PASS without its gate evidence |
| QuickBooks: no Phase-1 dependency; "TG as book of record, QB as mirror" is a phase-2 decision needing opening balances, corrections, period controls and a parallel close | **Adopted.** | §6: the spine ships internal and **indicative**; the book-of-record transition is QB-04, phase 2, signed by the accounting owner |
| Reject a blanket % tolerance; identities and duplicates exact; explicit rounding; unexplained money differences stay exceptions | **Adopted — better than my 0.5 % suggestion.** | §6 acceptance rewritten; owner row `owner.bp_tolerance` becomes "rounding rules per field class", not one percentage |
| Security deferral = postpone the expansion program, never disable protections; fix a discovered exposure before the affected real-data workflow launches | **Adopted — and it decides the held row:** `security.upload_key_hardcoded` (admin key baked into deployed source) is a discovered exposure, so it stays **phase 1** (≈1 h, read from `integration_secrets`; no rotation before the live test) | Board: CSP and anon re-measure → phase 2; upload key → phase 1, Tue |
| Certification contract: claim id · source/version · time · population · rules · transformation version · independent comparison · exceptions · verdict · expiry · evidence link; states verified / indicative / stale / incomplete / disputed / unavailable; two queries over one faulty source are not independent | **Adopted** (matches the house rule "two derivations sharing a filter are one") | §16.5: `f_certify` records this contract; the board shows the six states |
| Agents: mandate = identity, tools, objects, actions, approval boundary, budget, retry limit, stop condition, evidence, escalation owner; durable job status; no self-approval; retrieved content is evidence, not instruction | **Adopted** | §5 mandate columns extended; `agent_mandate` carries them |
| A subscription browser session is not a guaranteed background runtime | **Adopted — true and important.** Unattended work runs server-side (cron / edge functions); the extension is interactive and preferred; the API key (owner: "keys later") is the unattended fallback | §17: the bot page-walk is best-effort while a session is open; deploy watch, sync watch and certification run on cron |
| Page walks are smoke tests; acceptance exercises complete tasks, forbidden actions, failed saves, concurrent edits, partial outages, recovery; role tests need real role accounts, not the admin preview lens | **Adopted** | §17 and §13: GPT's role QA uses real accounts; the dry runs are the acceptance |
| Recovery: candidate build ≠ production outage; monitor from outside; a Netlify republish does not reverse Supabase migrations or business effects; test recovery before claiming rollback | **Adopted** (deploy watch already separates branch from `main`) | §16.3 adds: **no destructive migration during go-live week** (additive only), a tested recovery drill on Tue 22, and an outside-in availability probe |
| "Silence is agreement" is wrong; do not continue a harmful instruction because it is written | **Adopted — my wording was wrong.** An agent that believes an item is harmful **pauses that item** and files the evidence; silence means *bound by the text*, never *approved* | §16.1 reworded |
| Definition of done must separate implementation complete · deployed · accepted (real user workflow passed); manual approvals and automated measurements recorded separately | **Adopted** | §16.6: three states on every row; the Fri/Mon dry runs are the acceptance step |
| The five questions every released journey must answer; quality floor P1-01…P1-12 | **Adopted as the functional floor of every archetype exemplar** | §12b floor extended (confirmed saves, distinguishable states, persisted preferences, recovery path) |
| Competitive superiority needs a defined task and outcome, not page counts | **Agreed — §12 already states per-rival tests;** they are tests, not claims, until measured | §12 header reworded |
| Sept 18 / 23 remain targets subject to demonstrated readiness; a journey that cannot pass gets a documented scope or date change, never silent deferral | **Adopted** | §13 |
| Numeric performance promises (e.g. "< 1.5 s") must come from measured baselines | **Adopted** — Package 360 measured 0.35–0.9 s server-side; page targets are set from measurement | §9 |
| Source counts in Part II are dated claims until verified | **Agreed** — §1 is dated 14 Sep 01:30 UTC and re-measured by the board | — |

**Rejected:** nothing of substance. GPT's Part I is folded in here rather than kept as a separate "controlling" document, because two controlling documents is the drift §16.1 forbids.

## 0. The bar — who we beat and how (BP-0)

| Rival | What it owns | What we take from it | Where we beat it |
|---|---|---|---|
| **NetSuite** (+ cannabis partner suites) | Money spine (every event posts), saved searches, role centres, self-customisation, system notes | Posting engine, views-for-everyone, role home, rules as data, field-level audit | Posting at **tag grain**; provenance and disagreements, not just notes; Metrc/COA/rooms native; no seats, no consultants |
| **365 Cannabis** (Dynamics 365 BC) | Real GL, closed books, multi-entity | One book per licence, consolidated | Cannabis objects first-class; 2026 interface |
| **Canix** | Floor: RFID/barcode scanning, Metrc sync, COGS by batch | Scanner-first phone | Reasoning over the sync (Compliance agent), Tag 360, COGS by tag |
| **Flourish** | Seed-to-sale breadth, BOM/work orders, multi-facility | Work orders, BOM, yield | True cost per unit at run close, posting live |
| **Trym** | Crew tasks, labour by plant/room, sensors, harvest analytics, mobile | Crew day | Rules-driven drafter + training matrix + sensors in the twin; not cultivation-only |
| **Distru** | Orders, manifests, e-sign, invoicing/AR, routes, QuickBooks | Sales ops | Agent-built orders/manifests, COA attached automatically, Apex + LeafLink, portal |
| **AROYA** | Crop steering from sensors | Sensor ingest, steering charts | Simulation on **your** yield history |
| **Simplifya** | Compliance program (SOPs, audits, licences) | Licences, SOPs, audits as objects | Tied to real events; audit pack from the ledger |
| **Confident Cannabis** | COA data, lab ordering | COA feed | COA parsed per tag → sellability state; strain/product library |
| **Würk** | Cannabis HR/payroll | HR platform (cloned) | Same database: labour cost → cost per pound |
| **LeafLink / Apex Trading** | Wholesale marketplace | Order intake | Marketplaces feed the OS; the OS is the record |
| **Headset / BDSA** | Retail sell-through, benchmarks | Benchmarks as an input | Own sell-through + price simulation |
| **Dutchie / Treez / BioTrack / MJ Freeway** | Retail POS; old-guard traceability | — | Dispensary-ready when the retail licence lands |
| **ClickUp** (the work layer) | Tasks, views, docs, automations, forms, goals, dashboards, time | The full capability class, re-engineered natively (CODE-023) | Tasks attach to regulated objects with gates; automations enforce compliance; time costs batches at real rates |
| **Reference standard (owner's DDC / VIP CEO platform)** | Certainty chips, period state, answer-first, detection anatomy, impact-before-save | The 11 primitives (100× spec) | Every primitive at tag granularity, carrying licence, reconciled to Metrc |

**The tell:** a cultivator-manufacturer of TG's size runs six to ten of these plus NetSuite/QuickBooks, stitched with exports. Nobody owns the whole company; nobody has agents that do the work; nobody audits its own numbers.

---

## 1. What TG already holds (measured 14 Sep 2026 01:30 UTC) (BP-1)

| Asset | Measured | Role in this build |
|---|---|---|
| Seed-to-sale ledger `tag_event` | 64,856 events | Truth layer; posting engine input |
| Metrc mirror (legal record, read-only) | 20,506 package tags · 59,615 plant rows · 389 harvests · 4,097 transfers | Object sources |
| COA parser (Agent P) | 983 COAs parsed | COA object → sellability |
| Apex Trading (sales SoR; writes authorised 12 Sep under review) | 46 entities synced | Sales desk |
| Facility twin from blueprint A1.1 | 30 rooms generated | Map door; simulation |
| Scheduling foundation (rulings 12 Sep) | policy rows, shift templates, zone staffing, training matrix, `f_draft_schedule`, `f_schedule_candidates` | Crew day; People agent |
| HR platform (vip-hr-hub clone, schema `hr`) | 251 tables; PR #238 | People objects; labour cost |
| Work layer tables (ClickUp clone, CODE-023) | `tasks`, `task_activity`, `task_attachment`, `task_checklist_item`, `task_comment`, `task_dependencies`, `task_list`, `task_standards`, `task_time_log`, `spaces`, `saved_views`, `forms`, `form_responses`, `whiteboards`, `workspace_view`, `time_entries`; `tg_task_from_dashboard` RPC; `AssignTask` primitive | §12d |
| Metric spine | `metric_registry` 43 metrics across 11 departments; `kpi_targets` 20 rows; `figure_of_record`, `metric_provenance`, `money_provenance` | §12c |
| Agents | 12 desks + Verifier, Watchdog, Challenger; 3,680 findings; `finding_state`, `issue_decisions` | Layer 2/3 |
| Sync & Connections (13 Sep) | 34 syncs, 79 active cron jobs, both secret stores, editable | Periodic tasks |
| Deployment tracker | 18 sections, ~120 checks, hourly auto-runs | Governance |
| Schema | 496 tables · 557 views · 30 matviews · 1,374 RLS policies · 27 edge functions | — |
| Budz / TG Brain / bots extension | tokenless AI on the owner's subscription; API key optional fallback (Sync page) | Ask door; agent reasoning |
| Navigation | 694 enabled pages; 14 cockpits; 14 archetypes tagged | §12b |

---

## 2. Non-negotiables — the complete register of owner rulings this build obeys (BP-2)

**Dashboards (owner, 5 Aug 2026 — hard rules 1–10):** every category has a dashboard · every dashboard is actionable to ClickUp standard (assign from any tile, named person, due date, priority, number captured as it stood) · extensive reporting and KPIs with drill from any tile and the full report set on the page · everything replicates up to Control Tower and the Chief Executive Dashboard · users personalise the two master dashboards (toggle, drag, saved per user) · nothing omitted, sacrificed or shortened when consolidating · never assume how the business works — owner-set field defaulting to "not recorded" · never a benchmark without a real source · **theme is locked** (neon green; no greys on icons, no pastels, bright reds) · **dashboard standard set in stone**: live KPI tiles with target on the tile, trend sparkline from real snapshots, change since yesterday in words, forensic drill on every tile, assign from the tile, entity cards, live activity feed, collapsible sections with counts remembered per user, action bar, honest empty states. Reference: the VIP CEO platform — match or beat.

**Every tile must prove itself (6 Aug 2026):** a tile is a claim; it opens to every item behind it (tag, product, cultivar, stream, source harvest, cut date, drying room, parents, batch, where/when/how long, quantity in its own UoM, testing dates and days at lab, test status plainly, THC/TAC/terpenes or why absent, COA link or why none, manifest or why none, origin, rate and value, traceability sentence); totals reconcile to items; absence explained; never invent a number. `v_stock_proof`.

**The lettered hard rules (CLAUDE.md A–L):** A data honesty · B weights, units and conversions (a count is never a mass) · C traceability and proof · D Metrc (legal record, read-only mirror) · E database safety (RLS on every table, never grant to anon, no `drop view … cascade`) · F front-end safety (nothing silent, error boundaries) · G configuration (nothing hardwired) · H issues and accountability (every discrepancy named, owned, closeable, re-tested) · I brand and voice · J data intake and guards · K checks about checks · L CCC compliance and real seed-to-sale.

**Rulings from the build (all still in force):**
- Identity is the tag; names resolve Metrc → COA → manifest (D4). A blend has no single strain.
- A close certifies tags, never weight — capture weight at the close.
- A takedown spans 1–2 days — normal, not an artefact.
- R&D tests do not set a compliance lab state.
- Track third party separately from ours on every metric (split on destination licence).
- Metrc overrides spreadsheets; the sheet's figure kept as a neon-yellow note; logged; weekly review.
- No hardwired recipients, thresholds or rules — rows the owner edits.
- Apex is the sales source of record; **Apex writes are authorised under human review** with the 12 Sep guardrails; Metrc stays read-only.
- No credential rotation before a live test.
- Every item tested or sold carries its COA **and** its manifest.
- Ownership methodology (7 Aug) applies on any doubt; ownership figures suspended until certified.
- Frozen surfaces (11 Aug): menu entries may be renamed/consolidated/added/removed; surfaces frozen.
- Bots and AI are not Claude's lane (Top G, Budz, Brain, AI settings = Grok).
- AI is tokenless by default; keys optional on the Sync page; HR AI uses the same gateway.
- HR platform = vip-hr-hub cloned in full, retail kept, zero VIP data, schema `hr`, never anon, Netlify builds it.
- Scheduling: rooms from the blueprint; floater = trained/in-training in 2+ departments; sign-off CEO/CFO/HR; every rule a `scheduling_policy` row; drafter places only through `f_schedule_candidates`.
- Never claim fixed before a certified deploy; drive the page before shipping it.
- Code meets a senior engineering bar; share primitives, never layouts; one definition per primitive (DDC discipline); MIT/Google/Microsoft standard or beat it — name the gate and the number.
- Parse the manual before guessing; always check, verify, confirm (derive a second way, then challenge).
- ClickUp is a clone inside the OS (Workspace), not one of our syncs.
- **Bought-in material (14 Sep 2026):** material bought from another licence is inventory — product and processing material we turn around and sell in **30–45 days** — tracked site-wide as a daily item: the bought-in register, the turnaround queue (`bought_in_turnaround`), Inventory tiles, Control Tower figures and an hourly watch whose findings land on Today; the two days are rows (`bought_in_turnaround_target_days`, `bought_in_turnaround_max_days`); a purchase entered with its package tag is the tag's cost basis. `tag_event` 'received' rows are OUR outbound deliveries being accepted — not purchases.
- **The cost basis is the Manufacturing Production Worksheet (14 Sep 2026):** `docs/source-of-truth/Manufacturing_Production_Worksheet.xlsx`, loaded as rows (`cost_inputs`, `manufacturing_cost_figure`); the money spine prices COGS, packaging and loss from `cost_basis_rule` (figure or owner rule per stream and item — flower $1,100/lb by the 13 Aug ruling), a purchase on file for the tag first. A valuation rate is what material is worth, never what it cost.

### 2b. Frozen surfaces and the speed rule (14 Sep 2026) (BP-2b)
- **Untouchable:** theme and colours (`styles.css` locked; `patches.css` only), Facility Map, Top G / Bots desk, Budz, TG Brain, side rail, top bar (Finance / Tax / HR / Reports), department dashboards unless the owner names one.
- **Menus:** child entries may be added under a cockpit (Budz chat, TG Brain, My dashboard, Chief Executive were added 13 Sep). Nothing renamed, moved or removed.
- **New work = database/agents first, or new pages from existing primitives** (dashkit tiles/wells, `.panel`, `.pill`, `.sbtotals`, `.sbchip`, report table, expand-in-place row). No new primitive, no new colour.
- **Page by page:** the owner goes through the page-decision register (§12b) and decides; each decided page is built, driven in the browser, certified, then rolled to its archetype by data.

---

## 3. Architecture — six layers and the outside (BP-3)

```
6 · OUTSIDE ─────── dispensary portal · supplier portal · regulator audit pack · employee phone
5 · SIMULATION ──── the twin as a model: harvest timing · room allocation · price · labour · cash
4 · INTERFACE ───── TODAY (decisions) · MAP (rooms→tags) · ASK (question→view) · Object 360 · Work layer
3 · DECISIONS ───── ranked approvals / decisions / exceptions with $ impact, one tap, push
2 · AGENTS ──────── Compliance · Harvest&Rooms · Sales desk · Cash · People · Watchdog/Verifier/Challenger
1 · ONTOLOGY ────── ~30 objects with state, timeline, money, documents, ACTIONS
0 · TRUTH ───────── tag_event · registered measures · provenance · as-of · Metrc mirror · certainty chips
```

| Layer | Exists | Build | Hours |
|---|---|---|---|
| 0 Truth | ledger, mirror, registry, provenance, PIT as-of | as-of on every list (2 h primitive); certainty chip + propagation on every tile (100× #1, 12 h); posting engine (§6) | 14 + §6 |
| 1 Ontology | tables/views for every object | `object_registry` (3 h) + one `f_<object>_360` per object (2–6 h each; Package done 14 Sep) | 3 + ~90 |
| 2 Agents | 12 desks, 3 reviewers | `agent_mandate` (3 h); five process agents (§5) | 3 + §5 |
| 3 Decisions | findings, finding_state, issue_decisions | `decision` object (4 h), Today feed (10 h), push (6 h) | 20 |
| 4 Interface | twin, Spotlight, Budz/Brain, cockpits, AssignTask | Package 360 page (8 h), scanner phone (10 h), Ask→view service (8 h), work layer (§12d) | 26 + §12d |
| 5 Simulation | yield history, cycle data | cycle compare (10 h), scenario engine (40 h), back-tests (Verifier 12 h) | 62 |
| 6 Outside | `/hr`, Apex | dispensary portal (16 h), supplier portal (12 h), audit pack (10 h), employee phone (in scanner) | 38 |

---

## 4. The Ontology — objects, not tables (BP-4)

One row per object in `object_registry` (key, label, identity, sources, states, timeline events, money, documents, actions, owner agent). One `f_<object>_360(id)` per object (`security invoker` — the caller's RLS applies). One `f_<object>_<action>()` per action, gated, logged.

| Object | Identity | Sources | States | Actions | Owner agent | Hours |
|---|---|---|---|---|---|---|
| **Package (Tag)** | 24-char Metrc tag | metrc_packages, tag_event, COA, manifests, sheets, Apex | active · in testing · sellable · on hold · transferred · finished | attach COA, allocate, quarantine, assign task, flag finding | Compliance | **done 14 Sep** (`f_package_360`, `f_package_search`); page 8 h |
| Room / Zone | blueprint id | facility_room, twin, zone_staffing, sensors | in cycle · turning · idle · quarantine | schedule turn, assign crew, set staffing | Harvest & Rooms | 6 |
| Plant / Plant batch | Metrc tag / batch | metrc_plants, plantbatches, tag_event | immature · veg · flowering · harvested · destroyed | move room (recorded), flag | Harvest & Rooms | 5 |
| Harvest | Metrc harvest id | metrc_harvests, tag_event, PIT | drying · curing · closed · certified | schedule takedown, weight at close, certify | Harvest & Rooms | 6 |
| Strain | name (D4) | metrc_strains, strain_rule, COA | active · retired | set rule, map alias | Agent H | 3 |
| Item / Product | Metrc item + SKU | metrc_items, sku_pack_sizes, product_inventory | listed · discontinued | pack size, price | Sales desk | 3 |
| COA | lab + sample | coa_extract, documents | received · parsed · passed · failed · R&D | attach, dispute | Agent P | 4 |
| Transfer / Manifest | manifest number | metrc_transfers, manifest_extract, Apex | draft · outgoing · received · rejected | build, attach COAs, sign, reconcile | Sales desk | 6 |
| Order | Apex order | apex_orders, lines | quote · confirmed · allocated · shipped · invoiced | allocate, ship, post (review) | Sales desk | 6 |
| Customer | Apex customer | customers | active · hold | terms, hold | Sales desk | 3 |
| Invoice / Payment | invoice no | invoices, Apex payments, journals | open · partial · paid · overdue | send, record, write off | Cash | 4 |
| Supplier / Purchase | vendor | vendors, PO lines, material_purchases | open · received · billed | receive, bill | Cash | 4 |
| Work order / Run | run id | flow, runs, turnaround | planned · running · closed | start, close with yield, cost | Manufacturing | 6 |
| BOM | product + version | bom | draft · active | version, cost | Manufacturing | 4 |
| Person | employees ↔ hr.people ↔ app_users | employees, hr.*, credentials, skills | active · leave · offboarded | schedule, certify skill, offboard | People | 5 |
| Shift / Schedule | schedule id | shift_templates, drafts, sign-offs | draft · posted · signed | draft, post, sign | People | 5 |
| Credential | person + type | credential_reminder | valid · due · expired | renew, block schedule | People | 2 |
| SOP | sop id | sop_training | draft · active | attach to task, train | Compliance | 3 |
| Audit | audit id | forensic_audits, certification board | open · signed | run pack, sign | Verifier | 3 |
| Finding | finding id | agent_findings, finding_state | open · challenged · decided · closed | assign, decide, refute | Watchdog / Challenger | 4 |
| Decision | decision id | issue_decisions + `decision` | pending · taken · reversed | take, reverse, delegate | owner/role | 4 |
| Task (work item) | task id | tasks + task_* | configurable pipeline | full work layer (§12d) | any | §12d |
| Journal / Account | journal id | new | posted · reversed | post (engine), reverse | Cash | §6 |
| Sync · Secret · Rule · Metric | key | sync_registry, stores, policy tables, metric_registry | — | Sync page (done); rules editor; certify/challenge | Integrations / owner / Verifier | 6 |

### Package (Tag) 360 — the built specification (BP-4-1) (live 14 Sep, `f_package_360(p_tag)`)
Sections and sources: **identity & state** (`v_tag_master`, `v_package_dossier`) · **timeline** (every `tag_event` + `v_package_events`, one stream, newest first) · **dwell** by location (`v_tag_dwell`) · **lifecycle** six stages (`v_tag_lifecycle`: harvest → packaged → tested → shipped → invoiced → finished) · **lab & sellability** (COA, analytes, lab state, why-no-certificate from `v_tag_evidence`, `v_tag_certificate_final`) · **provenance & ownership** (`v_tag_provenance`, cultivator/manufacturer/packager licences) · **documents** (COA link, manifest link, Apex invoice — `v_package_documents`) · **money** (value at our cost, cost basis, declared transfer price, Apex USD) · **gaps** (`v_tag_gap` rule codes with required action) · **custody alerts** · **Apex reconciliation verdict** · **findings** touching the tag · **tasks** on the tag · **actions**: Assign task (captures on-hand lb), flag finding, open in Metrc (screen named), copy tag. Reached from: any table cell that is a tag (shared `cellView` link), Spotlight (`f_package_search`), a scanned tag, the Package list.

---

## 5. Agents that own processes — mandates as data (BP-5)

| Agent (BP-5-0 = the first connection: one agent, one real task, verified result — GPT lane) | Mandate | Runs on | Alone | Needs approval | Beats | Hours (v1 → full) |
|---|---|---|---|---|---|---|
| BP-5-1 **Compliance** | Metrc vs sheets vs OS agree always; licences/credentials current; audit pack any second | every delta sync (5 min); hourly sweep | file finding; annotate sheet (neon note) per "Metrc overrides"; assemble audit pack | any Metrc-side adjustment proposal | Canix, Simplifya, BioTrack | 12 → 30 |
| BP-5-2 **Harvest & Rooms** | takedown calendar, dry/cure capacity, room turns, crew per zone | cycle day; harvest_alert_rules | draft calendar; propose crew via `f_schedule_candidates` | post schedule; move takedown | Trym, AROYA | 10 → 30 |
| BP-5-3 **Sales desk** | order → allocation → manifest → COA → Apex → invoice | Apex pull; order events | draft manifest; attach COA; allocate sellable tags | post to Apex; ship; price change | Distru, LeafLink | 14 → 36 |
| BP-5-4 **Cash** | live P&L, cost per pound, inventory value, cash forecast, collections | every posting | post journals from events; flag overdue | write-off; credit hold | NetSuite, 365 | §6 → +20 |
| BP-5-5 **People** | schedules, credentials, onboarding, labour cost | shift calendar; credential dates | draft schedule; block on expired credential | post/sign; offboard | Würk, Trym | 8 → 24 |
| BP-5-6 **Watchdog / Verifier / Challenger** | nothing silent; every figure two ways; every finding earns survival | continuous | file, refute, certify | close a finding | nobody | exist; +8 for decision hooks |

---

## 6. The money spine — posting map at tag grain (beats NetSuite) (BP-6)

Event-sourced. Every event in `tag_event` (or arriving through the syncs) produces a journal at tag grain; cost basis from `valuation_rates` / actuals; one book per licence (MC281714, MP281909, retail to come), consolidated. **TG is the book of record; QuickBooks becomes the mirror** (the sync flips direction).

| Event | Debit | Credit | Grain | Basis | Hours |
|---|---|---|---|---|---|
| Plant batch / clones | WIP – cultivation | Supplies / labour | batch · room · cycle | actual inputs | 4 |
| Harvest closed (weight at close) | Inventory – wet/dry | WIP – cultivation | harvest · strain · room | accumulated cost/g | 4 |
| Package from harvest | Inventory – FG (tag) | Inventory – bulk | tag | weight share | 4 |
| Manufacturing run closed | Inventory – FG (tag) | inputs, labour, overhead | run · tag | BOM + actual | 6 |
| COA failed / R&D | no posting (state only — ruling) | | | | 0 |
| Transfer out / sale (Apex shipped) | COGS; AR | Inventory – FG; Revenue | tag · order · customer · licence | tag cost; Apex price | 6 |
| Third-party material movement | memo only (never revenue — ruling) | | tag · destination licence | | 2 |
| Payment received | Cash | AR | invoice | | 2 |
| Purchase received / billed | Supplies/Inventory; AP | | PO line | | 4 |
| Payroll (HR) | Labour by room/zone | Wages payable | person · shift · room | hours × real rate (big-fifteen #5) | 6 |
| Waste / destruction | Loss | Inventory | tag / plant | basis | 2 |
| **Engine, accounts, views** (`journal`, `account`, live P&L, cost per pound strain × room × cycle, inventory value, 13-week cash) | | | | | 24 |
| **QuickBooks mirror** (flip the sync) + reconciliation to tolerance (owner sets, suggest 0.5 %) | | | | | 16 (+ GPT 10 independent) |
| **Total** | | | | | **≈ 80 (v1 in 40)** |

Acceptance (phase 1): harvest/package/sale/payroll/purchase post within 60 s; every figure → journal → `tag_event`; every money figure carries the **indicative** label and names its source and method. **Phase 2 (owner, 14 Sep): QuickBooks** — QB-01 integration specification (authority by record type, operations, mappings, history, sync direction — no uncontrolled bidirectional ownership) · QB-02 execution (duplicate protection, replay, visible exceptions, attributable changes, recovery) · QB-03 reconciliation (**no blanket % tolerance**: identities and duplicates exact; rounding rules explicit per field class; unexplained money differences stay exceptions) · QB-04 the book-of-record transition, only after opening balances, corrections, reversals, period controls and a full parallel close pass, signed by the accounting owner. Until then the existing accounting operation continues unchanged.

---

## 7. Navigation — nothing moves; the doors are pages inside the menus that stay (BP-7)

| Door | Where | Menu change | Hours |
|---|---|---|---|
| **Today** (decision stream) | new page `today`, child of Command Center | one child entry | 10 |
| **Facility Map** | untouched | none; Room 360 reached from search/lists until the owner links it from the map | 0 |
| **Ask** | Budz / TG Brain (Grok) call `f_ask_view()` | none | 8 (Claude service) + Grok front |
| **Object 360s** | reached from lists, Spotlight, scanner, tag cells | none | in §4 |
| **My views** (views for everyone) | new page, child of Command Center | one child entry | 14 |
| **Workspace** (ClickUp clone) | existing Workspace cockpit (Assignments, Whiteboards) + new children as built | child entries | §12d |
| Sitemap by data (`nav_group` on `nav_registry`, for search and dashboard faces) | later, optional; rail unchanged | none | 6 |
| Gate: no registry row without `module` + `archetype`; no second list page per object | CI | — | 3 |

---

## 8. The decision stream (BP-8)
`decision` object: what · why (finding / rule / agent) · the number captured as it stood · cash impact · options with recommendation · who may take it (role) · due-by · outcome · reversal. Ranked per person (severity × money × age). Push to phone (recipients are rows — `alert_recipient`). One tap executes the effect (sheet annotated, schedule posted, manifest signed, journal reversed) with provenance. **Acceptance:** owner's routine day ≤ 25 decisions; every effect in the object's timeline within 60 s. **Hours:** 20 (v1 10).

## 9. The generative interface (BP-9)
Ask (words/voice → governed view from registered measures; save, pin, alert) 8 h service + Grok front · Scanner-first phone (scan tag/room QR → 360 → actions; offline reads) 10 h · Object 360 generic renderer (one component, thirty objects) 12 h · Today (§8). **Acceptance:** 360 < 1.5 s from a scan on floor Wi-Fi; Ask answers the twelve owner benchmark questions with certified figures; zero hand-built pages after the object layer (gate).

## 10. The twin as a model — simulation (BP-10)
Cycle compare on actuals by strain × room × cycle (10 h) → scenario engine: harvest timing, room allocation, price, labour → yield, labour, cash, compliance (40 h) → three owner-named back-tests certified by Verifier before any forward scenario (12 h). Sensors (AROYA/Growlink) ingest into the same model when installed (8 h ingest).

## 11. Outside the walls (BP-11)
Dispensary portal (customer role, RLS: COAs, orders, manifests, invoices, payments) 16 h · Supplier portal (POs, receipts, bills) 12 h · Regulator audit pack on demand for any as-of range (tags, movements, weights, COAs, manifests, licences, SOP training) 10 h · Employee phone (Today, my shift, scan, tasks, credentials, pay) in scanner + HR · Retail door (POS, purchase limits, patient, excise, delivery — 100× spec Part 5) when the licence lands: every table/view/tile carries `licence` from today.

---

## 12. Beat-them-all acceptance (measured live, certified by Verifier) (BP-12)

| Rival | Test |
|---|---|
| NetSuite / 365 | events post ≤ 60 s; live P&L + cost per pound + inventory value reconcile to QuickBooks within tolerance; figure → journal → tag_event |
| Canix | scan → Tag 360 < 1.5 s; Compliance agent catches a sheet-vs-Metrc discrepancy within one delta cycle and delivers the decision to the phone |
| Flourish | closed run shows true cost per unit at close, posted |
| Trym | posted schedule via `f_schedule_candidates`, zone staffing met, no expired credential; labour by room in cost per pound |
| Distru | order → allocation → manifest with COAs → Apex post (review) → invoice, no re-keying |
| AROYA | simulation reproduces last cycle within tolerance; one forward scenario adopted and measured |
| Simplifya | audit pack for any as-of range < 60 s; credential expiry blocks a schedule |
| Confident | 100 % of sellable tags carry a parsed COA; failed COA flips sellability same cycle |
| Würk | payroll hours post as labour by room; HR and OS share one person record |
| LeafLink / Apex | both feed the same Order object |
| Headset | own sell-through + price simulation |
| ClickUp | a task on a tag knows the tag's COA state; an automation quarantines on failed COA; time on a task costs the batch at the real rate |
| Everyone | owner's routine day ≤ 25 decisions; zero silent failures; three reviewer agents green; every tile proves itself |

---

## 12b. The design programme and the page-decision register (owner decides page by page) (BP-12b)

Of 694 pages, 621 are `page_kind = report` (heading + table). One excellent layout per **archetype**, designed on an exemplar, rolled to every page of that archetype by data. **The owner goes through this register and marks each page: upgrade now · upgrade later · leave · retire (disable, restorable).** Nothing is changed without a mark.

Functional floor on every upgraded archetype: filters + saved views · expand-in-place row → record 360 · actions on the row (Assign task with the number captured) · certainty chip and as-of on every figure · export · keyboard and phone.

| # | Archetype | Pages | Exemplar | The upgrade | Hours (exemplar + rollout) |
|---|---|---|---|---|---|
| BP-12b-1 | Package 360 (new) | 1 → all | Package 360 | the record every list opens into | 8 |
| BP-12b-2 | `issue_queue` | 60 | Findings | queue by owner/age/severity, decide in place, cash impact, detection anatomy (100× #5) | 10 + 2 |
| BP-12b-3 | `data_browser` | 251 | Valuation rates | Setup form: list + edit-in-place, validation, history, impact-before-save (100× #8) | 12 + 3 |
| BP-12b-4 | `stock_position` | 29 | Stock & location | position by room/strain/state, as-of, drill to tags, allocate | 8 + 2 |
| BP-12b-5 | `custody_chain` | 24 | Package custody | timeline with gaps, manifest/COA attached | 8 + 2 |
| BP-12b-6 | `cost_sheet` | 29 | Cost per pound | basis shown, journal drill, cycle compare | 8 + 2 |
| BP-12b-7 | `schedule` | 36 | Harvest schedule | calendar + list, drag to reschedule (rules enforced), crew and rooms | 12 + 2 |
| BP-12b-8 | `document_register` | 24 | COA register | preview, parse status, attach to object, missing-document queue | 8 + 2 |
| BP-12b-9 | `reconciliation` | 16 | Sheet vs Metrc | side-by-side, one-tap "Metrc overrides", neon note, weekly review, three-stage reconciliation (100× #9) | 10 + 2 |
| BP-12b-10 | `scorecard` | 16 | Goals & scorecards | targets vs actuals with trend, owner per line, drill (big-fifteen #13) | 8 + 2 |
| BP-12b-11 | `rules_editor` | 39 | Business rules | edit with history, who/when, where used | 8 + 2 |
| BP-12b-12 | `catalogue` / `roster` / `punch_log` | 23 | Strains · Employees · Timesheets | cards; roster with skills/credentials; punch log with exceptions | 10 + 2 |
| BP-12b-13 | unclassified | 107 | — | classify (data), inherit | 4 |
| — | `dashboard` | 30 | frozen unless named | KPI standard (§12c) applied only where the owner names the dashboard | per dashboard 6 |
| | **Total** | | | | **≈ 160** |

**Page-decision register:** generated from `nav_registry` (module · category · label · archetype · page_kind · surface · last opened) as `docs/PAGE_DECISION_REGISTER.md` with a blank *decision* column for the owner — 2 h to generate; the owner's marks become `nav_registry.upgrade_decision`.

---

## 12c. KPI catalogue — what exists, what each dashboard still needs (dashboard rule 10) (BP-12c)

**Exists:** 43 registered metrics — Command 8 (failed testing on hand, harvests open too long, in the rooms dry-equivalent, moisture loss not recorded, never submitted for testing, open watchdog findings, out at the laboratory no result, total on hand dry-equivalent) · Cultivation 6 · Finance 3 (failed testing value, untested stock value, value of stock on hand) · HR 1 · Pre-Rolls 3 · Inventory 5 · Manufacturing 5 · Metrc 4 · Quality 4 · Settings 2 · Workspace 2; 20 `kpi_targets` rows. Every registered metric has a drill view and a target rule key.

**Per-KPI requirements (the standard):** owner-set target row (never invented) · daily snapshot for the sparkline (`kpi_snapshots`; "no history yet" until 2 days exist) · change since yesterday in words · forensic drill to items · Assign from the tile · certainty chip · licence dimension · provenance note.

| Dashboard | KPIs to add for go-live (each: metric_key · unit · source view · drill · target rule) | Hours |
|---|---|---|
| **Command Center** | decisions pending (count) · discrepancies open sheet-vs-Metrc (count, lb) · sellable on hand (lb, $) · orders open (count, $) · cash position ($) · people on shift today (count) | 8 |
| **Cultivation** | plants by phase and room (count vs room cap) · cycle day per flower room · harvests due 7 d (count) · wet→dry conversion this cycle (%) vs target · average dry time (days) · yield per plant last closed harvest (g) vs target | 8 |
| **Manufacturing** | runs open (count) · turnaround days vs policy · fresh-frozen on hand (lb) · concentrate on hand (lb) · cost per unit last closed run ($) · purchased material untouched (lb) | 6 |
| **Inventory** | on hand dry-equivalent (lb) · sellable now (lb) · ageing > 60 d (lb) · never submitted for testing (lb) · third-party held (lb, separate — ruling) · inventory value ($) | 6 |
| **Quality** | out for testing (lb) · at lab > 10 d no result (lb) · failed on hand (lb) · sellable tags without COA (count → 0) · R&D tests (count, excluded from state) | 6 |
| **Sales & Cash** | orders open ($) · shipped this week (lb, $) · AR overdue ($) · manifests unsigned (count) · Apex vs Metrc unreconciled tags (count) · 3rd-party vs ours split | 8 |
| **Metrc** | mirror freshness per endpoint (min) · packages/plants/harvests mirrored (count) · corrections outstanding (count) · delta sync failures 24 h (count) | 4 |
| **Human Resources** | headcount (count) · on shift today · credentials expiring 30 d (count) · schedule posted for next week (yes/no) · labour hours this week vs plan · PINs missing (count → 0) | 6 |
| **Finance** | value of stock ($) · untested value ($) · failed value ($) · cost per pound by stream ($) · cash 13-week (from spine) · AP open ($) | 6 |
| **Pre-Rolls & Flower** | pre-rolls on hand (lb) · never tested (lb) · shake & trim available (lb) · production this week (units) | 4 |
| **Workspace** | my tasks due (count) · overdue (count) · go-live items open · open questions | 4 |
| **Settings** | rules not yet set (count) · syncs failing (count) · secrets missing (count) · pages unclassified (count) | 3 |
| **Control Tower / Chief Executive** | roll-up of every headline above (rule 4), personalisable (rule 5) | 6 |
| **Snapshots + sparklines + change-since-yesterday** (one mechanism for all) | | 8 |
| | **Total** | **≈ 83** |

---

## 12d. The Work layer — the ClickUp clone (CODE-023), plan unchanged (BP-12d)

**Exists:** `tasks` (statuses, priority, assignee, watchers, due/start, recurrence, subtasks via parent, source_view/kpi/value/snapshot — rule 2), `task_activity`, `task_attachment`, `task_checklist_item`, `task_comment`, `task_dependencies`, `task_list`, `task_standards`, `task_time_log`, `spaces`, `saved_views`, `forms`, `form_responses`, `whiteboards`, `workspace_view`, `time_entries`; `tg_task_from_dashboard`; `AssignTask` on tiles; Workspace cockpit (Assignments, Whiteboards). The external ClickUp connector is retired from the sync registry (ruling 13 Sep).

| Capability class | Status | Build | Hours |
|---|---|---|---|
| 1 Work items everywhere | tables exist; UI partial | task 360 (relationships to ANY object, custom fields, comments with @mentions, attachments, activity) | 16 |
| 2 Views over the same records | `saved_views` exists | List · Board · Calendar · Timeline · Table (inline edit) · Workload · My Work; saved, shareable, role-scoped | 24 |
| 3 Docs & wiki | `whiteboards` | rich docs, nesting, templates, versioning, approvals, audience scoping; embeds live views | 20 |
| 4 Automations | — | trigger → condition → action engine (status, date, field, form, sync events → assign, notify, create, change, checklist); compliance actions (auto-quarantine on failed COA) | 24 |
| 5 Forms | `forms`, `form_responses` | builder writing into any module; routing rules | 10 |
| 6 Goals & scorecards | `goals_targets`, `scorecard` archetype | OKRs rolling up from live metrics (never hand-typed) | in §12b #10 + 6 |
| 7 Dashboards (configurable) | `dashboard_widgets`, `widget_catalog` | widget grid per user/team; Control Tower stays the executive board | 10 |
| 8 Time tracking | `task_time_log`, `time_entries` | timers + manual on any item → labour cost per task at real rates | 8 |
| 9 Templates | — | space/list/doc/checklist/automation templates; "New Harvest Cycle", "CAPA", "New Hire Onboarding" | 12 |
| 10 Collaboration & permissions | RBAC exists | mentions, notifications with preferences and quiet hours, guest roles, space permissions, read receipts on SOPs | 12 |
| Notifications engine + Inbox (big-fifteen #6; topbar bell) | static today | one engine feeding bell, mail, push, Today | 12 |
| | **Total** | | **≈ 154 (go-live v1: classes 1, 2-List/Board/My Work, 5, 8 ≈ 40)** |

---

## 12e. Sheets — tracker section 16, every item (owner ruling 12 Sep: Metrc overrides) (BP-12e)

| Item | Status | Hours |
|---|---|---|
| Metrc's figure overrides the spreadsheet's wherever a row resolves to a tag | PENDING | 6 (in the reconciliation exemplar) |
| Every sheet-vs-Metrc difference is a logged discrepancy with its details | PENDING | 4 |
| Weekly review by a team member or Top G, outcome recorded | PENDING | 4 (+ owner names the day) |
| Discrepant rows and tiles highlighted neon yellow with the note visible | PENDING | 3 |
| Per-run receipt, locked header fingerprint, hourly certificate per tab | PENDING | 8 |
| Sheet health every 5 min; alerts to owner-configured recipients | PENDING | 4 |
| One audit trail for automatic fixes and human decisions | PENDING | 3 (decision object) |
| Cultivation_Inventory_Sheet delivers on its twice-daily contract | PENDING | 4 |
| Manufacturing Production worksheet (cost calculator) refreshes on schedule | PENDING | 3 |
| Each tab's unit rule written and applied (units × size = grams) | PENDING | 6 (+ owner confirms exceptions) |
| **IT health page** on the side menu: every sync, AI/bots/extensions, data certification, wiring & mapping, staleness, alert-count badge, audit trail | PENDING | Sync page covers syncs/secrets/AI (done); add certification, wiring/mapping, staleness, badge: 10 |
| | **Total** | **≈ 55** |

## 12f. Scheduling & zones — tracker section 17, every open item (BP-12f)

| Item | Status | Hours |
|---|---|---|
| Headcount per zone per weekday (recommended, revisable) | WARN | 2 |
| Settings pages: rooms, zones, staffing, shift model, policy, training & onboarding | PENDING | 16 (Setup-form archetype makes this ≈ 8) |
| Schedule Builder to the standard of the popular scheduling apps (drag/drop grid) | PENDING | 20 |
| Call-outs, swaps, open shifts with "who is available" | PENDING | 10 |
| Facility map reads `facility_room`, not the static file | PENDING | 4 (map untouched visually — data source only, owner to approve) |
| Trim/dry/packaging headcount driven by harvest calendar and runs | PENDING | 8 |
| Posting a schedule notifies the people on it | PENDING | 3 (notifications engine) |
| Onboarding progress tracked per person | WARN | 4 |
| Every active employee has a primary department (11 missing) | FAIL | owner/HR data, 1 |
| HR verifies the 17 seeded training rows | FAIL | HR, 1 |
| Trained-in / in-training recorded — floaters appear | WARN | HR data |
| First real weekly draft posted (week of 21 Sep) by a sign-off role | DRAFTED 15 Sep by People v1 (82 shifts, 16 people, 2 cells to review, 656 h) — on Today at rank 1 for owner/executive/CFO/HR to post; onboarding step `scheduling.first_week` | company sign-off |
| AI layer drafts through `f_schedule_candidates` / `f_draft_schedule` | BUILT 15 Sep (PR #275): People v1 — cron `people-agent-v1` drafts every week in the horizon nobody drafted; the draft is a decision on Today (source `schedule_draft`: post / discard / assign / defer, sign-off roles from the policy); proven live: post → 82 shifts → `hr.shifts` → onboarding step done, rolled back | — |
| My schedule / availability / swap / call-out pages read zones, skills, policy | PENDING | 10 |
| PR #235 merged | carried into #275 (cherry-pick, generator moved out of tools/checks) | — |
| Company, during onboarding (owner ruling 15 Sep: rules and staff are white-label — never hardwired): shift model and breaks on the shift templates · waves · zone→department maps · weekend cover · who may edit settings — the scheduling policy and templates are rows the company saves (onboarding step `scheduling.policy_confirmed`) | COMPANY | onboarding |
| | **Total** | **≈ 85** |

## 12g. HR platform — tracker section 18, every open item (BP-12g)

Status measured 14 Sep 2026 (PRs #260–#263; `/hr` served from the OS build, shared sign-in).

| Item | Status | Hours |
|---|---|---|
| Owner: expose schema `hr` (DONE 14 Sep); enable anonymous sign-ins (OWNER — Supabase Auth › Providers; the kiosk PIN door needs it, the Login screen says so); link tg-hr to Git (NO LONGER NEEDED — app/hr builds inside the OS build, tg-hr retired) | OWNER: 1 switch | 1 click |
| First real sign-in from the OS lands on the HR dashboard as the right person/role | PASS 14 Sep (owner → Admin/Owner, 27 people; name/role per employee are data inputs) | — |
| Six screens still seed figures (AiScheduler→TG drafter, ComplianceExpirations, FlightRisk, Forms, Huddle, LaborBudget) | PASS 14 Sep — every one reads rows (`compliance_expirations`, `flight_risk_factors`, `labor_budget`, `form_catalog`, `huddle_day`, the `tg_draft_*` drafter wrappers); scope reach fixed (11 → 27 people) | — |
| HR writes TG handbook, policies, procedures, courses, benefits in the platform | HR content; the Employee Manual and Documents screens now read only what HR publishes (no typed-in text) | 2 support |
| Human Resources in the OS side menu opens `/hr` | PASS 14 Sep (rail door + top-menu row; 64 superseded OS HR rows disabled, OS-only rows re-homed to Settings/Finance) | — |
| PR #238 merged; `/hr` proxy live | PASS 14 Sep as #260 — built inside the OS deploy, not proxied | — |
| Every HR AI feature calls TG's gateway; `hr.ai_providers` holds no keys | PASS 14 Sep — 0 providers / 0 keys, every `ai_*` function deterministic; key store shut (CHECK) | — |
| Every active employee has a PIN (kiosk) | FAIL — 0 of 27; one PIN now serves the OS wall terminal and the HR kiosk (`admin_reset_pin` / `change_pin` / `f_set_punch_pin` share the hash); HR enters them | HR data |
| Policies & procedures module works on TG content (Handbook Builder, Policies hub, Doc Center, acknowledgments, quizzes) | PLATFORM READY — the screens read `hr.handbook_documents` / `hr_policies` / `hr_documents` / `sign_requests`; content is HR's | HR content |
| CEO company strip shows TG revenue (from the spine) | BUILT 15 Sep (PR #275): `hr.tg_company_kpi_strip()` from `v_pnl_live` / `v_cost_per_pound_journal` / `v_control_tower` — revenue, COGS (indicative while the basis is), margin only when COGS posted, orders, lb sold, labour posted, bought-in, onboarding, people; the VIP "CEO Platform" launcher on the same screen replaced by the OS nav registry (`hr.tg_os_modules()`) — measured on production after the merge | — |
| OS HR dashboard, Control Tower, CEO dashboard show the HR platform's own tiles — same labels, numbers, buttons | OS HR dashboard + Control Tower PASS 14 Sep (`hr.command_center_tiles` is the one derivation; tiles are `mv_department_dashboard` rows with drill `hr_platform:/route`); CEO dashboard lives in frozen `budz.jsx` — needs OWNER-APPROVED | 1 (CEO, on approval) |
| HR → OS people sync direction settled | PASS 14 Sep — `public.employees` is the register, `hr.people` the HR person, one id; OS→HR and HR→OS triggers, depth-guarded | — |
| | **Left** | **≈ 6 + HR content** |

## 12h. Sync & IT — section 11 (done) + IT health page (12e) (BP-12h)
Sync & Connections live 13 Sep (registry, secrets, add/edit/switch/reschedule/remove, Run now). Remaining: `sync.keys_page_consolidated` (nav row at deploy, 1 h); IT health page additions (10 h, in 12e).

## 12i. The 100× primitives and the big fifteen — where each lands (BP-12i)
Certainty chip + propagation (every tile, 12 h) · period state machine (Command, Cultivation, Inventory, Finance; 10 h) · answer-first band (every dashboard, powered by Budz — Grok; 6 h Claude service) · detection anatomy (Findings exemplar) · exposure vs confirmed (Finance + Command; 6 h) · materiality + disclosed suppression (`data_assertion` config; 4 h) · impact before save (Setup-form archetype) · three-stage reconciliation (Sheet vs Metrc exemplar) · preserved export history `report_export_log` (6 h) · connected intelligence (Control Tower + CEO; 8 h) · ALERTS & ACTIONS consolidation (nav rows; 3 h) · planning rituals (Monday review, Thu/Fri plan-ahead, monthly, quarterly; 12 h) · expenses / AP (in the spine) · dispensary licence dimension (everything carries `licence`; audit 6 h).
Big fifteen not already above: create/edit/approve UI (the Setup form + object actions cover it) · testing & COA ship-gate (COA object + sellability; 8 h) · per-employee actual pay rates (HR data + spine) · production planner/daily scheduler (Harvest & Rooms + schedule archetype) · M2 data loads (lots, standards, SKU master, BOMs, POs, cash, overhead, licences — 16 h loads, owner supplies) · mobile capture (scanner phone) · universal DataGrid + unified Tile (the archetype programme) · Metrc reports module ("every single report Metrc offers" — Report Vault exists; 12 h to finish coverage) · adoption telemetry (freshness SLAs, heartbeats, readiness gate; 8 h) · AI layer (Ask).

---

## 13. Schedule — nine days to go-live, three agents, with hours (BP-13)

**Corrected 14 Sep (GPT's review, §0a):** the table below lists **412 engineer-hours** (Claude 242 · Grok 86 · GPT 84), not ≈330, against 135 h per lane at 15 h/day; Claude's lane is over by 107 h and Monday carries 43 h. Two corrections apply: (1) **rebalance** — scorecards, rules editor and document register move to Grok; cost sheet and custody move to GPT (Claude ≈ 190 · Grok ≈ 110 · GPT ≈ 112); (2) **measure, don't assume** — night one delivered 16 estimated hours in 4 wall-clock hours, certified (Package 360, board, deploy watch); every lane's real throughput is re-measured after day 2 and the table re-estimated from it. QuickBooks reconciliation (10 h, GPT, Thu) is **phase 2** and struck. Sept 18 and 23 remain targets subject to demonstrated readiness: a journey that cannot pass gets a **documented** scope or date change from the owner — never a silent deferral, never relabelled complete.

**Exit gates (GPT, adopted as evidence, not as a replacement for the day order):** G0 scope (this board) · G1 foundation (identities, contracts, sources) · G2 one complete journey through real dependencies and failure paths · G3 controlled expansion (per-journey evidence) · G4 release candidate (acceptance run, recovery demonstrated, launch blockers resolved) · G5 onboarding and launch (real-user review, live verification). A row flips PASS only with its gate's evidence.

| Day | Claude (hours) | Grok (hours) | GPT (hours) |
|---|---|---|---|
| **Mon 14** | Package 360 page + tag links + Spotlight (8) · Findings exemplar → 60 (12) · section-19 board (2) · **deploy watch (6) · sync watch (5) · `blueprint-in-sync` gate (4) · Report-an-issue on every page (6)** | bots answer only from certified figures (10) · **bot page-walk v1 (12)** | Metrc population certificates: plants, packages, harvests, transfers (12) |
| **Tue 15** | Setup form → 251 (15) · HR merge + `/hr` + menu row (4) · Today v1 (8) | dashboards green vs drills (12) | sync liveness + cursor health, all endpoints (10) · role QA matrix design (4) |
| **Wed 16** | Sheet vs Metrc + override + neon + weekly review (12) · Compliance agent v1 (10) · Harvest schedule → 36 (10) | Ask front on `f_ask_view` (10) | `stock_position` → 29 (10) · certificates continued (4) |
| **Thu 17** | Money spine v1: journal from tag_event, P&L, cost per pound, inventory value (24) · `security.upload_key_hardcoded` fixed (1) | HR module pages → `/hr` (12) · **scorecards → 16 (8)** | **cost sheet → 29 (8)** · ~~QuickBooks reconciliation~~ **phase 2** |
| **Fri 18** | certification board signed (4) · **onboarding pack** (6 — the Onboarding page pulled forward and live 15 Sep; Friday is the walk-through with the company) | **COA register → 24 (6)** | **custody chain → 24 (6)** · **per-role QA** with real role accounts: every role logs in, sees its menu, nothing else — signed (10) |
| **Sat 19** | Sales desk v1: allocate → manifest draft + COAs → Apex under review → invoice (14) · Work layer v1: task 360, List/Board/My Work, forms, timers (12) | scoreboards/answer-first band (8) | vault reconciliation (8) |
| **Sun 20** | Dispensary portal v1 (12) | **rules editor → 39 (8)** | — |
| **Mon 21** | My views v1 (10) · Harvest & Rooms v1 + People v1 (12) · cycle compare (6) | Ask in words → saved view in Budz (8) | dry run with customer users (8) |
| **Tue 22** | **Freeze 12:00.** certification pass, audit pack, runbook, **recovery drill** (previous Netlify deploy + schema compatibility confirmed — additive migrations only this week), fixes only (12) | fixes (6) | second dry run; fixes (8) |
| **Wed 23** | **Go-live on site.** Watchdog on; on call | on call | on call |

**Company inputs, entered during onboarding — owner ruling 14 Sep 2026: the platform is white-label; the company enters its own inputs inside the platform, never the owner (BP-13):** the Onboarding page (Settings › Onboarding, live 15 Sep) lists every step with who does it, why it matters, what to do and the screen it opens, measured from the rows — departments and roles for every employee · kiosk PINs · real pay rates · logins and one account per role · training sign-offs · scheduling policy confirmation and the first posted week · alert recipients · purchase prices for bought-in packages · the bulk-flower cost per pound · the sheet reader sign-in · the anonymous sign-in switch · HR configuration, handbook and policies. Open blockers are findings on Today (source `onboarding`, weighted by `today_onboarding_weight`) until they measure done. Step parameters (the roles that need an account, the week to post) are rows too (`onboarding_item.params`, Settings › Onboarding steps). The `white-label` gate (CI + Netlify) fails any HR-platform source that spells the company's name; the HR settings are rows (`hr.tg_settings_get/save`), the tenant is the company org node, the company is `hr.tg_company()`. Still the owner's: reconciliation tolerance · twelve Ask benchmark questions · three simulation scenarios · page-decision marks (§12b).

### After go-live — the remaining hours, pushed to the maximum

| Block | Hours | Weeks at 3 agents |
|---|---|---|
| Money spine full + QuickBooks mirror + payroll/purchases | 40 | 1 |
| Agents full (Compliance, Harvest & Rooms, Sales desk, Cash, People) | 120 | 1.5 |
| Work layer full (classes 2–4, 6–7, 9–10, notifications engine) | 114 | 1.5 |
| Remaining archetypes + dashboards the owner names + KPI catalogue | 120 | 1.5 |
| Scheduling section 17 remainder + HR section 18 remainder | 100 | 1 |
| Sheets section 16 remainder + IT health page | 45 | 0.5 |
| 100× primitives + big-fifteen remainder | 110 | 1.5 |
| Simulation + sensors | 70 | 1 |
| Portals (supplier), audit pack, retail dimension audit | 40 | 0.5 |
| **Total after go-live** | **≈ 760 h** | **≈ 6 weeks at three agents, 15 h days** |

---

## 14. Risks and dependencies (named, owned) (BP-14)

| Risk | Owner | Mitigation |
|---|---|---|
| Metrc API covers ~29 % of tags; grid export is the complete source | Claude / GPT | vault pull + grid export in the registry; Compliance agent reconciles all three |
| Apex write guardrails under an agent | Agent S + owner | every post a decision; dry-run first; rotation last |
| Sensors not installed | owner | simulation on history first |
| HR platform waits on two owner switches + Netlify Git link | owner | Day-2 item |
| Bots/AI settings are Grok's surface | Grok | Ask and agents share the gateway; settings untouched by Claude |
| Three agents, one repo | all | file ownership by lane; ask in chat before crossing; CI on every PR; Netlify is the judge |
| Windows-only gate artefacts | Claude | CI/Netlify are the judges |
| Scope creep into pages | everyone | the nav gate; views not pages; the page-decision register |
| Go-live data not certified | Verifier | an uncertified line is shown as uncertified, never hidden |

## 15. Decisions the owner takes now (BP-15)
1. Go on the nine-day schedule and the three-lane split. 2. Role list, alert recipients. 3. Section 17/16/18 owner rows (shift, zones, weekend, edit roles, sheet day, unit exceptions, Supabase switches, Netlify link). 4. Reconciliation tolerance (suggest 0.5 %). 5. Twelve Ask benchmark questions. 6. Three simulation scenarios. 7. Page-decision marks — as many as you can each evening; unmarked pages are not touched.

---

## 16. THE BIBLE — governance, enforcement, no drift (owner, 14 Sep 2026) (BP-16)

*"Must be organised — no room for drifting or leaving anything to another AI to interpret. This must become the Bible: reviewers, watchers and the guard all agree, as we have for every aspect. Agents cannot allow stale content or overlook anything. All deployments must be watched — if one fails the agent fixes it immediately. All data must be certified; all syncs must sync without issue and be addressed the moment there is an issue."*

### 16.1 One source, one identity per item (BP-16-1)
- **This file is the Bible.** `CLAUDE.md` holds the rules; `HANDOFF.md` holds state; this file holds the build. Nothing about the build is decided anywhere else — not in chat, not in another agent's notes, not in a PR description. If it is not here, it is not the plan; if it is here, it is not open to interpretation.
- **Every item carries an ID** — `BP-<section>-<n>` (e.g. `BP-12b-3` = Setup form archetype) — and lives as a `deployment_check` row `bp.<section>.<slug>` in tracker section **19 Blueprint 2026** with: owner lane (Claude / Grok / GPT / owner), hours, acceptance test (verbatim from this file), status. **The tracker row is the only place status changes, and only by a measurement**, never by hand, never by an agent's claim.
- **No agent re-interprets.** An agent that believes an item is wrong files a *finding* against it (`agent_findings`, scope `BP-…`). If the item is merely doubtful, the agent continues on the written item until the owner rules; if the agent believes it is **harmful**, it **pauses that item** and files the evidence — a written instruction is never a reason to continue a known harm. Silence means *bound by the text*, never *approved*; deviation without a finding is a defect. (Wording corrected 14 Sep after GPT's review.)
- **Stale is a defect.** Any section of this file older than its items' last measurement is flagged by the gate below. A number in this file that disagrees with the tracker is a finding.

### 16.2 Reviewers, watchers, the guard — who agrees, and how it is enforced (BP-16-2)
| Role | Who | Agrees to what | Mechanism |
|---|---|---|---|
| **Reviewers** | Verifier (derives every figure a second way) · Challenger (refutes before it ships) · Inspector (cross-checks agents against each other and this file) | every item's acceptance test before its row flips to PASS; every phase before it is declared delivered | `f_bp_review(item)` writes the reviewer's verdict on the row; three verdicts required for a phase |
| **Watchers** | Watchdog (nothing fails silently) · deploy watcher (§16.3) · sync watcher (§16.4) · data-certification watcher (§16.5) | that what passed stays passed | cron sweeps every 5 min; a regression re-opens the row and files a finding within one sweep |
| **The guard** | the 46 CI gates + the pre-push hooks + the SQL guards + **`blueprint-in-sync`** (new) | that no change lands outside the Bible | `tools/checks/blueprint-in-sync.mjs`: every `BP-` ID in this file has a tracker row and every section-19 row has an ID here; hours and owners match; a PR that touches a frozen surface fails; a PR without a `BP-` ID in its title fails. Runs in CI and in the Netlify build |
| **Owner** | Vinny | the plan, the marks in the page-decision register, the owner rows | the only hand that changes this file's rulings |

### 16.3 Deploy watch — every deployment watched; a failure is fixed immediately (BP-16-3)
- **Mechanism (live 14 Sep, PR #249):** `f_deploy_watch` (cron, every 2 min, pg_net → Netlify deploys API for both sites, GitHub Actions runs; tokens `NETLIFY_AUTH_TOKEN` / `GITHUB_TOKEN` stored on the Sync page) records every deploy in `deploy_state`. **A branch failure is a finding; only `main` raises the alarm** — candidate build state and production health are separate facts (GPT, §0a). Until the tokens exist the tracker row `deploy.watch_alive` says FAIL — no token, never "watching".
- **Recovery is three procedures, not one:** application rollback (previous Netlify deploy, one click), database recovery (migrations this week are **additive only**; an app rollback must stay schema-compatible — confirmed in the Tue 22 drill), and reversal of external effects (Apex posts are under human review; none are automatic in phase 1). A Netlify republish alone never reverses a migration or a business effect.
- **Outside-in probe:** an availability check of the published site from outside the platform (cron → HTTP GET, recorded), so the monitor is not the component it monitors.
- **On `error` / `failed`:** within one sweep — (1) `agent_findings` row, severity NO-GO, with the failing gate's name parsed from the log; (2) push to the on-call agent's channel and to the owner's recipients (rows); (3) an `ai_bridge_jobs` row *"fix production build <deploy id>"* dispatched to the on-call agent; (4) the tracker row `deploy.production_green` flips to FAIL and blocks every other section-19 row from flipping to PASS until green.
- **The fix is the agent's, immediately:** the on-call agent reverts or repairs within the hour, opens the PR, and certifies the green deploy; the finding closes only when `deploy_state` shows `ready` for `main` and the live check passes. Rollback is always available: the previous Netlify deploy, one click.
- **Hours:** 6 (Claude, Day 1 night). Acceptance: kill a build on a branch → finding + push + bridge job within 2 min.

### 16.4 Sync watch — every sync syncs; an issue is addressed the moment it appears (BP-16-4)
- **Mechanism:** the sync registry's `f_sync_status()` swept every 5 min (`sync_watch`): a sync whose health is `failing`, `stale` or `missing secret` for the first time → finding (severity by lane), push to recipients, **automatic first response**: re-run once via `f_sync_run`; if the re-run fails or the secret is missing → `ai_bridge_jobs` "repair sync <key>" to the on-call agent and the tracker row `sync.all_green` FAILs.
- **No sync may be off without a reason row:** a switched-off sync needs `note` filled; the watcher flags an off sync with no note.
- **Hours:** 5 (Claude, Day 1 night). Acceptance: break a secret on a test sync → finding + re-run + bridge job within 5 min; restore → row green within one sweep.

### 16.5 Data certification — all data certified, continuously (BP-16-5)
- **Every figure the customer sees is certified two independent ways or is labelled uncertified on the page** — the certification board (section 15) is the register; `f_certify(metric)` records both derivations, the tolerance and the verdict; a certified figure that drifts outside tolerance is re-opened by the watcher within one sweep (hourly) and the tile shows *uncertified — re-checking* until it passes again.
- **Population certificates** (GPT lane): plants, packages, harvests, transfers, COAs, employees — signed by Friday 18 Sep; re-measured hourly.
- **Nothing is hidden:** an uncertified line is shown as uncertified, never removed.
- **Hours:** 8 (Claude framework) + GPT's certificates. Acceptance: every metric in `metric_registry` has a certification row with two derivations; the board shows zero unlabelled figures.

### 16.6 Organisation — how the work is kept in lanes, in order, in sight (BP-16-6)
- **One board:** tracker section 19, grouped by day and lane, read every morning in chat by all three agents; every evening the owner reviews production.
- **One order:** the day-by-day schedule in §13. An agent does not start a later item while an earlier one of its own is red.
- **One definition of done:** on `main` · Netlify published · live check passed · reviewer verdicts recorded · row flipped by measurement.
- **One place for questions:** the owner rows in the tracker. An agent that needs a decision files an owner row; it does not guess.
- **Lanes are files:** an agent touching a file outside its lane is a finding; the frozen list is absolute.

## 17. The bots work with us — testing, calling out what needs fixing, reporting issues (owner, 14 Sep 2026) (BP-17)

*"I want my bots on the platform now to work too, with us, as humans — testing and calling out shit that needs to be fixed, enhanced, and reporting issues."*

| Piece | What it does | Lane | Hours | Acceptance |
|---|---|---|---|---|
| BP-17-1 **Report an issue — on every page** | one control in the page chrome (no design change: it sits in the existing action bar) for humans and bots: page, view_key, role, what's wrong / what would be better, screenshot (browser capture), the figures on screen captured as they stood → `agent_findings` scope `qa:<view_key>`, kind `defect` / `enhancement`, with a link back to the page | Claude | 6 | an issue filed from any page appears in Today and on the Findings queue within 60 s with its page and figures |
| BP-17-2 **Bot page-walk (nightly and on every deploy)** | the TG bots extension, on the owner's session, opens every enabled page in `nav_registry` (694), records: load time, console errors, error boundaries hit, empty states without a reason, a figure with no provenance, a control that does nothing, a tile without a drill; files one finding per defect with the screenshot; re-tests after each deploy and closes what passed | Grok (bots) + Claude (intake, dedupe by fingerprint) | 12 + 4 | after a deploy, every page has a fresh walk result within 2 h; a broken page is a finding before a human sees it |
| BP-17-3 **Bot role tests** | the walk repeated as each role (`viewAsRole` lens for admins; real role accounts for the rest): a page a role should not see, or should see and can't, is a finding | GPT (role QA) + Grok | 8 | the role matrix signed with zero unexplained differences |
| BP-17-4 **Top G / Budz call-outs** | in chat: "Top G, what's broken on Cultivation?" answers from the QA findings; "report: the harvest tile is wrong" files a finding with the figures on screen | Grok | 6 | a spoken/typed report lands as a finding with page and figures |
| BP-17-5 **Enhancement queue** | bot and human enhancement reports ranked (impact × frequency × cost) on Today for the owner to mark: build now / later / no — feeds the page-decision register | Claude | 4 | owner marks; marks flow to `nav_registry.upgrade_decision` |
| BP-17-6 **Triage loop** | defects go to the lane that owns the file (§16.6) as bridge jobs; the owning agent fixes, deploys, certifies; the bot re-walks; the finding closes by measurement | all | in §16 | mean time from finding to certified fix ≤ 1 day for NO-GO, ≤ 3 days for WATCH |

The bots never guess: a call-out cites the page, the figure and the source, or it is not filed.

## Appendix A — Deployment tracker sections (all 18 today + 19)
2 Doors (3) · 4 Data grain (8) · 5 Owner rules (3, PASS) · 6 Defects (3: sync button PASS; deleted pages restored — Budz, Brain, My dashboard, Chief Executive 13 Sep; save-noop PENDING) · 8 Security (3) · 9 Blockers (4, PASS) · 10 Sign-off (A: 9 Sep snapshot with honest grain / B: full live twin — owner) · 11 Sync liveness (5) + Sync & Integrations (4) · 12 Alert delivery (2) · 13 Deploy drift (1) · 14 Scheduled jobs (1) · 15 Certification (16) · 16 Sheets (13 + 2 owner) · 17 Scheduling & zones (25) · 18 HR platform (22) · **19 Go-live 23 Sep / Blueprint 2026** (this document's rows, added 14 Sep).

## Appendix B — Working agreement for three agents
Lane = files; the frozen list is absolute; every PR through CI; every deploy certified by the agent that made it; the board every morning; the owner reviews every evening on production; nothing "done" until measured live; a wrong number is a finding, never a footnote.
