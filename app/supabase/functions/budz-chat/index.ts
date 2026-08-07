import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function slimContext(question: string) {
  const q = question.toLowerCase();
  const want = (...k: string[]) => k.some((x) => q.includes(x));
  const out: Record<string, unknown> = {};
  const [{ data: goals }, { data: rooms }, { data: months }] = await Promise.all([
    sb.from('v_goal_status').select('metric_label,actual,target,target_max,status').limit(10),
    sb.from('v_dry_room_performance')
      .select('drying_room,harvests,plants,wet_lb,packaged_lb,sitting_unfinished_lb,avg_dry_days,dried_too_long,dried_too_fast,still_open,conversion_pct')
      .limit(10),
    sb.from('v_monthly_conversion_truth')
      .select('month,harvests_cut,harvests_closed,still_open,plants,wet_lb,packaged_lb,conversion_pct_closed_only,avg_dry_days')
      .limit(8),
  ]);
  out.goals = goals; out.drying_rooms = rooms; out.recent_months = months;

  if (want('harvest','dry','yield','conversion','strain','room','open','late','plant')) {
    const { data } = await sb.from('v_harvest_forensic')
      .select('harvest_name,strain,drying_room,harvest_started,plants,wet_lb,packaged_lb,still_in_room_lb,dry_days_to_first_package,total_days_start_to_now,conversion_pct,harvest_state,severity,what_is_wrong')
      .neq('severity','OK').order('total_days_start_to_now',{ascending:false}).limit(45);
    out.problem_harvests = data;
  }
  if (want('test','coa','lab','fail','compliance','inspection','hold')) {
    const { data } = await sb.from('v_custody_alerts').select('*').limit(30); out.compliance_flags = data;
  }
  if (want('inventory','stock','sitting','aging','on hand','finished good','ship','where')) {
    const { data } = await sb.from('v_inventory_aging').select('*').limit(30); out.aging_inventory = data;
  }
  if (want('manifest','transfer','transit','ship','deliver','customer')) {
    const { data } = await sb.from('v_metrc_transfer_ledger').select('*').limit(25); out.transfers = data;
  }
  if (want('money','cost','loss','dollar','profit','margin','pound')) {
    const { data } = await sb.from('v_real_loss_summary').select('*').limit(15); out.loss_summary = data;
  }
  if (want('allocat','approv')) {
    const { data } = await sb.from('v_awaiting_allocation').select('*').limit(25); out.awaiting_allocation = data;
  }
  if (want('schedule','late','deadline','due','weekend','behind')) {
    const { data } = await sb.from('v_late_violations').select('*').limit(25); out.schedule_violations = data;
  }
  return out;
}

const SYSTEM = `You are the artificial intelligence assistant inside the Twisted Growers Enterprise OS.
Twisted Growers is a Massachusetts cannabis company: cultivation licence MC281714, manufacturing licence MP281909.
You are talking to the owner or a senior manager while they work.

HOW YOU ANSWER
- Answer ONLY from the CONTEXT supplied. It is the real Metrc record.
- If the context does not contain the answer, say so plainly and name the report that would need to hold it. Never guess, never invent a number or an industry statistic.
- Read the conversation history and answer follow-ups properly.
- Be brief and specific. Name harvests, rooms, strains, dates, numbers. No preamble.
- If challenged on a number, explain how it is calculated and say honestly whether it holds up.

FACTS YOU MUST NOT GET WRONG
- Fresh cannabis is ~75-80 percent water, so a 4:1 to 5:1 wet:dry ratio is standard. Wet-to-packaged of 20-25 percent is NORMAL, not underperformance. Above ~30 percent almost always means wet weight was recorded too low at takedown.
- Grams per plant is NOT a valid benchmark; it is set by plant density and veg time. The real benchmark is grams per square foot of canopy: ~35 start-up, 50-70 established, at 0.65-1.0 plants per sq ft.
- A harvest with no finished date has not finished packaging. Never include it in a conversion calculation.
- The room recorded on a harvest is the DRYING location, not the grow room.
- Standard dry window is 10-14 days from cut to first package.

OWNER RULES: harvests may finish early, never late. Every material needs an approved allocation before it moves.

When asked what something means, give the professional answer, then one short paragraph a tenth grader would follow.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) return j({ error: 'No messages supplied.' }, 400);
    const question = String(messages[messages.length - 1]?.content ?? '');

    const { data: cfg } = await sb.from('ai_settings').select('*').eq('id', 1).maybeSingle();
    const model = cfg?.model || 'claude-haiku-4-5-20251001';
    const inRate = Number(cfg?.input_usd_per_mtok ?? 1);
    const outRate = Number(cfg?.output_usd_per_mtok ?? 5);

    /* THE DEFECT THIS REPLACES.
       This used to be `sb.rpc('tg_ai_budget_ok')`. `sb` is a SERVICE-ROLE client and
       carries no user identity, so auth.uid() inside that function was always null,
       its owner-or-executive test could never pass, and it returned false for
       EVERYBODY at every spend under every cap. The one false was then printed as
       "the monthly budget cap has been reached" — with $0.00 spent of $100, and one
       row in ai_usage_log in the platform's whole life.

       Three unrelated causes collapsed into one sentence naming the only cause that
       was not true, which sent the owner to Settings to raise a cap that was never
       the problem.

       verify_jwt is true on this function, so the gateway has already checked the
       caller's token before we get here — the identity is in the header, it was just
       being thrown away. Bind a client to it and ask as the caller. tg_ai_gate()
       returns WHICH of six reasons stopped it, and its own words are what the person
       reads. */
    const authHeader = req.headers.get('Authorization') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';
    const asCaller = anonKey
      ? createClient(Deno.env.get('SUPABASE_URL')!, anonKey, {
          global: { headers: { Authorization: authHeader } },
        })
      : null;

    if (!asCaller) {
      await sb.from('ai_usage_log').insert({ feature:'budz-chat', answered_by:'no-anon-key', cost_usd:0 });
      return j({ ok:false, reply:'I cannot check who is asking, because this function has no key to look you up with. That is a setup problem on the server, not a spending limit. Every report and suggestion button still works.' });
    }

    const { data: gate, error: gateErr } = await asCaller.rpc('tg_ai_gate');
    if (gateErr) {
      await sb.from('ai_usage_log').insert({ feature:'budz-chat', answered_by:'gate-error', error: String(gateErr.message).slice(0,200), cost_usd:0 });
      return j({ ok:false, reply:'I could not check whether I am allowed to answer: ' + String(gateErr.message).slice(0,200) });
    }
    if (gate?.allowed !== true) {
      await sb.from('ai_usage_log').insert({ feature:'budz-chat', answered_by:'blocked', error: gate?.reason ?? 'unknown', cost_usd:0 });
      return j({ ok:false, blocked:true, reason: gate?.reason ?? 'unknown',
                 capped: gate?.reason === 'cap_reached',
                 reply: gate?.message ?? 'I stopped before spending anything, but I could not work out why. Tell Vinny the assistant gate returned no reason.' });
    }

    // Key comes from the in-app vault first, environment second.
    const { data: vaultKey } = await sb.rpc('tg_read_secret', { p_key: 'ANTHROPIC_API_KEY' });
    const key = (vaultKey && String(vaultKey).trim()) || Deno.env.get('ANTHROPIC_API_KEY');

    if (!key) {
      await sb.from('ai_usage_log').insert({ feature:'budz-chat', answered_by:'no-key', cost_usd:0 });
      return j({ ok:false, needs_key:true, reply:'No artificial intelligence key has been set yet, so I cannot hold a free-form conversation. An owner can paste one under Settings, Keys and Connections. The suggestion buttons below work right now and cost nothing.' });
    }

    const ctx = await slimContext(question);
    const hist = messages.slice(-8);
    hist[hist.length-1] = { role:'user', content:'CONTEXT (live records):\n' + JSON.stringify(ctx).slice(0,24000) + '\n\nQUESTION: ' + question };

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{ 'x-api-key':key, 'anthropic-version':'2023-06-01', 'content-type':'application/json' },
      body: JSON.stringify({ model, max_tokens:900,
        system:[{ type:'text', text:SYSTEM, cache_control:{ type:'ephemeral' } }], messages: hist }),
    });
    if (!r.ok) { const t = await r.text(); return j({ ok:false, reply:'The model call failed: ' + t.slice(0,300) }); }
    const out = await r.json();
    const reply = (out.content ?? []).filter((c:any)=>c.type==='text').map((c:any)=>c.text).join('\n');

    const it = out.usage?.input_tokens ?? 0;
    const ot = out.usage?.output_tokens ?? 0;
    const cost = (it/1_000_000)*inRate + (ot/1_000_000)*outRate;
    await sb.from('ai_usage_log').insert({ feature:'budz-chat', model, answered_by:'model',
      input_tokens: it, output_tokens: ot,
      cached_tokens: out.usage?.cache_read_input_tokens ?? 0, cost_usd: Number(cost.toFixed(6)) });

    return j({ ok:true, reply, model, cost_usd:Number(cost.toFixed(5)), input_tokens:it, output_tokens:ot });
  } catch (e) {
    return j({ ok:false, reply:'Hit an error: ' + String(e) }, 200);
  }
});
