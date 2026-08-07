# Budz with real agentic capability — the bridge

**Owner, 7 August 2026:** *"He must be able to communicate and collaborate with
me like you and I are now. Run any task, research everything."*

---

## The honest architecture

What makes this session work is **not a better model** — it is multi-step tool
use: run a query, read the result, run another, delegate a deep dive to a
sub-agent, read files, cross-verify, correct. **A single model call with
pre-loaded context cannot do that**, no matter how good the model.

Three tiers exist, and only one can do it:

| Tier | Can it "run any task, research everything"? | Why |
|---|---|---|
| **Intent router** (`budzAnswer`) — free, working today | **No** | Fixed queries. Instant and free, but it cannot follow a thread. |
| **`budz-chat`** — paid API, $100/mo cap | **No** | One call, context pre-loaded by keyword. It reasons; it cannot investigate. |
| **The desktop bridge** — real Claude Code on the owner's machine | **YES** | Full tool use, database access, sub-agents. **This is what has been running all day.** Free on the Max subscription. |

**The answer to the owner's request is the bridge.** `ai_settings` already
names it tier 1, `bridge_enabled = true`, and three go-live items record it as
DONE: "Desktop Claude bridge — keep it running", "Auto-start the bridge with
Windows", "Bridge status shown in the top menu". The top bar's **"AI offline"**
is that status indicator.

## Why it is offline, and the fix

`bridge/server.mjs` polls `ai_bridge_jobs` every 700 ms **using the public
publishable key**. When anonymous access was revoked on 7 Aug it lost its
grants and stopped.

**Do not simply re-grant anon.** The original design allowed *unauthenticated
remote code execution on the owner's workstation*: the bridge passes a job's
`question` field to Claude Code running in the project directory with the
owner's environment, and `ai_bridge_jobs` was anon-writable — so anyone holding
the publishable key could insert a row and have it executed. It was contained
by **stopping the bridge**, not by a policy change.

**The recorded fix, from 6 Aug, still stands: the bridge gets its own
credential.** Not the public key, not a re-grant to anon — a dedicated
identity that can read its own job queue and nothing else.

## PER-USER BRIDGE — the owner's design, and it is the right one

**Owner, 7 August 2026:** *"Each team member sets him up for themselves. Only
two of us will have this option — it will be hidden for everyone else."*

**This is a better architecture than the one currently built**, and it fixes
the security hole rather than patching around it.

### Why per-user is more secure, not less
Today `ai_settings` holds **one global `bridge_url` and `bridge_token`** on a
single row, and `ai_bridge_jobs` was anon-writable — so anyone with the
publishable key could enqueue work that ran on the owner's machine.

Give every authorised user their own bridge and their own credential, and each
bridge polls **only for jobs belonging to its own user**. The worst case stops
being *"a stranger runs code on the owner's workstation"* and becomes
**"you can cause code to run on your own machine"** — which is what running a
local agent means anyway. The blast radius collapses to the person who chose it.

### The schema already supports per-user AI — the bridge is the missing column
`ai_user_access` already carries, per user: `enabled`, `daily_call_limit`,
`monthly_call_limit`, `allowed_features`, **`own_key`**, **`own_key_provider`**,
**`uses_local_model`**, **`local_model_url`**. Per-user AI configuration was
designed from the start.

**The bridge is the one thing left global.** Move `bridge_url`, `bridge_token`
and `bridge_enabled` from the single `ai_settings` row onto `ai_user_access`,
per person. `ai_settings` keeps the company defaults and the spend cap;
`ai_user_access` holds each person's own setup.

### Setup flow, per person
1. Owner enables the user in `ai_user_access` — **this is the gate; everyone
   else never sees the option** (already how `ai_allowed_roles` works).
2. The user installs the bridge on their own machine and signs in to Claude
   Code with their own subscription.
3. The platform issues **that user** a bridge token; they paste it in once.
4. Their bridge polls **only jobs where `asked_by` is them.** Never a shared
   queue.
5. The status pill shows **their** bridge, not a company-wide one.

Two go-live items already anticipate exactly this: *"Vincent: own AI bridge on
his machine"* and *"Reach the local model from a second machine."*

## Provider choice per user — "GPT or whatever" (owner, 7 Aug 2026)

`ai_user_access` already carries **`own_key` and `own_key_provider`** per user,
and `ai_settings.provider` holds only the company default. Per-user provider
choice was designed in. **But it means two different things and they are not
interchangeable:**

| What the user supplies | What they get | Multi-step research? |
|---|---|---|
| **An API key** — OpenAI, Anthropic, Google, whatever | One call with pre-loaded context. Reasoning over what was handed to it. | **No** |
| **A local agent CLI** — Claude Code, OpenAI Codex, Ollama-driven | Full tool use: query, read, delegate, cross-verify. **This is the research tier.** | **Yes** |

**A GPT *key* gets the reasoning tier. A GPT-based *agent CLI* gets the research
tier.** If a user says "I want GPT" and is handed a key field, they will get a
worse experience than the bridge and conclude the platform is weak.

### What has to change to make the bridge provider-agnostic
`bridge/server.mjs` **hardcodes `claude.cmd`** (~line 19) with Claude-specific
flags (`-p --permission-mode acceptEdits --allowedTools …`). The bridge is
otherwise generic: it polls a job queue, spawns a process, returns text.

**Make the agent command per-user configuration**, alongside the bridge token
on `ai_user_access`: which executable, which arguments, which working
directory. Then one person runs Claude Code, another runs Codex, a third runs
a local model — same queue, same platform, same answer contract. **Config as
rows, never code (G1).**

### ⚠ The data decision only the owner can make
This is a licensed cannabis operation. A per-user key means **Metrc records,
customer names, manifests and money can leave for whichever provider that user
chose.** Free tiers typically train on prompts; paid tiers usually do not, but
terms differ by provider and change.

**Recommendation: maintain an approved-provider list as rows**, and have
`ai_user_access.own_key_provider` validate against it. The owner decides which
providers may see business data — that is a compliance judgement, not a
technical default. **The local model tier (Ollama) remains the only option with
zero data egress**, and it is already configured (`qwen2.5:14b`) and disabled.

## BRING YOUR OWN AI — owner, 7 August 2026

*"Users can use any AI they want — desktop AI or web, that they pay for, for
now."* **Company AI cost becomes $0.** The $100/month cap stops being a budget
and becomes a backstop nobody needs.

Three paths, per user, and **one is already live:**

| Path | What it gives | Company cost | Status |
|---|---|---|---|
| **Web AI** — claude.ai, ChatGPT, Grok | Full conversation, whatever the user pays for | **$0** | **WORKING TODAY.** `AskExternal` composes a briefing with live records; the "Send to Claude" button on the Budz page copies it to paste anywhere. |
| **Desktop agent** — Claude Code, Codex, local model | **Multi-step research inside the OS.** The deepest tier. | **$0** | Bridge broken; needs the per-user credential and a configurable agent command. |
| **API key** — any provider | One call, pre-loaded context. Reasoning only. | **$0** (user's key) | `own_key` / `own_key_provider` already on `ai_user_access`. |

### The web path is live and better than it looks — but it is ONE-WAY
The platform already builds the briefing from live records, so the user's own
web AI reads real Metrc data without the company paying for a token. That is
genuinely clever and it needs no fix.

**The gap: the answer never comes back.** A question goes out, the reasoning
happens in a browser tab, and the conclusion dies there. **That breaks the
compounding-knowledge principle this whole department exists for.**

**The fix is small and high value: a "paste the answer back" field.** Save the
returned text against the question, with provenance — **who asked, which AI
answered, when, and what briefing it was given.** It becomes a note, a finding
or a decision in the record instead of a lost browser tab. Same discipline as
`ai_usage_log` for the paid tier: free work still gets audited.

### ⚠ The data question applies to the web path too
Pasting a briefing containing Metrc records, customer names, manifests and
money into a personal ChatGPT or Claude account is **the same egress** as an
API key — with less control, because personal accounts have consumer terms.
The approved-provider list should govern **all three paths**, not just keys.

## Security rails this must ship with

1. **Its own credential.** Scoped to `ai_bridge_jobs` and `ai_bridge_heartbeat`
   only.
2. **Only authenticated users may enqueue a job**, and the row records **who**
   asked. Today `asked_by` exists; it must be enforced, not optional.
3. **Read-only by default.** The bridge currently launches with
   `--permission-mode acceptEdits` and file-write tools. For answering
   questions it needs **Read, Grep, Glob and database SELECT — nothing more.**
   Editing is a separate, explicitly authorised mode.
4. **Every answer states which tier produced it** — already designed in
   `ai_settings` and must not be dropped.
5. **Log every job** to `ai_usage_log` like the paid tier, so bridge work is as
   auditable as API work even though it is free.

## What it gives Budz once fixed
Ask in the pet's chat box → job queued with the asker's identity → the bridge
picks it up → **real Claude Code runs the investigation against live data** →
the answer returns to the chat. Multi-step research, cross-verification,
sub-agents, and the house rules applied — exactly this session, inside the OS.

## The honest limits — state these plainly
- **It only works while the owner's machine is on and the bridge is running.**
- **It is one machine.** Two go-live items already recognise this: *"Vincent:
  own AI bridge on his machine"* and *"Reach the local model from a second
  machine."*
- **It cannot serve the whole team.** For that the options are the paid API
  (which cannot do multi-step research) or a hosted agent runner (a real
  project, not configuration).
- Access stays **owner, executive, cfo** with the $100/month cap on the paid
  tier. The bridge is free but not unlimited — it occupies the owner's machine.

## Sequence
1. **Bridge gets its own credential** and the job queue is closed to anon.
   *(Watchdog / grants lane.)*
2. **Bridge relaunched read-only** — Read, Grep, Glob, SELECT. No edit tools.
3. **Budz chat box routed to the bridge** when it is online, falling back to
   the intent router when it is not. The status pill already exists.
4. **Log bridge jobs to `ai_usage_log`** so free work is still auditable.
5. Then the pet, and the desktop companion after that.
