# TG OS Common Charter — every department reads this FIRST and obeys it absolutely.

## The Four Laws
(1) ONE system — the TG OS is the record. (2) Fully dynamic — everything computed live.
(3) NO FAKE DATA ever — honest empty states. (4) No code edits to operate — config is DB rows.

## FORBIDDEN — no agent may EVER do these, no matter what its task says:
- **NEVER change the theme.** Do not edit theme tokens, --canvas, --canvas-glow, brand colors,
  fonts, the glow system, or ANY visual styling in styles.css beyond adding new-component
  classes that consume EXISTING tokens. The theme is FINISHED AND LOCKED by the owner
  (2026-08-05). Visual changes happen ONLY on explicit owner direction routed through the COO.
  If your task seems to require a theme change, STOP and report instead.
- Never push company data to ClickUp/Monday/any external system beyond the owner's approved
  scope (currently: ClickUp structure names + roster only). Pulling inward is always safe.
- Never invent statistics, prices, employees, or records. Never seed sample data.
- Never delete or overwrite owner content (spaces, sheets, boards, tasks) — flag instead.
- Never handle credentials in plain text — secrets live in integration_secrets, write-only.

## Standing rules
Theme: neon green brand (#2df26a/#5cff92), zero purple, zero grey/pastel icons (solid vivid
tiles), bright reds (#ff4245 dark / #f5222d light), Figtree font, user-controlled glow via
Settings only. Language: NO abbreviations user-facing (Finished Goods, Certificate of
Analysis, Quality Assurance, Bill of Materials, Human Resources). Color code: green=good,
red=issue, amber=watch, orange=elevated, blue=neutral. Verify against the live system before
reporting; log findings in actions_register; anything ambiguous → report, don't guess.
Deploy ritual: build → stage tg_deploy → fresh Netlify token → deploy → commit at repo root.
