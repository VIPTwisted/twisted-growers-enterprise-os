/** Per-object empty copy. Prefer registry notes over hardcoded JSX. */
export function emptyObjectNote({ dirty, table, entry, reg }) {
  if (dirty) {
    return {
      title: "No rows match these filters",
      body: null,
    };
  }
  const note =
    (reg && (reg.owner_note || reg.description)) ||
    (entry && entry.description) ||
    null;
  return {
    title: note ? "No platform rows on this object" : "No records on this object yet",
    body: note,
    fallbackTable: table,
  };
}
