// TG Enterprise OS — alert-email
//
// The last link in the missed-sync alert chain. Everything before it already
// existed: v_feed_health detects, tg_raise_feed_alerts queues into alert_outbox,
// tg_send_alert_emails hands each row to this function through pg_net, and
// tg_confirm_alert_emails marks a row sent only once a 2xx comes back.
//
// Built 12 August 2026 on the owner's order: "I NEED TO GET AN ALERT EVERY TIME A
// SYNC IS MISSED." The Metrc lab-results feed had been dark for six days at that
// point and 239 in-app alerts had been raised and never read, because there was no
// delivery channel at all.
//
// ─────────────────────────────────────────────────────────────────────────────
// CREDENTIALS. There is no key in this file and there must never be one.
//
//   ALERT_EMAIL_API_KEY  — read at runtime from app_secrets, which the owner sets in
//                          the OS at Settings > Keys & Connections. Owner ruling,
//                          17 Aug 2026: keys are entered in the platform, not in the
//                          Supabase dashboard. Never in the repository, never in a
//                          migration, never in a log line, never in a comment, and not
//                          as a placeholder that looks real enough to copy.
//                          Deno.env is kept only as a last-resort fallback.
//
// If it is unset this function returns 503 and sends nothing. It does NOT fall back,
// does not retry, and does not report success. An unconfigured channel that claims
// to have delivered is worse than no channel: the platform would then be lying about
// the one thing it exists to be honest about.
// ─────────────────────────────────────────────────────────────────────────────
//
// WHAT GETS LOGGED. The recipient address, the subject and the provider's status
// code. Never the API key, never the Authorization header, never the message body —
// an alert body carries package tags and quantities.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/* Constant time. A plain !== leaks the key one character at a time to anyone
   patient enough to measure the difference. Same helper as apex-probe. */
function sameKey(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type Payload = {
  to?: string;
  name?: string;
  subject?: string;
  body?: string;
  severity?: string;
};

/* The plain-text alert is the record. HTML is a courtesy on top of it, never a
   replacement — a mail client that strips HTML must still show what stopped, when
   it last worked and what to do. */
function asHtml(subject: string, body: string, severity: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const bar =
    severity === "critical" ? "#ff4245" : severity === "elevated" ? "#f0a020" : "#2df26a";
  return [
    '<div style="font-family:Figtree,Helvetica,Arial,sans-serif;max-width:640px">',
    `<div style="border-left:4px solid ${bar};padding:0 0 0 14px">`,
    `<h2 style="margin:0 0 4px;font-size:17px">${esc(subject)}</h2>`,
    `<div style="font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:${bar}">`,
    `${esc(severity)}</div></div>`,
    `<pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.5">`,
    esc(body),
    "</pre>",
    '<hr style="border:none;border-top:1px solid #e5e5e5">',
    '<div style="font-size:12px;color:#777">',
    "Twisted Growers Enterprise OS. This alert closes itself when the feed recovers, ",
    "and the same alert is also recorded inside the platform.",
    "</div></div>",
  ].join("");
}

async function sendViaResend(
  key: string, from: string, to: string, subject: string, text: string, html: string,
): Promise<{ ok: boolean; status: number; detail: string }> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });
  return { ok: r.ok, status: r.status, detail: (await r.text()).slice(0, 300) };
}

async function sendViaSendgrid(
  key: string, from: string, to: string, subject: string, text: string, html: string,
): Promise<{ ok: boolean; status: number; detail: string }> {
  const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html },
      ],
    }),
  });
  return { ok: r.ok, status: r.status, detail: (await r.text()).slice(0, 300) };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  /* FAIL CLOSED on the admin key. An unset key must refuse everything, never admit
     everything — an empty string compared against an absent header would otherwise
     open the door. tg_call_function sends this header on every scheduled call. */
  const { data: secretRows } = await service
    .from("integration_secrets").select("name, value").eq("name", "TG_ADMIN_KEY");
  const expected = (secretRows?.[0]?.value ?? "").trim();
  if (!expected) return json({ ok: false, error: "admin key not configured" }, 503);
  if (!sameKey(req.headers.get("x-admin-key") ?? "", expected)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  let p: Payload;
  try { p = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }

  const to = (p.to ?? "").trim();
  const subject = (p.subject ?? "").trim();
  const text = (p.body ?? "").trim();
  const severity = (p.severity ?? "elevated").trim();
  if (!to || !subject || !text) {
    return json({ ok: false, error: "to, subject and body are all required" }, 400);
  }

  /* The provider and the from-address are CONFIGURATION and live in the database
     where they can be changed without a deploy. Only the key is a secret, and only
     the key comes from the environment. That split is the whole point: the
     destination is version-controlled and auditable, the credential is not. */
  const { data: cfgRow } = await service
    .from("configurations").select("value").eq("key", "alert_email").maybeSingle();
  const cfg = (cfgRow?.value ?? {}) as Record<string, unknown>;
  const provider = String(cfg.provider ?? "").trim().toLowerCase();
  const from = String(cfg.from_address ?? "").trim();

  /* The key lives in app_secrets, written by Settings > Keys & Connections through
     tg_set_secret. Owner instruction 17 Aug 2026: keys are entered in the OS, not in
     the Supabase dashboard, and that screen is the place.

     NOTE FOR WHOEVER READS THIS NEXT: this platform currently has TWO credential
     vaults. app_secrets holds ALERT_EMAIL_API_KEY and ANTHROPIC_API_KEY and has the
     screen, the audit trail and the owner/executive check inside the database.
     integration_secrets holds METRC_*, APEX_API_KEY, CLICKUP_TOKEN and TG_ADMIN_KEY
     and is read by about a dozen edge functions. That is two definitions of one
     primitive and it is a real defect — it is why the first version of this change
     read the wrong table and would have reported "key not set" while the owner was
     looking at a screen saying "Set". Consolidating them is tracked separately; until
     then, each key is read from the vault it is actually in, and this comment exists
     so nobody has to rediscover which is which.

     The environment is kept as a last resort so an already-configured deployment does
     not break the moment this ships. The vault wins where both exist. */
  const { data: appSecretRow } = await service
    .from("app_secrets").select("value").eq("key", "ALERT_EMAIL_API_KEY").maybeSingle();
  const apiKey = String(appSecretRow?.value ?? "").trim()
    || (Deno.env.get("ALERT_EMAIL_API_KEY") ?? "").trim();

  /* Each refusal below names exactly what is missing and who fixes it. "Send
     failed" would put us back where we started: a channel that is quiet for a
     reason nobody can read. These strings land in alert_outbox.send_error via
     tg_confirm_alert_emails, so they are what a person will actually see. */
  if (!apiKey) {
    return json({
      ok: false,
      error:
        "ALERT_EMAIL_API_KEY is not set. Nothing was sent. Set it in the OS at " +
        "Settings > Keys & Connections, which stores it in app_secrets. Until then " +
        "alerts continue to queue in the platform and are not lost.",
    }, 503);
  }
  if (!from) {
    return json({
      ok: false,
      error:
        "No from_address is set on configurations.alert_email. Most providers refuse a " +
        "send with no verified sender, so nothing was attempted.",
    }, 503);
  }
  if (provider !== "resend" && provider !== "sendgrid") {
    return json({
      ok: false,
      error:
        `Unknown email provider ${provider || "(unset)"}. Supported: resend, sendgrid. ` +
        "Set it on configurations.alert_email. Nothing was sent.",
    }, 503);
  }

  const html = asHtml(subject, text, severity);
  let result: { ok: boolean; status: number; detail: string };
  try {
    result = provider === "resend"
      ? await sendViaResend(apiKey, from, to, subject, text, html)
      : await sendViaSendgrid(apiKey, from, to, subject, text, html);
  } catch (e) {
    /* A thrown fetch is a non-answer, and a non-answer must not read as delivered.
       502 keeps sent_at null and puts the reason in send_error. */
    return json({ ok: false, error: `provider unreachable: ${String(e).slice(0, 200)}` }, 502);
  }

  /* Address and status only. Never the key, never the body. */
  console.log(JSON.stringify({
    fn: "alert-email", to, subject: subject.slice(0, 120),
    provider, status: result.status, ok: result.ok,
  }));

  if (!result.ok) {
    /* PASS THE PROVIDER'S OWN STATUS BACK. tg_confirm_alert_emails treats anything
       outside 200-299 as undelivered and records the reason, so a bounce stays
       visibly undelivered instead of quietly gone. */
    return json({ ok: false, provider, status: result.status, error: result.detail },
      result.status >= 400 && result.status < 600 ? result.status : 502);
  }

  return json({ ok: true, provider, status: result.status });
});
