# The agent capability contract — every agent works the same way

**Owner requirement, 7 August 2026:** *"I want any agent to do this,
especially TG Brain, Budz Assistant, all of them. Budz will act like a pet I
can put anywhere and he collaborates with me like you are."*

---

## What actually makes an agent work this way

Four things, in order of importance. Only the fourth is missing.

**1. Live data, verified — never memory.** Every claim traced to a query run
now. This is why nothing in today's session rests on a document.

**2. The house rules as the operating contract.** Never invent (A1),
provenance on everything (A2), absence explained (A3), **check units before
comparing (A4)**, never assume business practice — ask (A5), verify against
live before reporting (A6), **correct yourself plainly (A7)**. Wet and dry
never mix (B3/B4). Two derivations; **disagreement is the finding**, never
averaged.

**3. The honesty contract.** Show the arithmetic in words. State sample sizes.
Mark measured vs derived. Say what could not be measured and why. Surface
exculpatory findings as prominently as adverse ones.

**4. Depth on demand — THE GAP.** A single model call answers a question. It
cannot run a forensic investigation across dozens of queries. That is the
difference between "what is stock on hand" and "did any pull ever exceed
400 lb of dry flower, and does the record support the claim."

---

## The three tiers already designed map exactly onto three depths of question

| Tier | Cost | Answers | Status |
|---|---|---|---|
| **Intent router** (`budzAnswer`) | **free** | "What is on hand?" — direct queries against live views | **WORKS TODAY.** No key, no model, no cost. |
| **Model + live context** (`budz-chat`) | ~$0.01/call, $100/mo cap | "Why is F2 empty and what does it cost?" — reasoning over loaded context | **Built, never called** — front-end env-var bug. |
| **Desktop bridge** — real Claude Code, project + database access | **free** (Max subscription) | **Everything done in this session.** Multi-step forensics, sub-agents, cross-verification | **BROKEN** — lost its grants; needs its own credential. |

**The bridge is the tier that does what I have been doing.** It is not a
lesser fallback — it is the deepest capability and it costs nothing. Fixing it
is the single highest-value item for this requirement.

## Budz as a pet — already built, not wired

`budz.jsx` exports **`BudzPet` (line ~1029)** and **`useBudzPet` (~1019)**.
`App.jsx` line 4 imports only `BudzScreen`, `CeoDashboard`,
`AssistantSettings`. **The pet is dead code purely because it is not
imported.** Agent B: add the import, mount it at app level, persist its
position per user in `user_settings`.

The identity already exists too: `assistant_profile` holds **Budz**, "Live on
the floor", with an avatar; `assistant_avatars` holds 10 options.

## One shared brain, not per-agent prompts — and this is a rule, not a preference

**The deployed `budz-chat` system prompt contains facts the owner has
overruled**: it instructs the model that *"grams per plant is NOT a valid
benchmark… the real benchmark is grams per square foot of canopy"* when the
locked fact is **per plant (70.6 g)** and **there is no measured square
footage anywhere in the business**. It also carries moisture at 75–80% when
the live config is 70–77%.

**If every agent inherits a hand-written prompt, every agent inherits the
errors.** So:

> **The agent's facts must be GENERATED from the platform's own config —
> `conversion_factors`, `valuation_rates`, the locked facts, `company_licenses`
> — not typed into a prompt.** When a locked fact changes, every agent updates.
> This is rule G1 applied to prompts: config is rows, never code.

Each agent then differs only in **scope and tone**, never in facts:
- **TG Brain** — cross-domain investigation, the deep tier.
- **Budz** — the floor-facing companion; plain English, follows the user.
- **The watchdog** — findings only, never conversation.
- **Agent D's specialists** — librarian, auditor, inspector.

## Sequence
1. **Fix the bridge credential** → the deep tier returns, free.
2. **Fix the budz-chat wiring** (Agent B, Task 1) → the model tier works.
3. **Import `BudzPet`** → the pet is live. Smallest change, most visible.
4. **Generate the system prompt from config** → every agent stops carrying
   stale facts.
5. **Owner sets the API key** → free-form answers on the paid tier.

Access stays **owner, executive, cfo** with the $100/month cap and per-user
limits — see [DECISIONS.md](DECISIONS.md).
