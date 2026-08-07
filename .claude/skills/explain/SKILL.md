---
name: explain
description: Turn any figure, page, tile, finding, or error into plain English a non-technical owner can act on — grounded in the brain and live data, never invented. Use when asked what a number means, why a page is empty, what a finding is telling us, or to draft help text for a page.
---

# Explain — the house voice for a non-technical reader

Rule I3 is binding: **plain English beside the professional language. Vinny
is not an engineer.** This skill exists because that rule had no tooling, and
because `page_help` and `page_explainers` are both empty.

## Before writing, ground it
1. Get the real number or the real state — query the live database, or read
   `brain/hot.md` if fresh. Never explain a figure you have not verified.
2. Find its provenance: which table/view produced it, which rate or threshold
   it used (`f_rate_for`, `f_rule`), who set that value and when.
3. Check `brain/CONTRADICTIONS.md` — if the figure sits on a disputed input,
   say so in the explanation.

## How to write it
- **The point first.** One sentence a busy owner can read while walking.
- **Then the arithmetic, in words**, the way `watchdog_findings.the_arithmetic`
  does it: "5 packages × 75.4 lb × $1,100 = $82,940."
- **Then what it means for the business** — money, risk, or time.
- **Then what to do about it**, naming who is accountable.
- **No abbreviations** (F4): "unit of measure", not "UOM". No jargon without
  its plain-English twin. Short sentences.
- **Absence is explained, never blank** (A3): "No certificate because Metrc's
  package interface carries no analyte values and the Lab Results report has
  not been imported" — never "no certificate."
- **Never invent a number to fill a gap** (A1). If it is not measured, say
  what is missing and what would make it appear.

## Empty and broken states
An empty page is a fact about the business, not a bug to apologise for. Say
which table is empty, why (not yet loaded / not yet built / nothing to
report), and what would fill it. Never fabricate a bar, a line, or a total.

## Writing page help
When drafting for `page_help` / `page_explainers`: what this page is for, what
each key number means and where it comes from, what an empty state means here,
and what action the page supports. Draft it in the brain or hand it to the
owner — **populating those tables is live user-facing config; get the owner's
go-ahead before writing rows.**
