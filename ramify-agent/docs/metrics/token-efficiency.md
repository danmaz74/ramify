# Token efficiency

**Status:** agreed initial policy; not an implementation or empirical validation
claim. **Policy identifier:** `token-efficiency/1`.

This policy follows the [measurement principles](measurement-principles.md)
and uses the [metrics glossary](glossary.md). It measures the token cost of the
delivered change with a simple allowance for the starting search space.
Solution efficiency and actual exploration measurement are outside its scope.

## Terminology

The concept of interest is token efficiency. This policy quantifies it through
two normalized token-cost metrics, `U` and `K`, for which lower is better.
`C` measures delivered change volume, the selected proxy for delivered-change
complexity; it is not a general definition or unit of complexity. `S0` is the starting search-space
size (source-line proxy). `g(S0)` is an adjustment factor, not
a measurement of project complexity or actual exploration.

The [terminology map](terminology.md) distinguishes these names from older
scope-size formulas and architectural measures. The formulas below remain the
canonical calculation rules for `token-efficiency/1`.

## Inputs and source scope

| Input | Meaning | Unit |
| --- | --- | --- |
| `T` | Total attributable model tokens consumed to deliver the accepted result | tokens |
| `A` | Eligible nonblank lines added from baseline to accepted final state | lines |
| `D` | Eligible nonblank lines deleted from baseline to accepted final state | lines |
| `S0` | Starting search-space size (source-line proxy): eligible nonblank source lines in the whole starting project | lines |

Use the same eligibility policy for `A`, `D` and `S0`:

- Include handwritten production source and tests with equal weight, including
  source in separately declared testing modules.
- Exclude generated files, dependency files, lockfiles, documentation and run
  artifacts. Generated architect/API views contribute no source lines.
- Count text source selected by the project inventory. Configuration and
  non-source resources have no line weight in this initial policy.
- Count source comments. Exclude whitespace-only lines and normalize line
  endings; retain other text differences, including formatting.
- Count each inventoried source file once, without summing overlapping module
  subtrees. Retain production/testing subtotals beside the combined count.

Freeze the starting snapshot and its inventory before the first included
session. Capture the final snapshot after writers settle and acceptance is
recorded. Use each side's inventory for added and deleted source, retaining
classification transitions explicitly. Known absence is distinct from unknown
ownership or missing inventory coverage.

The line counts require captured source text; byte totals are not converted
into lines or tokens. The inventory defines the analyzed project scope, and
omitted source scopes must remain visible as coverage limits.

## Delivered change volume

```text
C = A + D
```

Compute `A` and `D` from the baseline-to-final text diff. A replacement counts
as a deletion plus an addition; this is not the signed net change `A - D`.

An identical-content file rename or move contributes zero when both sides are
eligible. A copy that leaves the original in place is an addition. A move with
edits retains its text edits when paired by the recorded diff policy. Retain
the diff engine, version, options and rename/move pairing policy so these
counts can be reproduced; do not claim semantic move detection.

Intermediate edits and reverts contribute only through their surviving effect
on the endpoint diff. Exclude no formatting or mechanical source edits beyond
the stated line rules: semantic classification is not required in version 1.

`C` is delivered change volume used as a complexity proxy. It gives deletions positive
weight and adds no multiplier for files, functions, modules or sessions.

## Starting search-space adjustment

```text
g(S0) = 1 + log10(1 + S0 / 1000)
```

The divisor is a fixed 1,000-line reference scale. The logarithm uses base 10.

| `S0` (lines) | `g(S0)` (rounded) |
| ---: | ---: |
| 0 | 1.00 |
| 1,000 | 1.30 |
| 10,000 | 2.04 |
| 100,000 | 3.00 |
| 1,000,000 | 4.00 |

The factor starts at 1 and grows with diminishing increments. For larger
projects, roughly ten times more source adds one unit to the factor. Both the
logarithm and the reference scale are provisional policy choices, not fitted
or validated estimates of search difficulty.

Keep `S0` fixed through project growth, scope narrowing, retries and module
creation. Do not replace it with declared search-space size (inventory-byte
proxy) or actual exploration.

## Token accounting

Include attributable initial architecture and discovery, implementation,
review, integration, repair, failed attempts and model calls for compaction.
An explicitly linked earlier planning session is included once. Retain phase
and role breakdowns without letting transfers between roles change the total.

Retain provider-reported input, cache-read, cache-write and output categories
with their definitions. Derive `T` only from compatible, non-overlapping counts;
do not add cache or reasoning counts again when they are already included in
another category. Record whether observations are increments or cumulative
totals so resumed sessions, retries and recovered observations cannot be
double-counted.

Record provider, model and usage-accounting version. Preserve breakdowns for
mixed-model runs; a token total is not a model-independent compute or currency
measure. Missing required usage leaves the complete score unavailable, with
the known subtotal and coverage retained.

## Displayed metrics

```text
U = 100 * T / C
K = 100 * T / (C * g(S0))
```

| Value | Display label | Direction |
| --- | --- | --- |
| `U` | Tokens per 100 changed source lines | Lower is better |
| `K` | Search-space-adjusted tokens per 100 changed source lines | Lower is better |

Calculate using unrounded inputs and round only for display. Always show or
make inspectable `T`, `A`, `D`, `C`, `S0`, `g(S0)` and the policy version beside
the result. `K` is an adjusted comparison value; `T` remains actual observed
token consumption.

### Example

For `T = 120000`, `A = 400`, `D = 200`, and `S0 = 100000`:

```text
C = 600
g(S0) = 1 + log10(101) = approximately 3.004321
U = 20000
K = approximately 6657.08
```

With the same `C` and `S0`, reducing token consumption by a factor of four
reduces both displayed costs by a factor of four. No exploration observation
is needed.

## States and retained evidence

- An accepted run with complete inputs and `C > 0` has a computable score.
- `C = 0` makes both ratios not applicable. This includes documentation-only
  work and unchanged-source reuse; retain their token cost and acceptance.
- A known empty starting project has `S0 = 0` and `g(S0) = 1`.
- Missing source, uncertain attribution or incomplete token coverage prevents
  a complete score. Retain known subtotals and reasons without presenting a
  covered-subset ratio as the whole-run value.
- Failed or incomplete runs retain their cost and status without a
  successful-delivery score.

Retain references to the accepted plan revision, acceptance evidence, starting
and final content identities, inventories, source exclusions, diff recipe,
usage evidence and measurement coverage. Snapshot identities must include
eligible dirty and untracked source. Preserve raw evidence for recomputation
under a later policy; store shared evidence once and reference it.

The harness owns computation and serves its results to clients. This policy
does not replace the byte-based scope-size or cumulative mutation-event
formulas in the [earlier KPI contract](../measurements-and-kpis.md); their
denominators and interpretations differ.
