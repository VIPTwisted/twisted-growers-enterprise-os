// Source-to-storage evidence for the exact API interval. This is not a full
// source-population certificate or proof that the vendor returned every record.
type Registry = {
  entity: string; endpoint: string; api_version: string;
  supports_delta: boolean; supports_paging: boolean;
  nesting: Record<string, string> | null;
};
type Receipt = {
  run_id: string; entity: string; state: string; request_from: string | null;
  policy: Registry; records_seen: number; records_written: number; page_count: number;
  ok?: boolean; error?: string; has_more?: boolean;
};
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
type Dependencies = {
  db: RpcClient;
  get: (path: string, params: Record<string, string>) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
  pageSize: number; maxPages: number; pauseMs: number; maxRateRetries: number;
};

export async function pullVerifiedEntity(d: Dependencies, entity: string, runId: string, seed: string): Promise<string> {
  const rpc = async (name: string, args: Record<string, unknown>): Promise<Receipt> => {
    const { data, error } = await d.db.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`${name}: missing verification receipt`);
    return data as Receipt;
  };
  let begun = false;
  let httpStatus: number | null = null;
  const finish = (complete: boolean, error: string | null) => rpc("tg_apex_verification_finish", {
    p_run: runId, p_entity: entity, p_complete: complete, p_error: error, p_http_status: httpStatus,
  });
  try {
    const run = await rpc("tg_apex_verification_begin", { p_run: runId, p_entity: entity, p_seed: seed, p_page_size: d.pageSize });
    if (run.run_id !== runId || run.entity !== entity || run.state !== "running" || !run.policy) throw new Error("Mismatched run reservation");
    begun = true;
    const e = run.policy;
    let rateRetries = 0;
    for (let page = 1; page <= d.maxPages;) {
      const params: Record<string, string> = { ...(e.nesting ?? {}) };
      if (e.supports_paging) { params.per_page = String(d.pageSize); params.page = String(page); }
      if (e.supports_delta) {
        if (!run.request_from) throw new Error("No recorded source interval");
        params.updated_at_from = run.request_from;
      }
      const response = await d.get(`/${e.api_version}${e.endpoint}`, params);
      httpStatus = response.status;
      const body = await response.text();
      if (response.status === 429) {
        const rateLimited = /rate limit/i.test(body) || response.headers.has("retry-after");
        const header = response.headers.get("retry-after");
        const seconds = header == null ? 0 : Number(header);
        const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header ?? "") - Date.now();
        // A long or malformed Retry-After ends the run; it never causes an early retry.
        if (rateLimited && rateRetries < d.maxRateRetries && Number.isFinite(delay) && delay <= 60_000) {
          rateRetries++;
          await d.sleep(Math.max(delay, d.pauseMs * 4));
          continue;
        }
        throw new Error(rateLimited ? "THROTTLED: Apex rate limit; cursor held" : "STOPPED: Apex credit allowance or spending cap; cursor held");
      }
      if (!response.ok) throw new Error(response.status === 403
        ? "HTTP 403: source access was refused; this is not proof of an empty entity"
        : `HTTP ${response.status}: source request failed`);
      // Keep the original JSON text. PostgreSQL extracts the records so JavaScript
      // cannot round large IDs or decimal values before the evidence is stored.
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
      const sha = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, "0")).join("");
      const receipt = await rpc("tg_apex_verification_page", {
        p_run: runId, p_entity: entity, p_page: page, p_params: params, p_body: body, p_sha256: sha,
      });
      if (typeof receipt.has_more !== "boolean") throw new Error("Page did not return an explicit completeness verdict");
      if (!receipt.has_more) {
        const done = await finish(true, null);
        if (done.run_id !== runId || done.entity !== entity) throw new Error("Mismatched completion receipt");
        if (!done.ok || done.state !== "api_verified") return `INCOMPLETE — ${done.error ?? "verification failed"}; cursor held`;
        return `${done.records_written} new of ${done.records_seen} returned; API-to-storage verified over ${done.page_count} page(s)`;
      }
      if (page === d.maxPages) throw new Error(`INCOMPLETE: reached ${d.maxPages}-page ceiling before the source ended`);
      page++;
      await d.sleep(d.pauseMs);
    }
    throw new Error("Source pull did not complete");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (begun) {
      try {
        const result = await finish(false, detail.slice(0, 1000));
        // A lost HTTP reply can follow an already committed successful finish.
        // The durable, immutable result decides whether the run actually succeeded.
        if (result.ok && result.state === "api_verified" && result.run_id === runId && result.entity === entity) {
          return `${result.records_written} new of ${result.records_seen} returned; API-to-storage verified over ${result.page_count} page(s)`;
        }
      } catch (loggingError) {
        return `ERROR — ${detail.slice(0, 180)}; completion could not be confirmed: ${String(loggingError).slice(0, 180)}`;
      }
    }
    return `ERROR — ${detail.slice(0, 300)}`;
  }
}
