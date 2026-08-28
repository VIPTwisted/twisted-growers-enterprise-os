# TG OS — nav preservation

Rule: omit nothing. Re-parent only. Count out >= count in.

## Source of truth (C-NAV 28 Aug)
`nav_registry` is the omit-nothing set — not the HTML scrape.

| | HTML scrape (Grok) | nav_registry |
|---|---|---|
| Categories | 10 | **12** (adds Human Resources, Reports) |
| Sections in the 10 | 59 claimed | 58 |
| Labels in the 10 | 374 | **543** |
| Rows total / enabled | — | **672 / 660** |

The extra **169 labels** and **HR + Reports** stay. Do not disable them to match 374.
Top bar Tax items stay even if they live under Finance/Settings in the registry.

HTML scrape list remains a lower bound only. Label-level missing-from-HTML is expected. Missing-from-registry against a live menu item is a defect.

## 12 categories (none omitted)
Command Center · Infused Pre-Rolls & Flower · Manufacturing · Inventory · Cultivation · Quality · Finance · Metrc · Workspace · Settings · **Human Resources** · **Reports**

## Homes
Same as docs/TG_OS_CEO_CONTRACT.md. HR home = existing HR dashboard. Reports home = report catalogue.
