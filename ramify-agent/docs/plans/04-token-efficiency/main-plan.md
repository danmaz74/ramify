# Plan 4: Delivered-solution token efficiency

**Date:** 2026-09-21. **Status:** proposed; blocked until Plan 3 is complete
and merged into the destination branch.

This plan implements the agreed
[`token-efficiency/1`](../../metrics/token-efficiency.md) policy. It measures
the model-token cost of a completed implementation run relative to the source
change it delivered, with the policy's fixed allowance for the starting
project's search-space size. It also closes the related context-limit visibility
gap: budget returns and compactions are recorded and displayed by mechanism,
including an exact count of overflow-triggered compactions.

It follows Plan 3 rather than extending work that is still in flight. No
iteration in this plan may begin until all of these are true:

1. Plan 3 has an iteration 12 results note and a completion report.
2. The Plan 3 implementation and completion artifacts are merged into the
   destination branch, and the implementation checkout starts clean at that
   merged commit.
3. Plan 3's required type check, tests, web build and Ramify self-check pass at
   that commit.
4. The architect view is rematerialized from that commit. Its revision, input
   identity and coverage limits are recorded in iteration 1's results.

If the merged implementation differs from the Plan 3 work inspected while
this plan was written, iteration 1 reconciles names and locations before
production edits. It preserves the behavior and compatibility boundaries below.

## Runnable outcome

After an implementation run reaches `completed`, its Run page shows a separate
**Token efficiency** result containing:

- token cost `T`, with provider, model, accounting version and the retained
  input, cache-read, cache-write and output breakdowns;
- starting search-space size `S0`, split into production and test source lines;
- eligible added lines `A`, deleted lines `D`, and delivered change volume
  `C = A + D`, also split into production and tests;
- the search-space adjustment `g(S0)`;
- tokens per 100 changed source lines `U`; and
- search-space-adjusted tokens per 100 changed source lines `K`.

Every value names `token-efficiency/1`, its starting and accepted endpoint
identities, evidence references and coverage. Missing evidence remains
`unavailable`; `C = 0` makes `U` and `K` `not-applicable`. A failed, stopped or
unfinished run retains its observed token cost but has no successful-delivery
score.

The same page shows a separate **Context limits** panel for running and
completed runs. It reports automatic context-limit occurrences, exact
overflow-triggered compactions, proactive budget returns, threshold-triggered
compactions and explicit compactions, by role and invocation. Each occurrence
shows the configured mechanism, reported model context usage and the workflow
action that followed.

```text
accepted baseline commit + baseline ramify.measure/1 inventory
                         -> S0

accepted baseline commit + accepted final commit
+ inventories at both endpoints
                         -> A, D, C

provider usage from every invocation
                         -> T

T + C + S0              -> U, g(S0), K
```

## Meaning and boundaries

This plan uses the common language in the
[metrics glossary](../../metrics/glossary.md):

- **Delivered-change complexity** is the concept of interest on the output
  side. **Delivered change volume** is this policy's simple proxy for it.
- **Starting search-space size (source-line proxy)** is `S0`. It is not actual
  exploration, declared scope bytes, inventory context size or model context
  usage.
- **Token efficiency** concerns the economy of model-token consumption in
  producing the delivered solution. It does not assess whether the delivered
  solution is itself efficient.
- A **context-limit occurrence** is either a context budget return or an
  automatic threshold/overflow compaction. Only a compaction whose recorded
  trigger is `overflow` is an **overflow-triggered compaction** or exact
  **context overflow occurrence**. A proactive threshold is not relabeled as
  provider overflow.

Actual exploration measurement, semantic or weighted change complexity,
solution efficiency, monetary price, energy use and a model-independent
compute measure remain outside this plan.

## Existing behavior preserved

Plan 3's `kpi/1` and `scope-size/1` contracts remain intact. In particular:

- `scope-bytes-per-changed-line`, `scope-size-ratio` and `reduction-factor`
  keep their compatibility identifiers and formulas;
- `LineEventSummary` keeps its record name and still describes the existing
  invocation numstat-increase collector;
- existing Plan 3 run records remain readable; and
- the current `/metrics` response remains a `kpi/1` projection.

The new policy receives its own additive read endpoint and response rather than
being inserted into `Metric[]` under the wrong policy version. New presentation
labels may explain the older identifiers without changing them.

Plan 3's durable evidence is retained: budget returns are invocation outcomes,
and completed compactions are observations. Plan 4 adds start evidence for new
compaction attempts so an interruption between start and completion is visible.
It does not reinterpret old runs as complete where their observation logs
cannot establish whether such an interrupted attempt occurred.

## Ownership and module placement

No new module is introduced initially.

| Owner | Responsibility added |
| --- | --- |
| `harness/evidence` | Validate the complete `ramify.measure/1` file inventory; read identified source content from Git; produce reproducible baseline and endpoint-diff facts. |
| `harness/agent` | Attach provider/model/accounting identity to usage reported through the port, or state that usage is synthetic or unavailable; expose compaction start and end events. |
| `harness` | Own `token-efficiency/1`, `context-limits/1`, durable evidence, lifecycle ordering, aggregation, the pure projections and their public protocols. |
| `web` | Render the harness responses, states, components, coverage and terminology. It performs no calculation. |

This preserves the current tree because the new work extends responsibilities
already owned there. `harness/evidence` already hides Ramify and Git formats;
the harness already owns run records and KPIs; `harness/agent` already defines
usage observations; and `web` is already the client. A new metrics module would
add a contract and navigation boundary while still requiring the harness's run
records and lifecycle, so it would not yet reduce local cognitive complexity.
Iteration 4 remeasures the result and may propose a later extraction with
evidence, but does not extract one.

## Evidence contracts

### Source inventory evidence

Extend the existing `ramify.measure/1` reader to validate and retain:

- `ownershipRule`;
- every `files` entry's path, owner, area, kind and bytes; and
- `outsideModuleFiles`.

The producer remains Ramify. ramify-agent does not rediscover compiler inputs,
infer ownership from paths or scan for source extensions. It selects only
inventoried records whose `kind` is `source`.

Production and test subtotals use Ramify's documented classification:

- a source in physical `tests` area is test source;
- ordinary source owned by a module with a positive exact production source or
  resource file count is production source; and
- ordinary source of a testing module is test source.

If the inventory does not support that derivation, the dependent result is
unavailable rather than guessed.

### Starting search-space evidence

New record `ramify-agent.source-line-baseline/1` contains:

- policy `token-efficiency/1`;
- baseline commit and source-state identity;
- the captured `ramify.measure/1` record reference, revision and content hash;
- production and test source file counts and nonblank line counts;
- `S0`, equal to the two line subtotals; and
- exclusions, coverage and any unavailable reason.

Capture it before the first agent invocation, from the same clean baseline
commit as the run. Count source comments, exclude whitespace-only lines,
normalize line endings and count each inventory path once. Read content from
the identified commit, not from a later working tree. Retain evidence needed
to reproduce the count without copying source contents into the run records.

### Delivered-change evidence

New record `ramify-agent.delivered-change/1` contains:

- policy `token-efficiency/1`;
- baseline and accepted final commits;
- baseline and final inventory references, revisions and content hashes;
- Git version and the exact endpoint-diff options;
- production and test additions and deletions;
- `A`, `D` and `C`;
- recorded classification transitions, binary or unreadable source paths, and
  coverage; and
- an unavailable reason where a complete result cannot be established.

The evidence module compares the accepted endpoints with Git's text diff. The
recipe uses an explicit rename threshold and no external diff driver or
text-conversion filter. A pure detected rename contributes zero; a copy that
leaves its original contributes additions; a rename with edits contributes its
text edits. On each side, only nonblank lines classified as source by that
endpoint's inventory count. An affected source file that Git treats as binary,
an unobserved path that might be source, a missing endpoint or an inventory
revision mismatch prevents a complete `C`.

Capture the final inventory and delivered-change evidence after the passing
final gate's accepted commit and before `job-completed`. A capture failure does
not undo an accepted solution: it commits an unavailable evidence record, and
the run completes with an unavailable token-efficiency score. Recovery repeats
the read-only acquisition against the same accepted commit and commits no
duplicate record or event.

### Usage-accounting evidence

New record `ramify-agent.usage-accounting/1`, committed with each invocation's
outcome, groups provider-reported usage by:

- provider;
- model;
- accounting-surface version; and
- whether the counts are provider-reported or synthetic.

Each group retains `total`, input, output, cache-read and cache-write counts.
`T` is the sum of provider-reported `total` values. It is never derived by
adding categories whose overlap semantics may differ. Mixed models retain
separate groups; incompatible accounting semantics make the whole-run `T`
unavailable with known subtotals. Scripted-agent usage is marked synthetic and
cannot establish a delivery score, although deterministic tests may construct
provider-accounted evidence explicitly.

Every invocation in the run is included, including initial analysis,
architecture, contract, implementation, review, repair, failed, superseded and
compaction-related model calls that the port reports. Provider retries that the
port does not observe remain an explicit limitation. No earlier session outside
the implementation run is included unless a later policy adds a durable link;
no such link is introduced here.

## Context-limit visibility

Context limits are an operational measurement beside token efficiency, not an
input to its formulas. The versioned projection is `context-limits/1`.

It derives occurrences from two authoritative sources:

1. A **context budget return** is one invocation outcome whose `ended` value is
   `context-budget-reached`. Its evidence includes role, invocation, work item,
   iteration or placement request, configured threshold, observed model context
   usage, report delivery and the next durable workflow event.
2. A **compaction occurrence** starts when the port emits compaction `started`.
   Record a numbered start observation immediately with role, trigger and
   reported usage before it. Correlate the matching `ended` event by invocation
   order and retain success, reported usage after it and any failure. A started
   attempt with no end remains an interrupted occurrence rather than
   disappearing.

The automatic **context-limit occurrence** total includes budget returns and
compactions triggered by `threshold` or `overflow`. Explicit/manual compactions
are reported separately. The **context overflow occurrence** count includes
only compactions whose recorded trigger is `overflow`.

The response groups occurrences by role and mechanism and lists them in time
order. It also exposes the role's recorded `RunPolicy.context` entry, so a
reader sees whether that invocation allowed compaction or used a budget return.
The workflow action is derived from durable records rather than assumed from
the role: for example, a fresh successor invocation in the same iteration, an
iteration closed partial, a fork retry, run failure or no successor yet.

The inspected Plan 3 implementation has this policy:

| Role | Compaction policy | Implemented context-limit path |
| --- | --- | --- |
| `initial-architect` | allowed | Automatic compaction; an unhandled budget return cannot complete analysis. |
| `local-architect` | allowed | Automatic compaction; a budget return does not count as completion. |
| `global-fork` | forbidden | Budget return is retained, but the current coordinator path treats it as a fork ending without a result. |
| `engineer` | forbidden | Budget return with report; a fresh successor invocation continues the same iteration until its bound, then the iteration closes partial. |
| `contract-engineer` | forbidden | Budget return closes the contract iteration partial and registers no agreement. |

Iteration 1 must reconcile this table against the merged Plan 3 source. It does
not silently describe all architects as compacting or every engineering return
as a new iteration. A behavior change requires an explicit correction to the
role policy and state-machine acceptance cases; the visibility work proceeds
from the behavior actually merged.

Add an independent, additive query:

```text
GET /api/v1/plans/:planId/runs/:runId/context-limits
```

Its response contains policy version, run state, coverage, automatic total,
overflow-triggered total, budget-return total, compaction totals by trigger and
completion state, role breakdowns and ordered occurrences. Old Plan 3 runs use
their completed compaction observations and invocation outcomes; their
compaction-attempt coverage is `partial` because starts were not retained.

## Projection and protocol

Add an independent response schema with policy version
`token-efficiency/1` and an additive query:

```text
GET /api/v1/plans/:planId/runs/:runId/token-efficiency
```

The response contains:

- run state and whether an accepted delivery exists;
- token groups, `T`, coverage and evidence references;
- `S0` and its production/test components;
- `A`, `D`, `C` and their production/test components;
- `g(S0)`;
- `U` and `K`; and
- the baseline/final identities and diff recipe.

The harness computes this as a pure projection. Queries append no event and
write no file. The response rules are:

```text
g(S0) = 1 + log10(1 + S0 / 1000)
U     = 100 * T / C
K     = 100 * T / (C * g(S0))
```

- Compute with unrounded values and round only in the client.
- Only complete, accepted runs with complete `T`, `C` and `S0`, and `C > 0`,
  have measured `U` and `K`.
- `C = 0` makes `U` and `K` `not-applicable` while retaining `T` and `S0`.
- Missing evidence makes the dependent value `unavailable`, with known
  subtotals and coverage.
- Failed, stopped and running jobs expose observed cost but no
  successful-delivery ratio.
- Old Plan 3 runs without the new records remain readable and return an
  unavailable token-efficiency response with the missing evidence named.

## Presentation and language

The Run page adds a Token efficiency panel before the older execution metrics.
It shows `T`, `A`, `D`, `C`, `S0`, `g(S0)`, `U`, `K`, policy version, endpoint
identities and state. Production/test and provider/model breakdowns are
progressively disclosed.

A Context limits panel appears beside it. Its summary gives automatic events,
exact overflows, budget returns and compactions. Expanding it shows each role,
invocation, trigger, threshold or before/after usage, completion state and
workflow action. A running occurrence is visible before it completes. The web
renders `context-limits/1`; it does not recount observation logs.

The older KPI table receives presentation labels that say what its values
measure while retaining raw IDs for inspection:

| Compatibility ID | Presentation label |
| --- | --- |
| `scope-bytes-per-changed-line` | Declared scope bytes per invocation numstat line |
| `scope-size-ratio` | Declared-scope ratio |
| `reduction-factor` | Inverse declared-scope ratio |

Its explanatory text says that these are declared-scope and execution-activity
measures, not delivered change volume or observed token savings.

Current user-facing prose, source comments and error messages use **model
context usage** for tokens occupying a model context. Compatibility identifiers
and quoted historical evidence remain unchanged. Plan 3's completion report and
current plan prose receive a terminology note only if the merged versions lack
one; completed iteration evidence is not rewritten merely to modernize wording.

## Iterations

| Iteration | Delivers | Acceptance cases |
| ---: | --- | --- |
| 1 | Post-merge reconciliation, usage-accounting identity, compaction-attempt capture and terminology-compatible contracts. | TE01–TE04, TE20 |
| 2 | Source inventory parsing, `S0` counting and reproducible endpoint delivered-change evidence. | TE05–TE09 |
| 3 | Run lifecycle capture, recovery, pure token-efficiency and context-limit projections, and additive HTTP queries. | TE10–TE15, TE21–TE22 |
| 4 | Web presentation, compatibility labels, integrated and live validation, measurement reevaluation and completion report. | TE16–TE19, TE23 |

Executable briefs are indexed in [iterations](iterations/README.md).

## Acceptance matrix

| Case | Required behavior | Owner |
| --- | --- | ---: |
| TE01 | Execution refuses to start before the merged Plan 3 prerequisite is evidenced and the refreshed architect identity is recorded. | 1 |
| TE02 | `kpi/1`, `scope-size/1`, their IDs, formulas and existing run readability remain unchanged. | 1 |
| TE03 | Every invocation's usage is identified as provider/model/accounting-version or synthetic/unavailable, without deriving total tokens from categories. | 1 |
| TE04 | Current UI/prose distinguishes model context usage, declared search-space bytes, invocation numstat increases and delivered change volume. | 1, 4 |
| TE05 | The consumer validates the complete `ramify.measure/1` file inventory and uses its source classification without a second analyzer. | 2 |
| TE06 | `S0` counts eligible nonblank production and test source at the identified baseline commit, once per inventoried path. | 2 |
| TE07 | `A`, `D` and `C` come from the accepted baseline-to-final text diff with endpoint-specific source classification. | 2 |
| TE08 | Blank lines, comments, replacements, pure renames, copies, rename-with-edit and production/test transitions follow the policy. | 2 |
| TE09 | Missing inventories, revision conflicts, binary source, unreadable content and uncertain source classification are unavailable with evidence, never zero. | 2 |
| TE10 | Baseline evidence precedes the first invocation; final evidence follows the accepted final commit and precedes `job-completed`. | 3 |
| TE11 | A crash at each new capture boundary recovers against the same endpoints and creates no duplicate event or record. | 3 |
| TE12 | A completed run with complete evidence computes `g(S0)`, `U` and `K` exactly under `token-efficiency/1`. | 3 |
| TE13 | `C = 0`, an unfinished run and incomplete token coverage produce their specified states while retaining known inputs. | 3 |
| TE14 | The token-efficiency query is additive, schema-validated, bounded and read-only. | 3 |
| TE15 | An old Plan 3 run remains readable and reports which new evidence is absent. | 3 |
| TE16 | The web renders every input, result, state, policy and endpoint identity without recomputing a value. | 4 |
| TE17 | The older KPI table uses precise presentation labels and retains its raw compatibility IDs. | 4 |
| TE18 | An integrated fixture run demonstrates a reproducible complete result and the zero-change and unavailable paths. | 4 |
| TE19 | A real pi run records provider/model identity and produces a score, or the completion report leaves live validation explicitly outstanding because credentials were unavailable. | 4 |
| TE20 | Every new compaction attempt is recorded at start and correlated with its completion; an interrupted attempt remains visible. | 1 |
| TE21 | `context-limits/1` counts budget returns and automatic compactions without calling proactive thresholds provider overflows. | 3 |
| TE22 | The projection reports exact overflow-triggered compactions, role policy, coverage and the durable workflow action following each occurrence. | 3 |
| TE23 | The Run page displays context-limit totals and occurrence details without client-side recounting. | 4 |

## Completion gate

1. TE01–TE18 and TE20–TE23 have named automated or retained evidence; TE19 has retained live
   evidence or is explicitly outstanding with the credential reason.
2. A completed fixture run's stored baseline/final identities reproduce `S0`,
   `A`, `D`, `C`, `g(S0)`, `T`, `U` and `K` exactly.
3. A zero-source-change run shows token cost and `not-applicable` ratios.
4. A failed run and an old Plan 3 run show known cost/evidence without a
   successful-delivery score or a false zero.
5. The existing `/metrics` response and Plan 3 compatibility fixtures are
   unchanged apart from presentation labels outside the wire contract.
6. Every token-efficiency query leaves the run log and evidence files byte for
   byte unchanged.
7. The web displays the harness response and passes no metric calculation into
   client code.
8. `npm run type-check`, `npm test`, `npm run build:web` and
   `npm run check:self` pass from `ramify-agent/`.
9. The completion report records the architect and API-view identities, exact
   commands, cases, live-validation status, provider-accounting limits and the
   measured post-plan module candidates.
10. A fixture containing a budget return, threshold compaction,
    overflow-triggered compaction, explicit compaction and interrupted
    compaction reproduces the displayed totals and per-occurrence details.

## Out of scope

- Measuring actual files read, searches performed or information exposed to an
  agent.
- Deciding whether the delivered implementation is an efficient solution.
- Semantic weighting of changed lines, files, functions, modules or contracts.
- Comparing token counts as if different models had equal compute or cost.
- Pricing provider usage.
- Retroactively fabricating missing inventories or usage identity for Plan 3
  runs.
- Changing Plan 3's scope-size formulas or compatibility identifiers.
- Isolated worktree delivery or merging implementation results; that remains a
  separate future capability.
