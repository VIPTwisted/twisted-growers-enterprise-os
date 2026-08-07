# In-OS agent collaboration and meeting reports — spec

**Owner requirement, 7 August 2026:** *"I need to be able in the OS to
collaborate with agents and they give me these detailed chats where I can say
'write a report for meeting'."*

Agent D owns the design. Building it is Agent B's lane (front end) plus one
owner action (the API key).

---

## The good news: this is ONE BUG away from working

The backend already exists and is well built. The deployed `budz-chat`
function:
- Pulls **live context by keyword** — problem harvests, custody alerts, aging
  inventory, transfers, loss summary, awaiting allocation, schedule violations.
- Is instructed: *"Answer ONLY from the CONTEXT supplied. It is the real Metrc
  record. If the context does not contain the answer, say so plainly and name
  the report that would need to hold it. Never guess, never invent a number."*
- Enforces a **budget cap** via `tg_ai_budget_ok` and logs cost per call.
- Reads its key from the in-app vault first, environment second.

**It has never run.** `ai_usage_log` holds **0 rows**, and that function logs
on every path including failures — so no request has ever reached it.

**Cause:** `budz.jsx` builds its URL from `import.meta.env.VITE_SUPABASE_URL`,
which does not exist in `app/web` (`lib/supabase.js` states the URL and key are
deliberately not read from env). The call resolves to
`undefined/functions/v1/budz-chat` and dies in a bare `catch`. **Fix is in the
Agent B work order, Task 1.**

**Second blocker, owner action:** no `ANTHROPIC_API_KEY` in the vault. The
function returns an honest message saying so.

## The three-tier answer strategy already configured in `ai_settings`
1. **Desktop bridge** — real Claude Code on the owner's machine, on his Max
   subscription: **free**, with project and database access. *(Currently
   broken — lost its grants in the security revoke. See CONTRADICTIONS #8;
   needs its own credential before restart.)*
2. **Local model** — Ollama, `qwen2.5:14b`, currently disabled. **Zero data
   egress** — the right answer for anything sensitive.
3. **Paid API** — capped at **$100/month**, owner and executive only.

**Every answer states which tier wrote it.** That is better provenance than
most commercial AI products ship, and it is already designed.

---

## What must be added: "write a report for the meeting"

### The capability
The user asks in plain English — *"write a report for Monday's meeting on
fresh frozen"* — and gets a document, not a chat message.

### What every generated report MUST carry (non-negotiable, house rules)
1. **The arithmetic in plain English**, the way `watchdog_findings.the_arithmetic`
   does it: *"5 packages × 75.4 lb × $1,100 = $82,940."*
2. **Provenance on every figure** — which table or view, measured when (A2).
3. **The basis stated on every weight** — wet or dry, never ambiguous
   (B3/B4/A4). *This is the rule that would have prevented the "over 400 lb"
   ambiguity in a real meeting.*
4. **Measured vs derived, marked** — anything computed rather than read is
   labelled as such, with its assumptions.
5. **What could not be measured, and why** (A3). Mandatory section, never
   omitted.
6. **Exculpatory findings shown as prominently as adverse ones** — a report
   that only points one way is advocacy and will not survive challenge.
7. **Sample sizes** on every comparison.
8. **A generated-on timestamp and the data as-of date** — counts here go stale
   within hours.

### Report types worth having as one-click
- **Meeting pack** — decisions needed, money at risk, what changed, what is
  overdue. (`/brief` already defines this shape.)
- **Performance report** — yield per pull, occupancy, dry/FF split, against
  target, for a chosen date range and room.
- **Exception report** — every open finding by severity with owner and age.
- **Period comparison** — this month vs same month last year, YTD vs prior
  YTD, custom range. *Owner-requested 7 Aug.*
- **Evidence pack** — a single claim, derived two independent ways, with both
  sources shown. For contractual conversations.

### Where reports go
Saved, printable, shareable. **Blocked on the write path** (backlog #1) for
saving; printing is blocked on the global `@media print` stylesheet, which is
specified in `docs/gap_register/export_import_print_map.md` and not built —
and which matters because cannabis floor paper gets picked up by inspectors,
so every printed page must identify itself.

## Sequence
1. **Fix the budz wiring** (Agent B, Task 1) → chat works.
2. **Owner sets the API key** → free-form answers work.
3. **Add the report generator** — same context loader, different output
   contract, with the eight requirements above enforced.
4. **Print stylesheet** → reports leave the building correctly.
5. **Save to `saved_views` / report storage** → needs the write path.

## What already works today with no fix at all
`budzAnswer` in `budz.jsx` is a **hand-written intent router** that queries
live views directly and needs no model and no key. The suggestion buttons run
on it and cost nothing. That is the fallback the function itself points users
to, and it is genuinely useful — it should not be removed when the model path
starts working.
