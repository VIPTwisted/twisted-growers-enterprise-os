type Claim = { p_attempt: string; p_endpoint: string; p_licence: string; p_win_start: string; p_win_end: string };

export function backfillClaim(params: URLSearchParams): Claim | null {
  const id = params.get("backfillAttempt");
  if (id === null) return null;
  const endpoint = params.get("endpoints") ?? "";
  const licence = params.get("license") ?? "";
  const start = params.get("winStart") ?? "";
  const end = params.get("winEnd") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    || !/^[a-z]+$/.test(endpoint) || !licence || params.get("full") === "1"
    || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))
    || Date.parse(start) >= Date.parse(end)) {
    throw new Error("Backfill requires one attempt, endpoint, licence and increasing explicit time window");
  }
  return { p_attempt: id, p_endpoint: endpoint, p_licence: licence, p_win_start: start, p_win_end: end };
}

export async function claimBackfill(
  client: { rpc: (name: string, args: Claim) => PromiseLike<{ data: unknown; error: { message: string } | null }> },
  claim: Claim,
): Promise<number> {
  const { data, error } = await client.rpc("tg_claim_metrc_backfill_attempt", claim);
  if (error) throw new Error(error.message);
  if (typeof data !== "number" || !Number.isSafeInteger(data) || data <= 0) throw new Error("Backfill claim returned no valid reserved run");
  return Number(data);
}
