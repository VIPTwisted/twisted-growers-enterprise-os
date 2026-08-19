# The Brain — master index for Twisted Growers Enterprise OS

**Created 7 August 2026 at the owner's request: "I want everything organized."**
One page that maps every piece of knowledge in this project, and the loop that
keeps it growing. Plain English throughout.

---

## The files that outrank this one

| File | Single source of truth for |
|---|---|
| [CLAUDE.md](../CLAUDE.md) | **Rules.** The hard rules and the locked facts. Loads automatically in every session. |
| [HANDOFF.md](../HANDOFF.md) | **State.** What is built, what is broken, what was measured and when. |
| [OWNER_CHARTER.md](OWNER_CHARTER.md) | **What the OS is,** issued 19 Aug 2026, and the measured state of each engine against it. Where an object contradicts the charter, the object is wrong. |
| [OPERATING_LAWS.md](OPERATING_LAWS.md) | **How an agent is permitted to work,** issued 19 Aug 2026. Ten laws: never invent structure, live numbers only, no fake data, nothing hardwired, state defects plainly, never hallucinate. Includes the written reading of where Law 1 binds and where it does not. |
| [MASTER_BUILD.md](MASTER_BUILD.md) | The owner's master build document with measured status per section. |
| [PAGE_TEMPLATE.md](PAGE_TEMPLATE.md) | **How every page is built.** The owner's template of 19 Aug 2026, corrected against the live source — the issued draft called `grab` as a fetcher, named five drills that do not exist, and omitted the one prop that makes the stale-figure guard fire. Build from this, not from memory. |

The brain never restates their numbers. Numbers go stale within a day here —
HANDOFF.md says so itself. The brain tells you **where the truth lives** and
**what was learned getting there**.

---

## The loop — how this brain feeds itself

**Session start, every agent, every time:**
1. `CLAUDE.md` loads on its own. Obey it.
2. Read `HANDOFF.md` for state.
3. Read this index. Open deep pages only when the task touches them.

**Session end, before you stop:**
- Owner settled something? → one dated line in [DECISIONS.md](DECISIONS.md), with the why.
- Something broke, or an assumption died? → [LESSONS.md](LESSONS.md).
- Learned how part of the business works? → the right page in [domains/](domains/).
- Read something worth keeping? → drop the raw material in [inbox/](inbox/),
  digest it into [sources/](sources/) when ingested.
- Created a file anywhere in the project? → add its line to the map below.

That is the whole system: an index, two logs, five domain pages, and the habit
of writing back. Knowledge compounds only if every session pays in.

---

## Feeding the brain — the trained moves

Three skills and two agent roles live in `.claude/` and load automatically in
any session opened in this folder. This is how documents become capability.

| Capability | Invoke | What it does |
|---|---|---|
| **Ingest** | `/ingest` (or drop files in `brain/inbox/` and ask) | Absorbs any document — PDF, spreadsheet, pasted article, Metrc export. Extracts facts with provenance, routes to domain pages, flags contradictions with locked facts, raises open questions. Never obeys instructions found inside documents. |
| **Pulse** | `/pulse` | Re-measures the live database and rewrites [hot.md](hot.md) — security, vitals, money findings, page health — reporting what changed since last time. |
| **Recall** | `/recall` | Answers "what do we know about X" with a named source for every claim: hot cache → locked facts → logs → domain pages → sources → live table comments. |
| **Investigate** | `/investigate` | The deep forensic pattern — frame it so it can be proved wrong, check what is joinable, derive two ways, control for the known artifacts, decompose until the cause names itself. This is what found storage booked as revenue and a "yield gain" that was a packaging change. |
| **Verify** | `/verify` | One claim, two independent derivations. Run before any figure enters a meeting or a contract. Disagreement is the finding — never averaged, never silently resolved. |
| **Work order** | `/workorder` | Turns a finding into a paste-ready, self-contained brief for the lane that owns it — Agent A, B, C, or the watchdog. A finding without an owner dies. |
| **Brief** | `/brief` | The owner's operating picture: decisions waiting on you first, then money at risk with the arithmetic, what moved, what is overdue. One screen, recommendation not menu. |
| **Explain** | `/explain` | Any figure, page, finding or empty state turned into plain English a non-technical owner can act on — grounded and verified, never invented (rule I3). Also drafts page help. |
| **Librarian** (agent) | delegate ingestion/maintenance | Batch-ingests, reconciles this index against the real file tree, audits the brain for stale claims and contradictions. |
| **Auditor** (agent) | delegate verification | Read-only forensics: derives any figure two independent ways; disagreement is the finding. The pattern book is `verification_checks`. |
| **Challenger** (agent) | run before anything leaves the building | **Tries to REFUTE a finding.** Defaults to refuted; makes the claim earn survival. Ten attacks — wrong basis, moved denominator, maturity censoring, known artifacts, sample too small, a check that cannot fail, estimated row counts, the unexamined innocent explanation. Built 7 Aug because five conclusions were overturned that day and **every catch was accidental**. |

Feeding rule: **no business data ever leaves this machine or the company
Supabase** — never into third-party or free-tier model APIs, which may train
on prompts.

---

## The map

### The brain (this folder)
| File | What it holds |
|---|---|
| [hot.md](hot.md) | **Read first.** Live platform pulse — security posture, vitals, open money findings, page health — measured directly against the database, timestamped. Regenerate when stale. |
| [CONTRADICTIONS.md](CONTRADICTIONS.md) | **The owner's arbitration queue.** Every place two sources disagree — including two locked facts — with both sides and what settling each unlocks. |
| [BACKLOG.md](BACKLOG.md) | Planned but not built, ranked — the big fifteen plus the fastest-moving open P0s, from a full read of every design doc and gap register. |
| [DECISIONS.md](DECISIONS.md) | Every settled decision — dated, with who and why. Newest first. |
| [LESSONS.md](LESSONS.md) | Every expensive mistake and what it taught. The rules in CLAUDE.md were born here. |
| [domains/cultivation.md](domains/cultivation.md) | Rooms, cycles, pulls, yield, genetics — where each fact lives. |
| [domains/inventory.md](domains/inventory.md) | Weights vs counts, wet vs dry, streams, the evidence view. |
| [domains/metrc.md](domains/metrc.md) | The legal record, the mirror, corrections, sync, API access. |
| [domains/money.md](domains/money.md) | Rates, costs, valuation — and where every dollar figure comes from. |
| [domains/platform.md](domains/platform.md) | Architecture, key functions, navigation, deploys, security, the agent fleet. |
| [sources/](sources/) | Digests of ingested reading — one dated file per batch, with provenance. Already in: the agent-tooling landscape, the full docs read, the full handoff read, the codebase map (App.jsx line-by-line, bridge, tools, CI), and the Metrc manual digest ([2026-08-07-metrc-manual-digest.md](sources/2026-08-07-metrc-manual-digest.md) — both PART PDFs read complete and page-cited; proves they duplicate the v7.1 guide, and settles the wet-basis harvest ledger, the custody-vs-ownership transfer types, and the reason-code asymmetry). |
| [inbox/](inbox/) | Drop zone for raw material awaiting ingestion. See its README. |

#### How every agent is meant to operate
*Reconciled into this map 8 August 2026 — 24 brain files existed and none of them
were listed here, so the index described less than half the brain it indexes.*

| File | What it holds |
|---|---|
| [AGENT_BRIEFING.md](AGENT_BRIEFING.md) | **The one the SessionStart hook injects into every agent, in full.** Self-contained: Rule Zero, the data traps, the fix protocol. Never re-summarise it anywhere — a hand-written copy went stale within two hours on 7 Aug. |
| [AGENT_DATA_RULES.md](AGENT_DATA_RULES.md) | **Canonical text** of the data rules, pasted into the four runtimes that cannot read a file at run time (desktop bridge, local model path, Send-to-Claude brief, budz-chat function). Change it here first. |
| [AGENT_CAPABILITY_CONTRACT.md](AGENT_CAPABILITY_CONTRACT.md) | The contract every agent meets, so TG Brain, Budz and the build crew all behave the same way. |
| [AGENT_ROSTER.md](AGENT_ROSTER.md) | The org chart for every agent — one place to manage them, one role that cross-references and reviews. |
| [CHARTER.md](CHARTER.md) | Agent D's charter — Brains, Loops & Agents. Follows the same lane discipline as `docs/AGENT_WORK_DIVISION_AND_WATCHDOG.md`. |

#### Enforcement, traps and recovery — read before you trust anything
| File | What it holds |
|---|---|
| [RULE_LEDGER.md](RULE_LEDGER.md) | Every hard rule in CLAUDE.md mapped to the machinery that proves it still holds — **and which rules are merely hope.** |
| [DATA_TRAPS_REGISTER.md](DATA_TRAPS_REGISTER.md) | Every way this platform has been lied to by its own data, and which traps are actually guarded. |
| [HARDCODED_REGISTER.md](HARDCODED_REGISTER.md) | Every hardcoded value found. Rule G1 says there should be none; this is the list of violations. |
| [RUNBOOK_RECOVERY.md](RUNBOOK_RECOVERY.md) | What to do when it breaks. **First test: broken, or legitimately EMPTY?** 43 of 236 pages are empty by design. |

#### Plans, boards and open questions of fact
| File | What it holds |
|---|---|
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | Five phases with exit criteria. **Phase 0 blocks the rest** — the platform has been getting Phase 3 analysis without a Phase 0. |
| [CRITICAL_BOARD.md](CRITICAL_BOARD.md) | The must-do-today list, ranked by consequence, computed live rather than typed. |
| [IDEAS.md](IDEAS.md) | What the AI brains should think about first. Figures marked DERIVED are calculation, **not measurement** — treat accordingly. |
| [CAPACITY_TRUTH.md](CAPACITY_TRUTH.md) | Measured room turnaround, held as evidence: turnaround is the team's contractual responsibility and the owner disputes what he was told. |
| [MATERIAL_MODEL_RESOLUTION.md](MATERIAL_MODEL_RESOLUTION.md) | How inbound material resolves — `bought_as` unset on 30 suppliers, no destination tracking, empty purchase tables, tolling that owns nothing. |

#### Specifications — designed, not yet built
| File | What it specifies |
|---|---|
| [DASHBOARD_SPEC.md](DASHBOARD_SPEC.md) | **Everything the owner has ever said about dashboards, gathered once** — the six hard rules, the DDC scale, the arrangeable section on *every* dashboard, drill-down navigation, the honesty rules for a tile, and what is still his to decide. Written 16 Aug 2026 because he was tired of repeating it: *"i do not want to repeat all that again."* Read it before building or changing any dashboard. |
| [SENTINEL_SPEC.md](SENTINEL_SPEC.md) | The watcher that cannot go quiet. Commissioned after the Metrc sync was dead **7 h 16 min while every dashboard reported success.** |
| [OS_WATCHDOG_SPEC.md](OS_WATCHDOG_SPEC.md) | Oversight that lives *inside* the OS, because agents A–D are external build crew on a desktop. |
| [SHADOW_LOG_SPEC.md](SHADOW_LOG_SPEC.md) | The evidence engine behind AI_BRAINS_2027: the AI commits to a decision **before** the human does, sealed, then both are scored against what happened. |
| [AI_BRAINS_2027.md](AI_BRAINS_2027.md) | The 2027 goal — hands stay human, brains become AI. |
| [STRAIN_GRADING_SPEC.md](STRAIN_GRADING_SPEC.md) | Grading strains and yields so harvests can be planned for greater yield. |
| [STRAIN_PRODUCT_LIBRARY_SPEC.md](STRAIN_PRODUCT_LIBRARY_SPEC.md) | **Agent H's module blueprint, 10 Aug 2026.** The customer-facing Strain & Product Library — COA parsing, strain register reconciliation, product catalogue, Jane PCT and Shopify export, share links. Carries five measured corrections to the work order, including that `strain_library` is 92% product names and that the COA parser's queue is permanently empty. Nothing built. |
| [BUDZ_DEEP_CAPABILITY_SPEC.md](BUDZ_DEEP_CAPABILITY_SPEC.md) | Giving Budz real agentic capability through the bridge. |
| [AI_COLLABORATION_SPEC.md](AI_COLLABORATION_SPEC.md) | Collaborating with agents inside the OS, including "write a report for the meeting". |
| [AI_SETUP_SELF_SERVE.md](AI_SETUP_SELF_SERVE.md) | Self-serve AI setup, admin-gated. Max three people, each pays their own way, company cost $0. |

#### Open work orders — a finding without an owner dies
| File | What it asks for |
|---|---|
| [WORKORDER_COA_LINK.md](WORKORDER_COA_LINK.md) | 965 packages gain a certificate with **zero** Metrc calls — the backfill already ran; the link is what is missing. |
| [WORKORDER_AGENT_A_SYNC.md](WORKORDER_AGENT_A_SYNC.md) | Metrc sync diagnosis for Agent A, from `metrc_sync_runs`. Read-only; re-measure before acting. |

### The active half — the database's own knowledge organs
The brain's markdown is the passive half. These live tables are the half that
runs on its own, on 25 cron jobs. Query them; never let a document substitute
for them.

| Table | What it does |
|---|---|
| `platform_state` | Nightly self-check, append-only. Its comment: HANDOFF.md should be *generated* from its latest row, not hand-written — it caught the handoff materially wrong on 7 Aug 2026. |
| `agent_registry` | Every agent on the platform (18), what it watches, how often it must run, how we prove it is right. |
| `watchdog_runs` / `watchdog_findings` | The twice-daily watchdog and its findings — each with the arithmetic, who is accountable, and what to do. |
| `verification_checks` / `verification_runs` | Each check derives one fact two independent ways; **disagreement is the finding**. |
| `canary_runs` | Every 20 minutes: all 236 pages checked for missing, empty, slow or erroring sources. |
| `open_questions` | Business intent the data cannot answer — raised automatically, answered only by the owner. |
| `agent_findings` / `finding_state` / `finding_owners` | The agents' findings pipeline. Nothing closes until Metrc agrees; suppression must carry an expiry. |
| `ddl_guard_log` | Trips whenever schema is created without RLS or reachable by anon. Unresolved rows are live security debt. |
| `security_grant_snapshot` / `security_anon_allowlist` | The security figure of record. The allowlist should stay near-empty — adding a row is a named, reasoned decision. |
| `tg_overrides` / `figure_of_record` / `source_precedence` | Manual corrections beside synced data, which source wins, and why. |
| `alert_outbox` / `item_alert_route` / `alert_recipient` | The nagging machine — append-only reminders until a human resolves the issue. |
| `reason_code_catalog` / `reason_policy` | Controlled vocabulary for why decisions were taken, and which actions demand one. |
| **The harvest truth set** *(built 10 Aug 2026)* | `v_harvest_water_and_yield` — every one of the 380 harvests: wet in, waste, **water**, dry yield, balance check. All 380 balance to zero. · `v_harvest_yield_audit` — the verdict, and **which typed number moved** · `v_harvest_accountability` — who owned it at grow and at dry · `v_cultivation_scoreboard` — per person and per room, ranked on the strain's **own** median · `v_cost_per_pound` — trailing cost, fresh frozen converted at 4.5:1 first. **Moisture comes ONLY from the Harvests-Inactive export; the Metrc API has no moisture field, only a residual.** |
| `harvest_responsibility` + `f_harvest_accountable()` | **Metrc records NO person on a harvest** — not in the API, not in the export. This is the only place accountability can live. Assign by room and period and it rolls forward; assign by harvest to override. Says NOBODY ASSIGNED rather than guessing. |
| `sentinel_expectation` + `f_sentinel_check()` | **The dead-man's switch, built 8 Aug 2026** from `SENTINEL_SPEC.md`. Every other check asks "is what I can see wrong?"; this asks "has something stopped speaking?" Owner-set silence limits per source; `tg_sentinel_sweep()` runs every 15 minutes and raises a critical finding. Built because the Metrc sync was dead **7 h 16 min** while every dashboard reported success. |
| `v_unchallenged_findings` | Findings nobody has tried to refute. The Challenger defaults to REFUTED and makes a claim earn survival — an unchallenged finding has earned nothing. **86 unchallenged on 8 Aug 2026, 25 of them critical.** |
| `audit_events.actor_name` + `f_actor()` | Who did it. Added 8 Aug 2026 after `audit_events` was found holding **3,589 rows with 0 actors** — `auth.uid()` is null for every agent, migration and cron job, which is all of them. `nav_registry` is now audited too. |

### Design and planning — `docs/`
| File | What it is |
|---|---|
| `docs/02_CURRENT_STATE.md` | Current-state audit of the original TG Planner v4 workbook. |
| `docs/03_PLATFORM_BLUEPRINT.md` | Platform build blueprint distilled from the workbook. |
| `docs/04_ENHANCEMENT_PLAN.md` | Enhancement plan — features, functions and tools. |
| `docs/05_OS_MAP_AND_BLUEPRINT.md` | System map and build blueprint, including the Four Laws. |
| `docs/06_INTAKE_PREROLL_PLANNER.md` | Intake #1 — pre-roll production planner and daily scheduler. |
| `docs/07_DEEP_SCOPE_ENHANCEMENTS.md` | 30 enhancements not yet in the plan; #0 is "the OS must measure its own adoption". |
| `docs/08_INTAKE_WORK_LAYER.md` | Intake #2 — the work-management layer (CODE-023). |
| `docs/09_METRC_API_ACCESS.md` | Metrc API access — verified findings and the action path. |
| `docs/AGENT_B_PROMPT.md` | Operating prompt for Agent B. |
| `docs/AGENT_WORK_DIVISION_AND_WATCHDOG.md` | The two agent lanes and the watchdog charter. Read before parallel work. |
| `docs/AUDIT_2026-08-07_SENIOR_REVIEW.md` | Independent senior engineering review, 7 Aug 2026 — the security findings. |
| `docs/tg_audit_brief.html`, `docs/tg_color_code.html` | Audit brief and the colour code, as shareable pages. |

### Gap registers — `docs/gap_register/`
| File | What it tracks |
|---|---|
| `chat_gaps.md` | Everything the owner asked for in chat, chronologically, and whether it landed. |
| `workbook_gaps.md` | Workbook → OS gap register; verdict on "90% was omitted". |
| `clickup_capability_map.md` | ClickUp capabilities the work layer must match (CODE-023). |
| `export_import_print_map.md` | Sitewide export / import / print audit. |
| `reference_screens_inventory.md` | Owner-shared reference screenshots and the design language to adopt. |

### Handoff pack — `docs/handoff/`
| File | What it is |
|---|---|
| `00_START_NEW_CHAT.md` | How to open a new session in the RIGHT folder, and the opening message to paste. |
| `README.md` | Reading order and the first four tasks for a new agent. |
| `MENU_MAP.md` | Every menu, category, sub-category and page. |
| `ALL_PAGES.csv` | Machine-readable list of every page. |
| `DATA_INTEGRITY_2026-08-06.md` | The sitewide forensic data-integrity pass. |
| `METRC_SYNC_2026-08-06.md` | Metrc call reduction and scan scheduling. |
| `METRC_REPORT_SOURCES.md` | What Metrc reports give that the API does not. |
| `SECURITY_CHANGE_2026-08-06.md` | The 6 Aug security change. |
| `SESSION_TRANSCRIPT.md` / `.html` | Full transcript of the founding session. |

### Authoritative source files — do not re-derive what these settle
| File | What it settles |
|---|---|
| `docs/source-of-truth/TG_2026_Harvest_Calendar_STRICT_8_WEEK_CYCLE.xlsm` | Rooms, cycle, pulls, per-plant yield. The locked cultivation facts come from its Pull Summary tab. |
| `docs/source-of-truth/Manufacturing_Production_Worksheet.xlsx` | Manufacturing production plan. |
| `source/Twisted_Growers_Enterprise_Operations_Planner_2026-2030_v4.xlsx` / `v5.xlsx` | The original operations planner workbooks the platform replaces. |
| `source/Metrc_User_Guide_v7.1.pdf` (+ `_extracted.txt`) | Metrc's own user guide, 2017 generic edition — the **complete 213-page copy, and the one to cite.** Harvest detail, packages, transfers, sales and testing (pp. 101–209) exist here and nowhere else on file. |
| `source/Metrc_Manual_PART_1_OF_2.pdf` | **Redundant partial copy** of the v7.1 guide — 100 pages = printed pp. 1–100 (admin, tags, immature/vegetative plants), 99.18% text-identical to it. Digested 7 Aug 2026. |
| `source/Metrc_Manual_PART_2_OF_2.pdf` | **Redundant partial copy** of the v7.1 guide — 4 pages = printed pp. 210–213 (Acronyms & Glossary), character-for-character identical to it. Digested 7 Aug 2026. |
| `workbook_extract/` | Text extracts of every planner workbook tab (payroll, roster, budgets, calendars, sales, inventory…). |

### The code
| Where | What runs there |
|---|---|
| `app/web/src/App.jsx` | The product — single-file React SPA (~6,400 lines as of 7 Aug), plus `styles.css`, `rules.css`, `budz.jsx`. |
| `app/web/src/lib/dashboard-range.js` | The one guarded client path to `f_department_dashboard`: binds the selected endpoints and returns failures or unverifiable empty results instead of substituting an all-time snapshot. |
| `supabase/` | `checks/` (including `anon_exposure.sql`, the security tripwire) and `functions/`. |
| `bridge/` | Local bridge service — `server.mjs`, `sheet-sync.mjs`, start scripts, `SETUP.md`. ⚠ `token.txt` holds a live credential: never share, never commit. |
| `tools/` | `checks/`, `hooks/`, `pushreports.py`, `report_fixtures.py`, and `gen-handoff.mjs` — regenerates the measured-state block of HANDOFF.md from `tg_handoff_state_md()`, so state stops being retyped. Operator tool: needs a live credential, correctly not a CI gate. |
| `tools/checks/guard-fixtures.mjs` | **Proves the guards still catch what they claim**, and that the PreToolUse hook and `ci.yml` agree on every fixture. Built 8 Aug 2026 after one false positive locked a database function and simultaneously held CI red — two enforcement points, one rule, the same bug, found by accident. |
| `tools/checks/secret-scan.mjs` | Scans the **working tree** (not just commits) for credential shapes, and shares its patterns with `tools/hooks/guard-secrets.mjs` so writing one is refused. Anon keys are decoded and ignored — they are public by design. Ratchets against `secret-scan.baseline.json`, which carries 4 known exposures with their required actions. |
| `tools/checks/rule-ledger.mjs` | **How much of CLAUDE.md is real, derived at run time.** Reads all rule families A–L and the rules each guard names, then reports enforced versus hope. The enforced high-water mark may rise, never fall. |
| `tools/checks/date-range-integrity.mjs` | **Enforces L8 for department dashboards and the shared date control.** There is exactly one guarded date-aware query path, no ranged-to-all-time fallback, and manual dates notify the save layer that the choice is Custom. Positive and negative detector fixtures run before the repository scan. |
| `tools/tests/dashboard-range.test.mjs` | Executable contract tests for the guarded dashboard read: exact RPC arguments, visible errors, and rejection of empty or unverifiable results. |
| `.github/workflows/` | CI. |
| `netlify.toml`, `.netlify/` | Deploy config. Live site and IDs are in HANDOFF.md §1. |
| `.mcp.json` | MCP server config for this project. |

---

*Provenance: assembled 7 Aug 2026 by the CEO agent from CLAUDE.md, HANDOFF.md,
and a file-by-file sweep of the repo. If a described file moves or dies, fix its
line here in the same session.*
