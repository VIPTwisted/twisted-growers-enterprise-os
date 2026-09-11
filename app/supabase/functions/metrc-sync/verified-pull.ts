type Database = { rpc: (name: string, args: Record<string, unknown>) => any };
type Feed = { key: string; paths: Array<{ path: string; state: string }> };
type Window = { start: string; end: string };
type Dependencies = {
  db: Database; get: (url: string) => Promise<Response>;
  outOfTime: () => boolean; sleep: (ms: number) => Promise<unknown>;
};

async function checksum(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function verifiedMetrcPull(deps: Dependencies, args: {
  base: string; runId: number; license: string; spec: Feed; window: Window;
  advanceCursor: boolean; pageSize: number; maxPages: number; pauseMs: number;
}): Promise<{ summary: string; ranOut: boolean; complete: boolean }> {
  const call = async (name: string, params: Record<string, unknown>) => {
    const { data, error } = await deps.db.rpc(name, params);
    if (error) throw new Error(`${name}: ${error.message}`);
    if (!data || typeof data !== "object") throw new Error(`${name}: missing receipt`);
    return data;
  };
  let began = false; let ranOut = false; let seen = 0;
  try {
    await call("tg_metrc_begin_verification", {
      p_run_id: args.runId, p_endpoint: args.spec.key, p_license: args.license,
      p_window_start: args.window.start, p_window_end: args.window.end,
      p_page_size: args.pageSize, p_advance_cursor: args.advanceCursor,
    });
    began = true;
    for (const path of args.spec.paths) {
      let terminal = false;
      for (let page = 1; page <= args.maxPages; page++) {
        if (deps.outOfTime()) { ranOut = true; throw new Error("Soft deadline reached; staged pages not promoted"); }
        const params = {
          licenseNumber: args.license, pageNumber: page, pageSize: args.pageSize,
          lastModifiedStart: args.window.start, lastModifiedEnd: args.window.end,
        };
        const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
        const response = await deps.get(`${args.base}${path.path}?${query}`);
        const text = await response.text();
        if (!response.ok) throw new Error(`${path.path}: HTTP ${response.status}: ${text.slice(0, 160)}`);
        // PostgreSQL parses the original text: large numeric IDs and decimal
        // source values never pass through JavaScript's floating-point parser.
        const receipt = await call("tg_metrc_stage_page", {
          p_run_id: args.runId, p_state: path.state, p_page: page, p_path: path.path,
          p_params: params, p_response: text, p_sha256: await checksum(text),
        });
        if (!Number.isInteger(receipt.records) || receipt.records < 0 || receipt.records > args.pageSize
            || typeof receipt.terminal !== "boolean") throw new Error("Invalid Metrc page receipt");
        seen += receipt.records;
        if (receipt.terminal) { terminal = true; break; }
        await deps.sleep(args.pauseMs);
      }
      if (!terminal) throw new Error(`Page limit reached for ${path.state}; staged pages not promoted`);
      await deps.sleep(args.pauseMs);
    }
    if (deps.outOfTime()) { ranOut = true; throw new Error("Soft deadline reached before source verification commit"); }
    const finish = () => call("tg_metrc_finish_verification", { p_run_id: args.runId, p_complete: true, p_error: null });
    let result;
    try { result = await finish(); } catch { result = await finish(); } // Exact-run, idempotent lost-ack recovery.
    if (result.kind !== "metrc_record_commit_v1" || result.run_id !== args.runId || result.state !== "api_verified"
        || result.records !== seen || result.endpoint !== args.spec.key || result.license !== args.license
        || Date.parse(result.window_start) !== Date.parse(args.window.start) || Date.parse(result.window_end) !== Date.parse(args.window.end)
        || !/^[a-f0-9]{64}$/.test(result.manifest_sha256)) throw new Error("Metrc source verification completion was not confirmed");
    return { summary: `${seen} delivered records verified against source and stored fields`, ranOut: false, complete: true };
  } catch (error) {
    // This cannot demote a committed verification. A worker killed outright is
    // recovered through its bounded database lease on the next attempt.
    if (began) {
      try { await call("tg_metrc_finish_verification", { p_run_id: args.runId, p_complete: false, p_error: String(error).slice(0, 480) }); }
      catch { /* Preserve the original actionable error and durable staged pages. */ }
    }
    if (ranOut) return { summary: "Incomplete: source pages retained, zero rows promoted; cursor held", ranOut: true, complete: false };
    throw error;
  }
}
