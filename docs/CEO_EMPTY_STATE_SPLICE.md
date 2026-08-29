# Empty-state splice (Grok, 29 Aug 2026)

Live site is still deploy `6a91d702` / `bfcac0f`. This branch does not fix publish.

## Hook (verified on main App.jsx)

`ReportScreen` ~3129

```
: rows.length === 0 ? (
  <div className="empty">
    <div className="eicon">{iconByName(entry.icon)}</div>
    <b>{dirty ? "No rows match these filters" : "No records on this object yet"}</b>
    {dirty
      ? <>The query succeeded and returned nothing. Filters in force: {sentence}. Adjust them or press Clear.</>
      : <>The object <b>{table}</b> is readable and returned zero rows. Records appear here the moment they exist — no sample data will ever be shown.</>}
  </div>
)
```

## Replace the zero-row branch with

```
import { emptyObjectNote } from "./lib/emptyObjectNote.js";

const empty = emptyObjectNote({ dirty, table, entry, reg });
// inside the zero-row branch:
<b>{empty.title}</b>
{dirty
  ? <>The query succeeded and returned nothing. Filters in force: {sentence}. Adjust them or press Clear.</>
  : empty.body
    ? <div>{empty.body}</div>
    : <>The object <b>{table}</b> is readable and returned zero rows. Records appear here the moment they exist — no sample data will ever be shown.</>}
```

Do not hardcode 1,766 in App.jsx.

## Copy for the ten empty manufacturing objects (nav_registry.description or owner_note)

Floor book empty. Metrc shows 1,766 distinct production batches (1,838 packages flagged as production batches). First recorded Oct 2023, last this month.

A applies the splice. B/C do not touch App.jsx.
