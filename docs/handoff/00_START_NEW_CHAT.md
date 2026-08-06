# How to start the new chat

## Step 1 — Open the right folder

In Claude Code, open this folder as the working directory:

```
C:\Users\demar\Documents\Claude_Twisted Growers
```

That matters. `CLAUDE.md` sits in that folder and loads **automatically** —
the new agent gets all 40 hard rules and the locked facts before it does
anything. If it opens the wrong folder, it starts blind.

Your Supabase and Netlify connections are already set up at the account level.
They carry over on their own — nothing to reconnect.

---

## Step 2 — Paste this as the first message

Copy everything between the lines and send it as your opening message.

---

You are taking over the Twisted Growers Enterprise OS as CEO agent. The previous
agent froze all development and prepared a handoff.

Before you do anything or answer anything, read these in order:

1. `CLAUDE.md` — the 40 hard rules and the locked facts. Binding. Do not weaken,
   reinterpret or improve any of them without my approval.
2. `HANDOFF.md` — the state of the system, nine known defects, the five ways this
   project has broken before, and what cannot be recovered from the repo.
3. `docs/handoff/README.md` — reading order and the first four tasks.
4. `docs/handoff/MENU_MAP.md` — every menu, category, sub-category and page.

Then tell me, in plain English and in under 20 lines:

- What you understand this system to be
- The three most serious problems open right now
- What you would do first, and why

Do not build anything. Do not change anything. Do not fix anything. The freeze
holds until I lift it.

Two things you must know before you touch the database:

- Never run `drop view ... cascade`. It destroyed the dashboards three times in
  one day, silently, with no error. Use `create or replace`.
- Metrc is the legal record. This platform is a read-only mirror and has no write
  credentials. Recording something here does not change Metrc.

I am not an engineer. Talk to me in plain English, show me the arithmetic, tell
me what is missing and why, and never invent a number to fill a gap.

---

## Step 3 — What to expect

A good new agent will come back with a short summary naming:

- **The moisture band contradiction** — 5,199 lb packaged from a theoretical
  4,157 lb. It sits underneath every conversion, yield and valuation figure.
- **412 lab items** — 54 genuinely out at the laboratory with no result, 358
  never submitted at all.
- **6,796 lb of phantom weight** on 88 closed harvests in Metrc.
- **Four missing views** breaking four pages, including Open Issues.
- **The staged front end** that is built but not deployed.

If it comes back wanting to build something new, or it has not read the rules,
stop it and point it at `CLAUDE.md` again.

---

## If you ever need to re-share everything

Everything is in three places and all three are current:

| Where | What |
|---|---|
| `C:\Users\demar\Downloads\` | The numbered documents and the CSV |
| GitHub `VIPTwisted/twisted-growers-enterprise-os` | Everything, 8 commits |
| `C:\Users\demar\Documents\Claude_Twisted Growers\docs\handoff\` | The same, in the repo |
