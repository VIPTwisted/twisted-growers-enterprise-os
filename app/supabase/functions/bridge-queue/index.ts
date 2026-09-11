/* bridge-queue — the write end of the desktop bridge.
 *
 * VERSIONED 8 August 2026. This function had been running in production for two
 * days with NO SOURCE IN THIS REPOSITORY. The only copy was the deployment
 * itself: nothing to review, nothing to diff, no history of who changed what,
 * and no way to rebuild it if the project were lost. Every question the
 * assistant answers passes through it.
 *
 * Recovered verbatim from the live deployment (version 1, sha256
 * dacd9188b35f0e992b1e0b796639ef278732fb480065847218735d3e733c77e4) rather than
 * rewritten from memory, so what is committed is exactly what is running. Not
 * one character of behaviour changed in this commit; only this header was added.
 *
 * WHY THIS EXISTS.
 *
 * Chrome 151 treats a public https page reaching a local address as a user
 * permission (`local-network-access`). On the owner's machine it reads DENIED,
 * and Chrome will not re-prompt once denied. Proved in his own browser on
 * 7 Aug 2026: a no-cors fetch — which bypasses CORS entirely — still threw
 * `Failed to fetch`, and nothing arrived in the bridge's log. The request never
 * left the browser. No header, allow-list or CORS change on the bridge could
 * ever have fixed that.
 *
 * So the browser stops calling the desktop. It leaves the question in
 * ai_bridge_jobs, which a signed-in owner is already allowed to write, and the
 * bridge on the desktop comes and gets it. Nothing local is called, so no
 * browser has a vote and a Chrome update cannot break it again.
 *
 * WHY THE BRIDGE DOES NOT JUST USE THE DATABASE DIRECTLY.
 *
 * It tried. The only connection string on that machine is the one in
 * .mcp.json, and that connection is deliberately READ-ONLY —
 * "cannot execute UPDATE in a read-only transaction". That read-only guard is a
 * protection worth keeping, not working around.
 *
 * The previous version of the queue solved the same problem by writing the
 * project's ANON key into bridge/server.mjs, which is in the public repo, and
 * it only worked because anonymous access was wide open. Closing that hole
 * killed the queue.
 *
 * This needs NEITHER. The bridge already shares a token with the platform —
 * bridge/token.txt on the desktop, ai_settings.bridge_token in the database,
 * confirmed identical by sha256. That token is the credential. There is nothing
 * new to install, nothing for the owner to paste, and no key in any tracked
 * file.
 *
 * WHAT IT DELIBERATELY CANNOT DO.
 *
 * verify_jwt is false because the desktop bridge has no user login — so the
 * token is the whole gate, and the surface behind it is kept as small as it can
 * be. It can claim a pending job, write an answer onto a job it claimed, and
 * record a heartbeat. That is all. It cannot read a job's answer, cannot touch
 * any other table, cannot change status to anything outside a fixed list, and
 * cannot write an answer onto a job that is not currently running.
 *
 * Compare the sixteen deployed functions that share one static admin key with
 * no such narrowing — that pattern is on the register as a problem, and this is
 * written not to add to it.
 *
 * A NOTE FOR WHOEVER CHANGES THIS NEXT.
 *
 * `claim` returns only id, question and context. On 8 Aug 2026 the per-user
 * model choice was added to the desktop bridge and a `model` column was written
 * to ai_bridge_jobs — which this function does not return, so the desktop would
 * never have seen it. The choice rides inside `context` (jsonb, already
 * returned) instead of widening this response. If you widen the select here,
 * that workaround can be simplified; until then, do not "tidy it up" at the
 * caller without changing this first.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-tg-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

/* Constant-time compare. A plain !== leaks the token one character at a time to
 * anyone patient enough to measure the difference. */
function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return j({ ok: false, error: 'POST only' }, 405);

  try {
    const { data: cfg } = await sb.from('ai_settings').select('bridge_token, bridge_enabled').eq('id', 1).maybeSingle();
    const expected = String(cfg?.bridge_token ?? '');
    const supplied = String(req.headers.get('x-tg-token') ?? '');

    if (!expected) return j({ ok: false, error: 'No bridge token is set in Settings, so nothing can authenticate.' }, 503);
    if (!sameToken(supplied, expected)) return j({ ok: false, error: 'Bad bridge token.' }, 401);
    if (cfg?.bridge_enabled === false) return j({ ok: false, error: 'The bridge is switched off in Settings.' }, 503);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '');
    const machine = String(body.machine ?? 'unknown').slice(0, 120);

    /* ---- claim: take at most one pending job, oldest first ---------------- */
    if (action === 'claim') {
      await sb.from('ai_bridge_heartbeat').upsert(
        { machine, last_seen: new Date().toISOString(), version: String(body.version ?? '').slice(0, 40) },
        { onConflict: 'machine' },
      );

      const { data: pending, error: readErr } = await sb
        .from('ai_bridge_jobs')
        .select('id, question, context')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1);
      if (readErr) return j({ ok: false, error: readErr.message }, 500);
      if (!pending?.length) return j({ ok: true, job: null });

      /* Claim by moving pending -> running and requiring it to STILL be pending.
         Two bridges racing: one update matches, the other returns no rows and
         gets nothing, instead of both answering the same question twice. */
      const { data: claimed, error: claimErr } = await sb
        .from('ai_bridge_jobs')
        .update({ status: 'running', claimed_at: new Date().toISOString() })
        .eq('id', pending[0].id)
        .eq('status', 'pending')
        .select('id, question, context');
      if (claimErr) return j({ ok: false, error: claimErr.message }, 500);
      return j({ ok: true, job: claimed?.length ? claimed[0] : null });
    }

    /* ---- answer: write the result onto a job that is running -------------- */
    if (action === 'answer') {
      const id = body.id;
      if (!id) return j({ ok: false, error: 'No job id.' }, 400);

      const status = body.ok === true ? 'done' : 'error';
      const answer = body.ok === true ? String(body.answer ?? '').slice(0, 200000) : null;
      const error = body.ok === true ? null : String(body.answer ?? body.error ?? 'no reason given').slice(0, 4000);
      const seconds = Number.isFinite(Number(body.seconds)) ? Math.min(Number(body.seconds), 100000) : null;

      /* .eq('status','running') is the narrowing that matters: a stolen token
         cannot rewrite the answer on a job that has already been delivered. */
      const { data, error: upErr } = await sb
        .from('ai_bridge_jobs')
        .update({ status, answer, error, seconds, answered_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'running')
        .select('id');
      if (upErr) return j({ ok: false, error: upErr.message }, 500);
      if (!data?.length) return j({ ok: false, error: 'That job is not running — it was already answered, or it timed out.' }, 409);
      return j({ ok: true, id: data[0].id });
    }

    /* ---- heartbeat: alive, with no job to do ------------------------------ */
    if (action === 'heartbeat') {
      const { error } = await sb.from('ai_bridge_heartbeat').upsert(
        { machine, last_seen: new Date().toISOString(), version: String(body.version ?? '').slice(0, 40) },
        { onConflict: 'machine' },
      );
      if (error) return j({ ok: false, error: error.message }, 500);
      return j({ ok: true });
    }

    return j({ ok: false, error: 'Unknown action. Use claim, answer or heartbeat.' }, 400);
  } catch (e) {
    return j({ ok: false, error: String(e).slice(0, 300) }, 500);
  }
});
