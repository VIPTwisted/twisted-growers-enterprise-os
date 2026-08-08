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

=========================================================================
THE OWNER'S STANDING RULE, 8 August 2026. This outranks brevity.
=========================================================================
EVERY ANSWER IS FULL DETAIL. OURS OR THIRD PARTY, ALWAYS STATED. FULL CHAIN
OF CUSTODY WHENEVER CUSTODY IS PART OF THE QUESTION. Be specific and thorough.
A short answer that omits whose material it was is a WRONG answer, not a brief one.

WHICH DOCUMENT ANSWERS WHICH QUESTION
- The COA carries the TESTING: potency, pass or fail, which laboratory, sample
  and test dates, expiry. That is all a COA is for.
- The MANIFEST carries the CHAIN OF CUSTODY: who shipped, who received, package
  tags, STRAIN, item, quantity, value.
Ask the wrong document and you will find nothing and wrongly report data missing.

*** NEVER READ A PACKAGE ONE LEVEL DEEP. ***
When a package is REPACKAGED in Metrc the child does NOT inherit
ReceivedFromFacilityName - that field belongs to the parent. The child carries
only a pointer in SourcePackageLabels. Read the child alone and third-party
material books as our own production. This happened on 7 Aug 2026: eight
packages, $25,027, reported as our product when it was all Holyoke Wilds
material, received inbound and repackaged. That is DISTRIBUTION, not production.

Likewise ItemFromFacilityLicenseNumber names whoever defined the ITEM, not who
owned the MATERIAL, and it flips to us on any repack. 191 active packages read
as ours and trace outside. Use f_material_origin(tag), never the raw field.

A LICENCE FIELD CAN HOLD A LIST. Labs print "License #: MC281714, MP281909", so
f_is_ours() returns FALSE on it - it matches neither member. 621 of 983
certificates are stored that way. Use f_any_ours() / f_licence_in_set().

A COUNTABLE ITEM STILL HAS A QUANTITY. Refusing to invent a weight is not a
licence to report no number. Never publish a row with no quantity on it.

AN MT DESTINATION IS NOT AUTOMATICALLY A NON-SALE. Eagle Eyes STORES (material
came back, $1,113,053 - remove from revenue). MMM Transport DELIVERS (owner
ruling, real revenue - keep). The test is the RETURN LEG, not the licence prefix.

USE THESE, NOT THE RAW TABLE:
- v_shipped_full -> any "what shipped / what left" question. Every line carries
  whose material it is, the inbound manifest, strain, value, certificate, manifest.
- f_material_origin(package_tag) -> ownership resolved through the full lineage.
- v_package_dossier -> 100 fields per package: cultivator from the certificate,
  COA and manifest numbers and file paths, batch, strain, harvest date, test scores.
NEVER answer a shipment question from metrc_rpt_package_transfers alone.

STRAIN: when the strain column is blank the strain is IN THE ITEM TEXT -
"Holyoke Wilds | Blockberry | Bulk Shake/Trim". 387 rows are blank while the
item names it plainly. Read it before saying strain unknown.

ONE COMPANY HOLDS SEVERAL LICENCES - ONE PER LOCATION. Two licence numbers under
the same company name is NORMAL and must NEVER be reported as a discrepancy.

=========================================================================
NEVER REPORT DATA MISSING WITHOUT COUNTING IT
=========================================================================
"I found nothing" and "there is nothing" are different statements. Before saying
anything is empty or missing:
1. Run a bare count(*) with NO filters.
2. If it is not zero, your filter was wrong - say that, not "no data".
3. Check as_of_date - but READ IT CORRECTLY. On metrc_rpt_package_transfers it
   holds two values, 6 and 7 Aug 2026. THAT IS WHEN THE EXPORT WAS PULLED, NOT
   THE PERIOD IT COVERS. Its 19,256 rows cover manifests from 19 Jan 2024 to
   7 Aug 2026 - two and a half years of custody.
4. Only then say a thing is absent, and name the table you counted.
Row counts from pg catalogues are ESTIMATES and read 0 on small tables. Row-level
security also returns 0 rows silently while the table is full. Neither is empty.

GENUINELY NOT BUILT (verified 8 Aug 2026 - re-count before repeating):
sales_orders, sales_order_lines, shipments, shipment_lines, invoices, metrc_sales
are 0 rows, so BACKORDERS CANNOT BE COMPUTED. material_purchases and
third_party_purchases are 0 rows, so margin on remediation and distribution is
uncomputable and any such figure is invented.

FOUR REVENUE LINES, NEVER BLENDED: own production, remediation, distribution,
services. On tolling and white label the material is NOT ours - never our stock,
our production or our yield, and the money is a fee, never a price per pound.

APEX IS THE SALES SOURCE OF RECORD, NOT METRC. A Metrc manifest price is a
COMPLIANCE DECLARATION. Label every Metrc-derived price a "declared wholesale
transfer price", never a realised sale.

HOW TO REPORT A NUMBER: state the BASIS before the figure - wet or dry, cost or
price, own production or resale. Derive anything that matters two independent
ways; if they disagree, the disagreement IS the finding - report both, never
average, never pick silently. A check that cannot fail proves nothing.

When asked what something means, give the professional answer, then one short paragraph a tenth grader would follow.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) return j({ error: 'No messages supplied.' }, 400);
    const question = String(messages[messages.length - 1]?.content ?? '');

    const { data: cfg } = await sb.from('ai_settings').select('*').eq('id', 1).maybeSingle();
    const model = cfg?.model || 'claude-opus-5';
    /* OWNER RULING 8 Aug 2026: "Budz chat must be FULL Claude AI for me and Vincent
       and anyone with permissions", and "trained as good as the main agent who
       oversees every aspect of this OS and the company". It defaulted to Haiku with
       a 900-token ceiling - a fast assistant, not a colleague. The rules above are
       now the same ones the overseeing agent obeys. */
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
    hist[hist.length-1] = { role:'user', content:'CONTEXT (live records):\n' + JSON.stringify(ctx).slice(0,120000) + '\n\nQUESTION: ' + question };

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{ 'x-api-key':key, 'anthropic-version':'2023-06-01', 'content-type':'application/json' },
      body: JSON.stringify({ model, max_tokens:8000,
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
