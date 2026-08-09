# Metrc API Access — Verified Findings & Action Path (2026-08-05)

*Four-agent research pass over Metrc's official MA documentation (api-ma.metrc.com, verified
live Aug 2026), integrator knowledge bases, and CCC bulletins. This supersedes earlier
guidance in two places, marked ⚠️ CORRECTION.*

## The authentication model (from Metrc's own MA docs)

HTTP Basic on every request: **username = software (integrator) API key · password = user API
key**, joined `software:user`, base64-encoded. Both keys are mandatory on every call; no
endpoint accepts a user key alone; no auth change 2024–2026 (no OAuth, no single-key mode).
Our worker implements exactly this and additionally self-tests 10 arrangements.

## Why the owner's screens said "one key"

- The licensee UI exposes exactly ONE key per employee: the **User API Key** (profile → API
  Keys → "Programmatic Access"). One per user per state, valid across all that user's
  facilities.
- **The QR code on that page encodes the user API key itself** — it's a scan-to-copy
  convenience, not a second credential. (Matches our decode result exactly.)
- Third-party platforms (Apex, POS, shipping tools) ask only for the user key because **their
  own integrator key is attached server-side** — the documented source of the "one key works
  everywhere" experience.
- The software/vendor key appears in NO licensee screen, ever; it lives in the integrator's
  Metrc Connect portal.

## The 401 elimination table (our evidence vs. the documented cause catalog)

| Documented cause | Our case |
|---|---|
| State mismatch (keys are per-state) | ✗ MA licenses on api-ma (verified vs control state) |
| Sandbox/production mix | ✗ key works on production platforms today |
| User key regenerated/expired/locked | ✗ freshly generated + proven on 3 platforms |
| Employee permissions | ✗ same key drives full platforms |
| Facility not associated | ✗ would fail after auth, not at it |
| Header/encoding errors | ✗ 10 arrangements tested; server's `www-authenticate: Basic` honored |
| **Missing/invalid software key** | **✓ the only cause left standing** |

The 401 body is ASP.NET's generic rejection — it never names which credential failed; the
elimination above is what names it.

## ⚠️ CORRECTION 1 — the right acquisition channel

Not support.metrc.com (that's licensee operational support). The real doors:
- **Metrc Connect**: metrc.com → Connect → **"Get Started" / Integration Request form** —
  once onboarded, integrator keys are **self-generated per state in the Connect portal**
- **api-info@metrc.com** — Metrc's API access email channel

## ⚠️ CORRECTION 2 — there is no "licensee own-use" class

TG's in-house OS onboards as a standard integrator: Integration Request → Metrc Connect API
Terms of Use + Order Form (DocuSign) → validation → **sandbox** (sandbox-api-ma.metrc.com;
test vendor key after Metrc training + signed API Use Agreement — MA historically also
requires the CCC's officer-signed API Use Agreement and a sandbox **Capability Assessment**)
→ **production vendor key**. Fees: a **free Standard tier exists**. Timeline: state access
≈ 1 business day on an existing Connect account; full new-integrator onboarding runs days to
a few weeks.

## Request template (updated recipients)

> **CORRECTED 9 Aug 2026.** This template previously read "MC157557 cultivation". **MC157557
> is not a licence.** 157557 is the owner's Metrc **user ID**, which belongs to the user key
> and is never associated with a facility. The cultivation licence is **MC281714**.
>
> The owner settled this on 7 Aug 2026 with a screenshot of the Metrc facility switcher as
> evidence, and it was recorded as contradiction §4 in `brain/CONTRADICTIONS.md` with the
> note "that document must be corrected before the API application is submitted — a user ID
> in a licence field would stall onboarding." It was still wrong two days later, which is the
> meta-trap in `_charter_common.md`: **a decision recorded is not a decision implemented.**
>
> The two licences, from `company_licenses` and `CLAUDE.md`:
> **MC281714 = cultivation** (tag series `1A40A030000E5B1`) ·
> **MP281909 = manufacturing** (tag series `1A40A030000E5B2`)

To **api-info@metrc.com** (and/or the Metrc Connect Integration Request form):

> Subject: API integration request — Massachusetts licensee, in-house software
>
> We are a Massachusetts licensee (MC281714 cultivation, MP281909 product manufacturing)
> building in-house operations software and request onboarding for Metrc Connect API access
> for Massachusetts, including sandbox access and issuance of a software API key. User API
> keys are already generated. Please send the Integration Request/agreement documents and
> any Capability Assessment requirements. Contact: [email].

## Key hygiene (operational rules, from the cause catalog)

1. **Regenerating a user key silently kills the old one everywhere** — regenerate rarely; on
   regeneration, update the OS vault and every platform the same day.
2. Repeated failed metrc.com login attempts can invalidate the user's API key.
3. User keys expire (~1 year default, state-configurable) — the OS should alert before expiry
   (folds into the freshness-SLA principle).
4. The pipeline discriminator when things fail: `GET /facilities` — 200 means the key pair is
   good and the issue is facility/permissions; 401 means credentials/state/environment.

## OS follow-ups queued

- Sandbox mode toggle (sandbox-api-ma.metrc.com) so the integration can be exercised with the
  test vendor key during onboarding.
- Worker probe upgrade: use /facilities as the discriminator and surface its verdict.
- Vault alert for user-key age (expiry warning).
