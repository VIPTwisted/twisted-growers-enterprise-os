# AI setup — self-serve, gated by admin

**Owner, 7 August 2026:** *"Set it up so they can do it fast and easy if admin
grants them access to AI."* Maximum three people. Each pays for their own AI.
Company cost: **$0**.

---

## The gate — one toggle, and everyone else never sees any of this

Admin enables the person in **Settings → Artificial Intelligence → Artificial
Intelligence Access** (`ai_user_access.enabled = true`). Until then, nothing in
this document is visible to them: no menu item, no setup page, no Budz pet.
That gate already exists and already works — `ai_allowed_roles` plus the
per-user row.

**Everything below appears only after the toggle.**

---

## PATH 1 — Web AI. Zero install. Works today. Start here.

**Setup time: none.** No download, no token, no terminal.

1. Open **Command Center → Budz Assistant**.
2. Ask a question, or pick one of the suggestion buttons (those answer
   instantly from the database and cost nothing at all).
3. For anything bigger, press **Send to Claude**. The platform writes a full
   briefing from live Metrc records and copies it.
4. Paste it into whatever AI you pay for — claude.ai, ChatGPT, Grok. It reads
   real records, not a guess.
5. **Paste the answer back** into the platform so the conclusion is kept.
   *(This field does not exist yet — see the gap below. Until it does, the
   answer lives only in your browser tab.)*

**This covers most of what most people need, and it is already live.**

## PATH 2 — Desktop agent. The deep tier. One download, one double-click.

This is the one that investigates rather than answers — multi-step research
against live data, the way an analyst works.

**The setup must be this short, or it will not get used:**

1. Admin enables you. A **Set up my agent** button appears on the Assistant
   page.
2. Press it. The platform shows **your personal bridge token, once**, and
   offers **a start file with your token already in it.**
3. Download it into a folder and double-click. It installs and starts.
4. The status pill in the top bar turns from **AI offline** to **your bridge,
   online**.

**No terminal. No config file to edit. No copying tokens by hand.** The pieces
already exist — `bridge/start-bridge.cmd`, `start-bridge-hidden.vbs`, `tg.ico`,
and *"Auto-start the bridge with Windows"* is already a completed go-live item.
**What is missing is that the token is global rather than personal, and the
start file is not generated per user.**

**Which AI runs inside it is your choice** — Claude Code, OpenAI Codex, or a
local model. The bridge spawns a command; today that command is hardcoded to
`claude.cmd`. **Make it a per-user setting** and everyone runs what they pay
for.

## PATH 3 — API key. The middle tier.
Paste your own key into your profile. `ai_user_access` already carries
`own_key` and `own_key_provider`. **Be honest on the page about what this is:**
one call with context handed to it. It reasons; **it does not investigate.**
Anyone wanting real research wants Path 2.

---

## What has to change to make this real

**Move the bridge off the global row.** `ai_settings` holds a single
`bridge_url`, `bridge_token` and `bridge_enabled` for the whole company. Move
them to `ai_user_access`, per person, and add `agent_command` /
`agent_args` so each person's choice of AI is configuration, not code (G1).

**Scope the job queue to the asker.** Each bridge polls only jobs where
`asked_by` is its own user. Never a shared queue. This is what makes per-user
*more* secure than the global design: the worst case becomes "you can run code
on your own machine."

**Generate the start file per user**, with their token embedded, from the
Assistant page. This is the entire difference between "fast and easy" and
"ask an engineer."

**Relaunch the bridge read-only** — Read, Grep, Glob, database SELECT. It
currently launches with `--permission-mode acceptEdits` and file-write tools,
which no chat assistant needs.

**Add the paste-back field** on the web path, storing the answer with
provenance: who asked, which AI answered, when, and what briefing it was given.
**Without it the web path is one-way and the knowledge leaves the building.**

## What the owner still decides
Which AI providers are approved to see Metrc records, customer names,
manifests and money — **and that governs all three paths**, including a
briefing pasted into a personal ChatGPT account. At three people this is a
conversation, not a policy engine, but it should be a decision rather than a
default. The **local model tier is the only option with zero data egress**;
it is configured (`qwen2.5:14b`) and currently disabled.
