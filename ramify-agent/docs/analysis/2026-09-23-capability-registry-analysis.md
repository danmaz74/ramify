# Required capabilities and retired forecasts

**Date:** 2026-09-23. **Status:** analysis. It refines the
[plan-scoped capability registry](../future/README.md#plan-scoped-capability-registry-with-entry-points)
candidate and states what the current harness already does. No plan
implements it yet.

## The principle

Dan, 2026-09-23:

- What must be implemented to complete a plan is its
  [top-level capabilities](../glossary.md#top-level-capability), which
  describe the plan's requirements.
- A forecast capability that is not required to complete the plan is not a
  requirement. Once that is known, it is retired.
- Retirement is a deduction: the plan completed and the forecast was not
  implemented. It needs no record of its own.
- Retiring a forecast before completion is worth having only if it helps the
  plan complete better, not merely to inform a person.

## Evidence

Three real pi runs on the `collection-review` fixture:

| Run | Plan | Model | Outcome |
| --- | --- | --- | --- |
| `20260921T083956Z-340f85` | `status-badge-tone` | `openai-codex/gpt-5.6-luna` | Completed; 1 work item; 3 hypotheses, all `tentative` at the end |
| `20260923T004949Z-985557` | `status-badge-tone` | `openai-codex/gpt-5.6-luna` | Completed; 1 work item; 2 hypotheses, both `tentative` at the end |
| `20260921T085617Z-4a526c` | `review-notes` | `openai-codex/gpt-5.6-sol:high` | Not finished (last event `invocation-started`); 6 work items; 3 hypotheses revised by global decision `gd-001` |

The records are in disposable copies under `/tmp` and are not retained.

**Both `status-badge-tone` runs** completed with every forecast still shown
as `todo, forecast only` in the progress graph. The 2026-09-23 forecasts were:

- `status-badge-tone-prop`, which restates the entry capability
  `status-badge-tone` and declares that it depends on it;
- `status-badge-existing-behavior`, which is the existing `StatusBadge`
  reused unchanged.

The 2026-09-21 run also forecast a capability that depends on the entry
(`status-badge-tone-contract`). Only the shared-ui module changed, as the
plan's constraints require, and every gate passed.

**In the `review-notes` run**, the local architect of `wi-003` asked the
global fork (`pr-001`) whether the acceptance requires one note store shared
by tRPC and MCP. That shared store is the forecast `shared-review-state-assembly`,
owned by the root. The question came after two adapter-local assignments
were returned for changes outside their assignment. `gd-001` answered that
root-shared state "is not required for this capability and would be a
separate future requirement". It recorded the forecast as `superseded`, with
no `supersededBy`. It also marked two other forecasts `confirmed`, and
neither of those ever became a registered capability.

## What the harness already does

The completion logic already follows the principle.

- The harness makes one work item per entry capability. A hypothesis creates
  no work ("no work derives from a hypothesis").
- The final gate waits for every work item and every requirement revision,
  never for a hypothesis. Both `status-badge-tone` runs completed with their
  forecasts unresolved.
- A lower-level capability becomes necessary only through required work: a
  requirement on another capability's obligation, or a registry entry that
  names a required consumer. `workState` in
  [`progress.ts`](../../subs/harness/src/projections/progress.ts) does not
  report a capability `completed` while a requirement it consumes is
  unverified against the real provider. The top-level capabilities
  therefore carry every lower-level capability they need, and completion
  needs no separate rule for lower-level capabilities.

**The required set** is the entry capabilities, plus everything reachable
from them over confirmed links: requirement-to-obligation and
registry-consumer links, the links `progress.ts` already computes as
confirmed. A hypothesis's `dependsOn` is a forecast link and never makes a
capability required.

## Where the representation disagrees

1. **The progress projection** reports every forecast that no registered
   capability shares a name with as `todo`, whatever the run's state. A
   completed run therefore shows unfinished work.
2. **Hypothesis standings** are `tentative`, `confirmed` and `superseded`.
   `confirmed` records that a forecast was accurate, not that it is required:
   `review-run-identity` was confirmed and never registered, because the
   entry `completed-review-run-notes` covered it. `superseded` is used both
   for a forecast that another replaced and for one that is not required.
3. **Only placement decisions revise hypotheses.** A run without a placement
   question, like both `status-badge-tone` runs, leaves every forecast
   `tentative`.
4. **The registry candidate** says the run ends with every capability
   "mapped or retired". That treats a forecast as something the run must
   resolve before it may end, which makes it act as a requirement.

## Retirement at completion

A forecast is **retired** when the run has completed and the forecast is
outside the required set. It is derived from the records, so no agent
decides it and no record stores it.

- **Name matching no longer matters.** Whether `status-badge-tone-prop` "was
  realized by" the entry is a naming question that exact-slug matching
  cannot answer. The deduction asks only whether required work depended on
  the forecast. Nothing did, so it is retired.
- **A confirmed forecast can be retired.** `review-run-identity` would be
  retired had its run completed. Its standing still records that the forecast
  was accurate; retirement records that it was never a requirement of its
  own.
- **Reused behavior is retired too.** `status-badge-existing-behavior`
  names existing behavior the entry keeps. It needs no implementation, and
  the work-item outline's `reuse` field already records it.
- **A failed, stopped or interrupted run retires nothing.** Its required set
  was never settled, so its forecasts stay forecasts.

## Early retirement

Retirement before completion helps the plan complete only if a forecast that
is still standing would cost the remaining work something. Only local
architects read hypotheses during a run, at the coordination points of work
items whose modules the forecast involves, and the global fork reads them in
a request. Engineers never receive them. A standing forecast can therefore
cost the remaining work in two ways:

- **It steers work.** The local architect's procedure treats a hypothesis
  that suggests an owner outside the subtree as "strong evidence against
  keeping the capability local". A wrong forecast can lead to a scope
  expansion, a failed assignment or an escalation.
- **It costs tokens.** Each involved briefing renders it, a few hundred
  tokens per forecast. This is minor.

**A local architect cannot usefully retire a forecast.** When it departs
from a forecast, it knows only that its own work item does not need it. Other
work items involving the same modules might, so a retirement by one
architect would be a guess about work it cannot see. Each architect already
judges each forecast for its own work item, and its outline records the
revisions it saw.

**The useful case already exists.** In `review-notes`, the question that
blocked `wi-003` after two returned assignments was the forecast's own scope
assumption, and the local architect's request cited the forecast in support.
The records do not show whether the forecast caused those returns. The global fork's
decision that the shared store is not required unblocked `wi-003`. The
benefit came from the decision, which answered a question that blocked work,
not from the hypothesis's standing. The revised hypothesis reached only
`wi-003`, because no other work item involved the root module. An early
"not required" verdict is therefore a placement decision, made by the
authority that decides the plan's scope, when work is blocked on the
question. The harness has that path and needs no separate
early-retirement mechanism.

**A defect weakens that path.** When a decision withdraws a forecast, the
local architect's briefing ([`work/session.ts`](../../subs/harness/src/work/session.ts))
says "a decision withdrew it, and its own rationale says why". The rationale
shown is the forecast's original one. For `shared-review-state-assembly`, it
argues that root composition must change. The decision's reason, the text
that says the store is not required, is in the revision's `cause.reason`,
and no briefing renders it. A later architect sees a forecast labelled
`superseded` whose visible text argues for the withdrawn change, and cannot
tell "replaced by another forecast" from "not required". This does affect
completion: an architect who reads the old rationale may raise the same
scope question again. Rendering `cause.reason`, and `supersededBy` when
present, fixes it without a new standing.

## Consequences

### For the progress projection now

- In a completed run, report each forecast outside the required set as
  retired, with a reason the harness writes, such as "not required by the
  completed plan". In a running or failed run, keep the forecast treatment.
- The protocol's capability state has three members: `todo`, `working` and
  `completed` (CM19 fixes that count). Retirement can be shown as the
  forecast's own treatment, beside `tentative`, rather than as a fourth
  state. The alternative is a deliberate protocol change with its own
  acceptance case.
- CM16's rule that registered `todo` and forecast `todo` stay distinct still
  holds while the run is live.

### For the registry candidate

- **Rewrite the end-of-run rule:** every required capability ends with an
  entry point, and every other named capability is retired by deduction once
  the run completes. Retirement is not an obligation on any role.
- **Entry points are needed only** for required capabilities, and for
  existing capabilities that a required one cites.
- **Coherence checks on the initial analysis are warnings.** A forecast
  binds nothing, so "nothing depends on a top-level capability" flags a
  misdrawn forecast without failing the analysis. Both `status-badge-tone`
  runs would have raised it.
- **Forecasts need not become registry entries.** The required set is
  derived from confirmed links, so a forecast stays a hypothesis until
  required work depends on a capability of that name. Required work
  registers that capability in the same way it does today.
- **Plan scope and run scope.** Retirement is derived per run. A registry
  that spans a plan's runs would retire a capability only on the run that
  completes the plan.

## Open questions

1. Should `confirmed` remain a standing? Under this analysis, it records the
   accuracy of a forecast and influences nothing. It could be kept for
   evaluation and dropped from anything that suggests it is required.
2. Should a decision that withdraws a forecast as not required use a
   distinct standing, or is `superseded` without `supersededBy`, with the
   reason rendered, enough?
3. Should the progress view show retired forecasts at all in a completed
   run, or hide them behind a toggle? They record what the initial architect
   expected, which the plan's evaluation may want.
