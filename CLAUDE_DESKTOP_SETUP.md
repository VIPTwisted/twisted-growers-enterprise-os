# Connect Claude Desktop to the Twisted Growers OS

This lets you ask Claude about the company in plain English and have it read the
live Metrc data. It costs nothing beyond the Claude subscription you already pay
for. There is no API bill.

Access is **read only**. Nobody using this can change, delete or add anything.

---

## Who has this

| Person | Status |
|---|---|
| Vinny (owner) | Set up |
| _one more staff member_ | Follow the steps below |

Only grant this to people who should see the whole company. It reads everything
except stored service keys.

---

## What you need

- **Claude Desktop** installed and signed in — https://claude.ai/download
- **Node.js** installed — https://nodejs.org (take the LTS button)

That's it. Nothing else to install.

---

## Setup — about five minutes

### 1. Close Claude Desktop completely

Quit it, don't just close the window. On Windows check the system tray by the
clock and right-click → Quit if it's still there.

### 2. Open the settings file

**Windows** — press `Windows key + R`, paste this, press Enter:

```
%APPDATA%\Claude
```

**Mac** — press `Cmd + Shift + G` in Finder, paste this, press Enter:

```
~/Library/Application Support/Claude
```

Look for a file called `claude_desktop_config.json`.

- **If it's there:** open it with Notepad (Windows) or TextEdit (Mac).
- **If it isn't:** create it. Right-click → New → Text Document, name it
  exactly `claude_desktop_config.json`. Make sure it does not end up called
  `claude_desktop_config.json.txt` — on Windows you may need to turn on
  View → File name extensions to see that.

### 3. Paste in the connection

**If the file was empty or new**, paste exactly this and save:

```json
{
  "mcpServers": {
    "twisted-growers": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://tg_desktop_reader.fxetuqjryttnypgepsru:TGdesk-2026-r3ad0nly-8f3k2m@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
      ]
    }
  }
}
```

**If the file already had content in it**, don't replace it. Add the
`"mcpServers"` block alongside what's already there, remembering the comma:

```json
{
  "somethingAlreadyHere": "leave this alone",
  "mcpServers": {
    "twisted-growers": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://tg_desktop_reader.fxetuqjryttnypgepsru:TGdesk-2026-r3ad0nly-8f3k2m@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
      ]
    }
  }
}
```

### 4. Start Claude Desktop

The first launch takes about thirty seconds longer than usual — it's downloading
the connector once. After that it's instant.

### 5. Check it worked

Look for the tools or connector icon near the message box. You should see
**twisted-growers** listed.

Then ask it:

> How many harvests are in the system and how many are still open?

You should get **153 harvests, 30 still open**. If you do, you're connected.

---

## What to ask it

Ask in plain English. It writes the database queries itself.

- Which harvests have been open the longest and how much product is sitting in each?
- Compare the drying rooms — average dry days and conversion.
- Show me every harvest that dried longer than 20 days, with the strain and room.
- What failed testing and what is it worth?
- Which strains give us the best conversion?
- What is sitting in inventory longest?
- Build me a table of last six months: plants, wet pounds, packaged pounds, conversion.
- What would fail an inspection today?

It can pull anything the platform can, and it can do the analysis and write-up
in the same conversation — which the website can't.

**One thing to know:** ask it to exclude harvests that are still open when it
calculates conversion. A harvest that hasn't closed has its wet weight recorded
but not its packaged weight, so including it makes the number look worse than it
is. The view `v_monthly_conversion_truth` already handles this correctly.

---

## Useful things to point it at

| Name | What's in it |
|---|---|
| `v_harvest_forensic` | Every harvest: strain, drying room, plants, wet, packaged, waste, what's still in the room, dry days, conversion, written diagnosis |
| `v_harvest_issues` | Only the harvests with a problem |
| `v_dry_room_performance` | Each drying room compared |
| `v_monthly_conversion_truth` | Conversion by month, closed harvests only |
| `v_goal_status` | Every target against its live actual |
| `v_data_verification` | Ten integrity checks against the Metrc record |
| `v_cultivation_meeting_pack` | The monthly review agenda |
| `metrc_harvests`, `metrc_packages`, `metrc_plants` | The raw Metrc record |

---

## If it doesn't work

**"twisted-growers" doesn't appear in the list**
The file has a typo. Paste it into https://jsonlint.com — it will point at the
line. Usually it's a missing comma or a stray quote.

**"server disconnected" or it appears then vanishes**
Node.js isn't installed, or it was installed while Claude Desktop was open.
Install Node, then fully quit and reopen Claude Desktop.

**On Windows the file saved as a text document**
Turn on View → File name extensions in File Explorer and rename it so it ends
in `.json`, not `.json.txt`.

**It connects but every query returns nothing**
Tell Vinny. The read-only account may need its permissions refreshed.

---

## Security

- **Read only.** The account cannot write, update or delete. This is enforced by
  the database, not by asking nicely.
- **Service keys are not readable.** The `app_secrets` and `ai_user_access`
  tables are blocked outright.
- **Queries time out after 60 seconds**, so nobody can accidentally hang the
  database.
- **Revocable instantly.** If someone leaves, Vinny changes the password on the
  `tg_desktop_reader` role and every copy of this stops working at once.
- The password in this document is a shared read-only credential. Treat it like
  a door key — don't post it anywhere public.

---

## On the to-do list

**Tokenless access for everyone else.** Right now this route needs Claude
Desktop and a personal subscription, so it only makes sense for a couple of
people. The plan is a tokenless option so any member of staff can ask questions
in the OS itself without a subscription and without a per-question cost. Not
built yet.
