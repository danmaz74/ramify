# Iteration 10 results: lineage measurements

**Date:** 2026-09-23. **Owners:** `harness` projections, `web`, the
[metrics documents](../../../metrics/README.md). **Branch:** `feat/plan9-i10`.

The lineage measurements are defined in the metrics glossary, specified as
the `lineage/1` policy, computed from a run's records and shown with their
coverage on the Run page's Measurements tab.

## Final names

### Documents

- [Metrics glossary](../../../metrics/glossary.md) gains: Segment, Actual
  start, Degraded start, Model context history, Context generation, Starting
  context size, Segment cost profile, Fork cost against a fresh start,
  Continuation growth, Repair segment cost, Degraded-start rate, Replacement
  rate, Forks served by a context generation.
- [Lineage measurements](../../../metrics/lineage.md) (new) is the `lineage/1`
  calculation policy: inputs, groups, IDs, units, states and the treatment of
  degraded starts. The metrics README lists it.
- [Measurement principles](../../../metrics/measurement-principles.md) gains
  "Measure a segment by the start it made".
- [Terminology map](../../../metrics/terminology.md) gains "Sessions and
  lineage".
- [Measurements and KPIs](../../../measurements-and-kpis.md): "distinct pi
  sessions" and "pi session" now say harness sessions and model context
  histories.

### Measurement IDs (`lineage/1`)

| ID | Unit |
| --- | --- |
| `fork.generation-<g>.<measure>` | tokens per segment |
| `fresh-fork.<measure>` | tokens per segment |
| `continuation-growth` | tokens per continuation |
| `repair.<measure>` | tokens per segment |
| `fresh-engineer.<measure>` | tokens per segment |
| `degraded-starts`, `degraded-starts.continue`, `degraded-starts.fork` | degraded starts per requested start |
| `replacements.reconstructed`, `replacements.context-rebuilt` | replacements per session |
| `forks-served.generation-<g>` | forks |

`<measure>` is `start-context`, `input`, `cache-read`, `cache-write` or
`output`. The list is in that order; each known generation is listed.

### Code

- [kpi/lineage.ts](../../../../subs/harness/src/kpi/lineage.ts):
  `lineagePolicyVersion` (`'lineage/1'`), `StartKind`, `SegmentUsage`,
  `SegmentFacts`, `LineageInputs` and the pure `lineageMetrics(inputs)`.
- [projections/lineage.ts](../../../../subs/harness/src/projections/lineage.ts):
  `lineageInputsOf(view, logs)` builds the inputs from the run log's lineage
  events, `outcome.json` usage and each invocation's first `context`
  observation; `modelHistories(inputs)` names the context each invocation of
  a degraded continuation's session ran in; `ObservationLogs`.
- [projections/metrics.ts](../../../../subs/harness/src/projections/metrics.ts):
  `metricsOf` reads each observation log once and answers `lineage`.
- [kpi/metrics.ts](../../../../subs/harness/src/kpi/metrics.ts):
  `InvocationFacts.history` (optional; absent means the session's own), and
  `session-weighted-total` groups by it.

### Protocol

In [interfaces/protocol/runs.ts](../../../../subs/harness/src/interfaces/protocol/runs.ts):

- `lineagePolicySchema` (`z.literal('lineage/1')`).
- `lineageMetricSchema`, `LineageMetric`: the `metricSchema` shape under
  `lineage/1`. Both come from one private `measurementSchema(policy)`, so
  `Metric` is unchanged.
- `MetricsResponse.lineage`: `{ policyVersion: 'lineage/1', metrics: LineageMetric[] }`.

The root [module.ramify](../../../../module.ramify) re-exposes
`lineagePolicySchema`, `lineageMetricSchema` and `LineageMetric` to its
descendants, as it does `kpiPolicySchema` and `Metric`.

### Web

The Measurements tab of [run-page.tsx](../../../../subs/web/src/run-page.tsx)
has a Lineage panel, a table labelled `Lineage measurements`, rendered by the
existing `MetricRow`: state, value (or the state, never zero), known subtotal,
numerator, denominator, coverage, note and evidence. `metricValue` accepts
either kind.

## Decisions

1. **A segment is measured by its actual start.** A fork or continuation the
   executor made fresh inherited nothing, so it counts as a fresh start of
   its role (`fresh-fork`, `fresh-engineer`) and as a degraded start, and it
   is excluded from fork cost, continuation growth, repair cost and forks
   served. The next continuation of its session grows from it.
2. **A degraded continuation counts again in `session-weighted-total`.** The
   metric counts a continued session once because one model context holds
   its scope; a degraded continuation loaded its scope into a new context,
   which the KPI document already called a new session identity. So the
   metric sums model context histories: a session's first, and one more
   from each continued start made fresh. `session-count` and the adaptation
   share still count harness sessions. `kpi/1` is unchanged as a version,
   since the formula is the same and this corrects its grouping, as
   iteration 2 did. The metric's evidence names each extra context.
3. **An unknown start is never guessed.** A segment whose outcome records no
   start (interrupted, or its session never ran) stays in the group of its
   requested start and is not covered there, so the group's measurement is
   `unavailable` with the known subtotal; `degraded-starts` and
   `forks-served` are `partial`.
4. **A running segment is in no measurement,** since its actual start is
   known only at `invocation-ended`.
5. **Fresh comparisons are same-role.** A fork is compared with global forks
   that started fresh, a repair with engineer segments that started fresh,
   including reconstructions. The comparisons are descriptive: the prompts
   differ, which the policy states.
6. **The cost profile keeps every usage category,** beside the starting
   context size. The analysis named cache reads and output; input and cache
   writes are kept too, since a cache miss moves inherited context into
   input.
7. **A separate policy version.** The lineage measurements are `lineage/1`,
   in their own response field and table, so `kpi/1`'s list is unchanged.

## Changes from the design

- "By reason": replacements are by their closed reasons (IDs); degraded
  starts are by the requested relation (IDs), and the executor's free-text
  reasons are the evidence.
- The `web` module changed, which the iteration's Owner line does not name;
  the Work requires the Run page display.

## Exit evidence

From `ramify-agent/`:

```sh
npx vitest run subs/harness/src/tests/lineage-metrics.test.ts \
  subs/harness/src/tests/kpi-metrics.test.ts subs/web/src/tests/run-page.test.tsx
# 3 files, 36 tests passed
npx vitest run subs/harness/src/tests/lineage-metrics.test.ts subs/harness/src/tests/kpi-metrics.test.ts \
  subs/web/src/tests/run-page.test.tsx subs/harness/src/tests/accepted-commit.test.ts \
  subs/harness/src/tests/projections-pure.test.ts subs/harness/src/tests/protocol-contract.test.ts \
  subs/harness/src/tests/run-protocol.test.ts subs/harness/src/tests/union-values.test.ts \
  subs/harness/src/tests/composition.test.ts subs/web/src/tests/client.test.ts
# 10 files, 130 tests passed
npx vitest run subs/harness/src/tests/run-protocol-materialization.integration.test.ts
# 1 file, 1 test passed
npm run type-check
# passed
npm run build:web
# built
npm run check:self
# Execution: completed; check: passed; coverage: partial
# Findings: 0 errors, 0 warnings, 89 analysis limits
```

- **Known values.** `lineage-metrics.test.ts` builds a run of eight sessions
  (two forks of generation 1, one at an append; a local architect continued
  once and then made fresh; an engineer repaired and then reconstructed; the
  fork that rebuilt the context; a fork of generation 2 made fresh), with an
  observation log per invocation, checks it with the session reducer, and
  reads it through `metricsOf`. Every measurement matches a hand-computed
  value: for example `fork.generation-1.start-context` 25000,
  `fresh-fork.start-context` 13500, `continuation-growth` 4000 (inv-0006
  excluded), `repair.cache-read` 40000, `degraded-starts` 2 of 6,
  `replacements.reconstructed` 1 of 8, `forks-served.generation-2` a measured
  0.
- **Missing inputs.** A second run holds a fork whose executor reported no
  context size, an interrupted fork and a continuation whose previous
  segment has no observation log: the affected measurements are
  `unavailable` with the known subtotal, coverage and each reason, the rates
  `partial`, and empty groups `not-applicable`, never zero.
- **`session-weighted-total`.** A new `kpi-metrics.test.ts` case: one session
  of three invocations at 1000, 3000 and 2000 bytes whose second start was
  made fresh sums 4000, not 3000, and still counts one session.
- **Web.** A new `run-page.test.tsx` case shows a measured, an unavailable
  (with its known subtotal and reason), a not-applicable and a partial
  lineage measurement, each with its coverage.
- **check:self.** The two new analysis limits are `signature-inferred` on the
  two new exposed schemas, `lineagePolicySchema` and `lineageMetricSchema`,
  the same limit every exposed schema has (87 before).

## Open items

- The starting context size is the first observation after the first model
  call, so it includes that exchange. A size at the source point is not
  recorded; the transcript writer's `point` entries could supply one later.
- No composed run degrades a start; the degraded cases are constructed runs.
