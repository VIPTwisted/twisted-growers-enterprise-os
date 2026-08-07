# Money — where each dollar figure comes from

*Orientation page. Every rate below is an owner-set, editable database row —
nothing is hardcoded (G1). The settled values live in CLAUDE.md Money; this
page maps how money resolves.*

## The settled rates (locked in [CLAUDE.md](../../CLAUDE.md) — provenance included)
- Bulk flower **$1,100/lb** — owner-set, supersedes the $741 and $1,200 that
  appear in the workbooks. Do not resurrect the workbook figures.
- Shake and trim $300/lb; trim input cost $250/lb (owner-set, expected to move).
- Fresh frozen $119.77/lb — derived by formula, shown in CLAUDE.md.
- Concentrates per sub-type (rosin/bubble hash $15/g, live badder $12/g,
  cured badder/diamonds/shatter/sugar $9/g; crude and distillate fall back to
  the calculator).

## How a rate resolves — always through code, never a literal
`f_rate_for(stream, tag)`: batch override → concentrate sub-type → stream
rate → fallback (G3). Sub-types map through `concentrate_rate_map`.
Thresholds resolve through `f_rule()` (G4).

## Costs
- Total operating cost **$285,000/month, WAGES INCLUDED** — never add payroll
  on top.
- Actual cost per saleable pound: **$591.39** (calculation in CLAUDE.md Money).
- Cost inputs live in `cost_inputs`; their history in `cost_input_history`,
  which is immutable (H2).

## The honesty rules that bind every money number
- Never invent a number (A1); every figure carries provenance (A2).
- Every money tile drills to `v_stock_proof` per-item evidence, and the rows
  must add up to the tile exactly (C1, C2).
- No benchmark or comparison without a real source (CLAUDE.md dashboard rule 8).
