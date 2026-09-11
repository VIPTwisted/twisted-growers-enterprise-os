type Database = { from: (table: string) => any; rpc: (name: string, args: Record<string, unknown>) => any };
export type CursorCommit = {
  p_run_id: number; p_endpoint: string; p_license: string;
  p_window_start: string; p_window_end: string; p_records: number;
};

export async function readMetrcCursors(db: Database): Promise<Record<string, string>> {
  const { data, error } = await db.from("configurations").select("value").eq("key", "metrc_sync_cursors").maybeSingle();
  if (error) throw new Error(`Cannot read Metrc cursor coverage: ${error.message}`);
  if (!data) return {};
  const value = data.value;
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.values(value).some(v => typeof v !== "string" || !Number.isFinite(Date.parse(v)))) {
    throw new Error("Metrc cursor coverage contains an invalid timestamp or object");
  }
  return value;
}

function validReceipt(value: any, args: CursorCommit): boolean {
  return !!value && value.kind === "metrc_cursor_commit_v1"
    && value.run_id === args.p_run_id && value.cursor_key === `${args.p_license}:${args.p_endpoint}`
    && value.records === args.p_records
    && Date.parse(value.window_start) === Date.parse(args.p_window_start)
    && Date.parse(value.window_end) === Date.parse(args.p_window_end)
    && Date.parse(value.cursor_after) >= Date.parse(args.p_window_end)
    && Number.isFinite(Date.parse(value.committed_at))
    && ["advanced", "kept_newer"].includes(value.outcome);
}

export async function finishMetrcCursor(db: Database, args: CursorCommit): Promise<void> {
  let failure = "Invalid cursor completion response";
  try {
    const { data, error } = await db.rpc("tg_metrc_finish_cursor", args);
    if (!error && validReceipt(data, args)) return;
    failure = error?.message ?? failure;
  } catch (error) { failure = String(error); }
  // Resolve an ambiguous transport result from the exact committed run, never by
  // assuming that a later-looking configuration cursor belongs to this request.
  try {
    const { data, error } = await db.from("metrc_sync_runs").select("status,records,error,note,finished_at")
      .eq("id", args.p_run_id).maybeSingle();
    if (!error && data?.status === "ok" && data.records === args.p_records
        && data.error === null && data.finished_at && validReceipt(JSON.parse(data.note), args)) return;
  } catch { /* the original failure remains the actionable result */ }
  throw new Error(`Metrc cursor completion was not confirmed: ${failure}`);
}
