# Agent work orders

Adopted 11 Aug 2026 from the owner's DDC project (`docs/agent-work-orders/` there holds 26
versioned build queues), at his direction: bring the discipline, cross no data.

**Every substantial agent task gets a written, versioned work order in this directory
before the agent starts.** Chat messages are ephemeral; a work order in the repo is
auditable, resumable by a different agent, and cannot be misremembered.

## Naming

`WO-<nnn>_<agent>_<slug>.md` — e.g. `WO-001_AGENT-B_command-center-design-pass.md`.
Numbers never reuse. Superseded orders stay in place with a `SUPERSEDED BY WO-nnn` line
at the top — all data is kept forever.

## Required sections

1. **Ordered by** — owner or Agent I, with date.
2. **Scope** — one page/module/lane. What is explicitly OUT of scope.
3. **Locks** — every frozen surface and rule the work must not touch.
4. **The work** — numbered items, each independently verifiable.
5. **Data contract** — views/tables read, by name; new requirements routed to Agent I.
6. **Validation** — the named checks that prove the delivery, per the one-page-one-
   validator rule.
7. **Evidence** — where the delivery evidence doc will land (`docs/evidence/`).

## Relationship to page packages

A front-end page build's work order IS its completed page package
(`docs/workflows/PAGE_PACKAGE_TEMPLATE.md`). Other lanes (data, parser, sales) use this
generic form.
