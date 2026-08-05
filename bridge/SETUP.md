# The AI bridge — setup

This lets you chat with Claude (and ChatGPT) **inside the Twisted Growers OS**, with the
assistant reading the live Metrc data as it answers.

It runs on your own computer and uses the subscription you already pay for.
**There is no extra bill.**

---

## Who this is for

| Person | Plan needed |
|---|---|
| Vinny (owner) | Claude Max — already set up |
| Vincent | Claude Max and/or ChatGPT Plus/Pro — follow the steps below |

Anyone without a subscription still gets every built-in report answer in the OS.
They just don't get the free-form conversation.

---

## Part 1 — Sign in to Claude Code (once)

1. Double-click **"Sign in to Claude Code"** on the desktop.
2. Type `/login` and press Enter.
3. Sign in with the Claude account in the browser window that opens.
4. Close the window when it says you're signed in.

That's permanent. You never do it again on this machine.

**If the shortcut isn't there**, open a terminal and run:

```bash
claude
```

then `/login`.

---

## Part 2 — Start the bridge

**It starts by itself when Windows starts.** Nothing to do day to day.

To start it by hand — after a crash, or if you closed it — double-click
**"Start TG Bridge"** on the desktop. A small window opens and stays open.
Leave it running; minimise it if it's in the way.

**To check it's alive**, open this in a browser:

```
http://127.0.0.1:8765/health
```

You should see `{"ok":true,...}`. If the page won't load, the bridge isn't running.

---

## Part 3 — Use it

Open the OS, go to **Budz Assistant**, and ask anything.

Every answer says which one wrote it:

- **"Researched by Claude on your desktop"** — the bridge, free
- **"Researched by Claude (API)"** — the paid fallback, capped at $100/month
- No label — the plain database report, always free

If the bridge is off, it quietly falls through to the next option. You never see an error.

---

## Setting this up for a second person

Everything below happens on **their** computer.

### 1. Install what's needed

- **Node.js** — https://nodejs.org (take the LTS button)
- **Claude Code** — in a terminal:

```bash
npm install -g @anthropic-ai/claude-code
```

### 2. Copy the bridge folder

Copy the whole `bridge` folder to their machine, for example to
`C:\TwistedGrowers\bridge`.

### 3. Point it at the project

Open `server.mjs` and change this line to wherever the project sits on their machine:

```js
const PROJECT = process.env.TG_PROJECT || "C:\\Users\\demar\\Documents\\Claude_Twisted Growers";
```

If they don't have the project checked out, point it at any folder — the database
connector still works, they just won't have the source code.

### 4. Give them their own token

Open `token.txt` and replace the contents with something only they have. Then in the
OS, Settings → AI Settings, set `bridge_token` to match. **Don't reuse the owner's token.**

### 5. Connect Claude Desktop to the database

Follow `CLAUDE_DESKTOP_SETUP.md` in the project root. That's what gives the bridge live
data to read.

### 6. Sign in and start

```bash
claude
```

then `/login`. Then double-click `start-bridge.cmd`.

To auto-start it, press `Windows + R`, type `shell:startup`, press Enter, and drop a
shortcut to `start-bridge-hidden.vbs` in the folder that opens.

---

## ChatGPT

ChatGPT has **no equivalent of Claude Code**, so there's no bridge for it — a Plus or Pro
subscription can't be driven from an application the way Claude Code can.

What works instead: the **"Send to ChatGPT"** button on the Budz page. It copies your
question together with a full briefing — the licences, the database views, and the
analytical traps to avoid — and opens ChatGPT. Paste and go.

Same for **Grok**.

So: **Claude answers inside the OS. ChatGPT and Grok are one paste away.**

---

## If something goes wrong

**"The bridge is running but Claude Code is not signed in yet"**
Do Part 1.

**Answers come back but never say "on your desktop"**
The bridge isn't running. Double-click "Start TG Bridge" and check the health page.

**"Bad bridge token"**
`token.txt` and the `bridge_token` in AI Settings don't match. Make them identical.

**It's slow**
The bridge is really running Claude against the live database — 10 to 40 seconds for a
real question is normal. It gives up at five minutes and says so.

---

## Security

- The bridge listens on **127.0.0.1 only**. Nothing outside the computer can reach it —
  not the office network, not the internet.
- A shared token is required on every request.
- The browser is restricted to the Twisted Growers site by CORS.
- Database access is **read only**, and service keys are blocked outright.
