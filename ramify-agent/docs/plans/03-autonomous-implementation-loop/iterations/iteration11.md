# Iteration 11: Protocol, web MVP and KPI projections

**Goal:** expose the run through the harness's own public protocol, let a person
operate and review it in the browser, and compute the KPI projections from the
observations the earlier iterations already captured.

## Prerequisites

Iterations 4 to 10: every durable record and observation this iteration
projects. Nothing new is observed here.

## Write scope

`subs/harness/src/interfaces/protocol/runs.ts`,
`subs/harness/src/projections/`, `subs/harness/src/kpi/` (projection only),
`subs/harness/src/http/`, the `harness` and root `module.ramify`, and
`subs/web/`.

## Interfaces consumed and established

Consumed: the run log, the observation logs, every durable record,
`MeasurementSnapshot`, `LineEventSummary`.

Established, all in `src/interfaces/protocol/runs.ts` and exposed to the parent
with the `browser` tag, then re-exposed by the root to its descendants by
explicit named selection: `RunSnapshot`, `CapabilityProgress`, `Metric`, the
`start-run` command, the run list, analysis, decision, work-item, gate and
metric responses, `RunEventPage`, and the `unsupported-version` error code.

## Work

### Notices

`RunSnapshot.notices` holds what the person must be told: every module created
or removed, with the decision that proposed it or the statement that none did,
which is the one thing Dan wants to know at the end of a run; and every
detected dependency cycle, with its members, the work item that closed it and
whether the re-plan resolved it. The Run page's overview shows notices first,
and keeps them after the run ends, resolved or not. A notice is a projection of the
closing lines of iterations and of `dependency-cycle-detected` events and what
followed them; no query writes
one.

### The protocol

The commands, queries, limits and error codes of the
[main plan](../main-plan.md#protocol), with Plan 1's retry, cursor and reconnect
behavior preserved unchanged. Every response is validated against its schema on
both sides, as Plan 1 already does.

Durable records stay private. What the web receives is a projection: a pure
function of the logs and the records that never appends an event and never
infers a transition. The event page is a **projection** of the run log, not the
internal event union: it names the transition, its references and its time, so
the internal log can change without changing the wire.

The decision list is a projection over the records that hold each choice:
placement decisions from `PlacementDecision`, scope and its rationale from
`IterationAssignment`, breaking changes and plan revisions from
`WorkItemOutline`, contract design from `ContractRecord`. There is no second
copy of any choice.

### The web Run page

Beside the existing Plans, Plan and Map pages, with the areas the
[main plan](../main-plan.md#web-mvp) lists: overview, plan and entries,
hypotheses against decisions, work items, checks, progress and measurements.
List and detail only; the dependency graph is a follow-up. Start and Stop are
the only commands. Connection state is shown separately from run state, and
nothing is editable.

Hypotheses are shown as tentative, with their standing and revision, beside the
accepted decisions, so a tentative forecast is never presented as a commitment
and the initial prediction is never rewritten.

### KPI projections

`Metric[]` with `policyVersion: 'kpi/1'`, computed by the harness and rendered
by the client. The metric list and definitions are in the
[main plan](../main-plan.md#kpi-storage-and-projection-versioning), reconciled
term by term with the existing
[KPI contract](../../../measurements-and-kpis.md). The measurement policy
version, `scope-size/1`, is recorded on the snapshot and travels with the
metric, so the two version independently.

Every metric carries unit, state, value, numerator, denominator, coverage and
evidence references. A missing observation is `unavailable`; a zero denominator
is `not-applicable`. An unqualified whole-run ratio is refused when coverage is
partial: the covered sessions and change weight are shown instead. Input,
cache-read, cache-write and output tokens stay separate, and subscription usage
is never converted to a hypothetical invoice.

## Acceptance cases owned

| # | Case | Evidence |
| --- | --- | --- |
| C1 | A run completes with no web client; a reconnecting client reads the same state and events | A run driven to completion while only the file system is watched; a client attached afterwards reads the same `RunSnapshot` and the same event page, also after a harness restart |
| M2 | Todo, working on and completed handle provider waits, verified reuse, reopened evidence and superseded hypotheses correctly | Four constructed states: a provider wait stays `working` with its reason; verified reuse is `completed`; `evidence-reopened` returns a completed capability to `working`; a superseded hypothesis leaves the list without becoming `completed` |
| M3 | The UI can disconnect and reconnect without affecting the run | A browser check against a run driven by the scripted agent: closing and reopening the page changes no event and no state |
| M4 | KPI projections retain their numerators, denominators, revision and coverage; unavailable data is not reported as zero | A metric with a missing size component reports `unavailable` with its known subtotal and coverage; `sum(w_e) = 0` reports `not-applicable` |

## Guards owned

| Guard | Test |
| --- | --- |
| A projection never writes, and no query appends an event | `subs/harness/src/tests/projections-pure.test.ts` |

Plus the cross-cutting JSON rule for the `start-run` command payload, and a test
that an unsupported record version surfaces as `unsupported-version` with
evidence rather than as an absent record.

## Exit evidence

- Every query answered from a Node client with the web assets absent, and the
  same answers rendered in a browser.
- An event page at the 500-item limit with `cursor` and `more`, and a gate
  detail whose output tail is bounded at 8 KiB.
- An identical retried `start-run` returning its original receipt through HTTP,
  a conflicting reuse and a stale expected version.
- A test that runs every query against a completed run and asserts that the run
  log's last sequence is unchanged afterwards.
- The web requester API view showing that `web` imports only the harness's
  exposed `src/interfaces/` files, and `npm run check:self` reporting 0 denied
  accesses.
- `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self`.
