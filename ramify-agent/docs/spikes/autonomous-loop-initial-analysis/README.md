# Initial capability and module hypothesis for the autonomous loop

Status: spike output, intended as input to the later implementation plan. It
does not schedule implementation work. It reads the module tree as it stood
before the
[contract-authority refactor](../../plans/02-contract-authority-refactor/main-plan.md),
so its `contracts`, `contracts/map` and `contracts/protocol` observations and
citations describe the tree that refactor has since replaced: those files now
belong to the harness's `src/interfaces/`.

## Request

Apply the initial global-architect analysis from the
[autonomous implementation loop](../../architecture/autonomous-implementation-loop.md)
to that architecture itself. Identify the externally meaningful entry
capabilities and their owner modules, then forecast deeper capabilities that
may need to be reused, extended or created. Keep forecasts separate from
accepted placement decisions and executable work.

The resulting machine-readable artifact is
[`initial-analysis.json`](initial-analysis.json).

## Method

I refreshed the generated architect view, read its metadata first, searched
capabilities and tests there, and used the completed implementation-map plan as
predecessor evidence. The initial analysis did not require implementation
source. The later contract-authority revision inspected the existing contract
declarations, interface files and their imports to verify ownership and global
exposure. The view is
`ramify.architect-view/1` at revision
`rev/1:639da6e5-c16b-4108-bbcf-c880c7aa39ae:1`, with measured production
dependencies and a detail cut of 92
([`_meta.json`](../../../.ramify-architect/_meta.json)). The cut means an absent
detail is not evidence that behavior is absent.

The analysis follows the intended split in the architecture:

- Entry assignments are the only output from this phase that may seed
  top-level work items. They identify required behavior and its owner, rather
  than implementation tasks.
- Deeper entries are architectural hypotheses. They carry candidate placement,
  likely consumers, evidence, uncertainty and alternatives. They neither
  create provider obligations nor determine iteration order.
- Breaking-change analysis is deliberately absent. Each local architect does
  that when it has the concrete module work item and relevant consumers
  ([architecture, lines 630-647](../../architecture/autonomous-implementation-loop.md#L630)).

## Evidence

The current architecture already gives the two entry behaviors distinct
owners:

- `ramify-agent/harness` serves one project and owns all durable work records,
  mapping jobs and the HTTP service. It is therefore the natural owner of
  autonomous execution
  ([harness module, lines 9-22](../../../.ramify-architect/harness/module.json#L9)).
- `ramify-agent/web` is a client that renders harness projections, sends
  commands and owns no durable harness state. It is therefore the natural owner
  of human operation and review
  ([web module, lines 9-20](../../../.ramify-architect/web/module.json#L9)).
- `contracts/protocol` currently holds the validated HTTP JSON boundary used by
  the harness and web
  ([protocol module, lines 9-23](../../../.ramify-architect/contracts/protocol/module.json#L9)).
- `contracts/map` currently separates a durable work-loop artifact from its wire
  representation and has harness, protocol and web consumers
  ([map module, lines 9-22](../../../.ramify-architect/contracts/map/module.json#L9)).
- `harness/agent` owns the agent-session abstraction and scripted fake, while
  `harness/agent/pi` hides pi-specific session and login mechanics
  ([agent module, lines 9-21](../../../.ramify-architect/harness/agent/module.json#L9),
  [pi module, lines 9-22](../../../.ramify-architect/harness/agent/pi/module.json#L9)).

The implemented foundation also supplies behavior that should be extended
rather than rebuilt. `startServer` acquires the project lock and recovers prior
jobs; `JobService` owns command and lifecycle processing with the event log as
authority; `RamifyCli` is the sole Ramify integration
([harness behaviors](../../../.ramify-architect/harness/behavior.jsonl)). Existing
tests cover client-independent completion, idempotent command retries, bounded
stop with late-submission rejection, evidence revalidation and restart recovery
([harness tests](../../../.ramify-architect/harness/tests.jsonl)).

The Plan 1 completion report adds two useful structural observations. The
Ramify CLI and view readers now have several consumers and are the strongest
child-module candidate. The existing job machinery should be extracted when a
second job kind exists, which this autonomous run introduces
([completion report, lines 267-279](../../plans/01-implementation-map/completion-report.md#L267)).

The current `contracts` parent owns no source and relays every public export of
`map` and `protocol` through the root to all descendants. Their actual behavior
has identifiable authority: the harness accepts and persists maps and
implements the HTTP service, while the web is a client. The
[contract-authority refactor plan](../../plans/02-contract-authority-refactor/main-plan.md)
therefore moves those interfaces to the harness before loop implementation.

## Answer

### Entry capability assignments

| Capability | Required behavior | Owner | Why |
| --- | --- | --- | --- |
| `autonomous-plan-execution` | Given a selected implementation plan, analyze its entry capabilities, coordinate global and local architecture decisions, run bounded engineering and contract sessions, recover durable work, enforce completion gates, and terminate as completed or failed with evidence. | `ramify-agent/harness` | The harness already owns durable jobs, agent execution, recovery, commands and the server boundary. |
| `implementation-run-operation-and-review` | Let a person start and stop a run and inspect hypotheses, decisions, capability progress, checks, failures and KPI evidence without becoming the owner of execution state. | `ramify-agent/web` | The web module already owns human interaction while treating the harness protocol as its sole source of durable state. |

These two assignments are intentionally broad. The first is the system behavior
that produces a finished implementation run. The second is the independently
observable client behavior through which a person operates and reviews it.
Protocol shapes, orchestration, contract delegation and test gates are
dependencies of those capabilities, not additional entry capabilities.

### Deeper architectural hypotheses

The following forecast is ordered by architectural relationship, not by
implementation sequence.

| Hypothesis | Candidate owner | Expected consumers | Confidence | Reason and uncertainty |
| --- | --- | --- | --- | --- |
| Extract reusable Ramify project evidence capture. | Proposed `ramify-agent/harness/evidence` child | Mapping, global and local architects, scope checks, test selection and measurement | High | It hides the CLI, private daemon and generated-view formats; Plan 1 already found several consumers. The exact public operations still need contract design. |
| Generalize durable job lifecycle for more than mapping jobs. | Proposed `ramify-agent/harness/jobs` child | Mapping jobs, implementation runs and the HTTP adapter | High | The second job kind now exists conceptually, satisfying the earlier extraction trigger. Generic lifecycle, receipts, recovery and event storage must be separated from mapping semantics. |
| Own the map and client contracts with the behavior they govern. | Existing `ramify-agent/harness`, after the prerequisite refactor | Mapping, protocol implementation and web | High | The harness accepts and persists maps and implements the client API. Its browser-safe interface can be exposed to the web without a neutral globally relayed definitions branch. |
| Validate initial analysis separately from executable work. | Existing `ramify-agent/harness` | Initial analysis, harness persistence and review UI | Medium | The harness-owned map validator should distinguish entry assignments and non-executable hypotheses explicitly, rather than add work items. Whether this evolves the existing map document or introduces another harness-owned artifact remains a local design choice. |
| Add autonomous workflow coordination while keeping it inside `harness` initially. | Existing `ramify-agent/harness` | `autonomous-plan-execution` | Medium-high | Global/local architect scheduling, obligation traversal and state transitions are composition behavior. There is not yet evidence that one new `execution` module would hide a coherent dependency or reduce local complexity. |
| Extend the generic session port for resumable roles and semantic handoffs. | Existing `ramify-agent/harness/agent` | Workflow coordination and its scripted tests | High | The harness needs role-aware start/resume/fork, context observations, structured outcomes and blocked-attempt events without knowing pi mechanics. The scripted implementation must reproduce the same observable contract. |
| Implement pi-specific fork, deferred-context and tool-lifecycle controls. | Existing `ramify-agent/harness/agent/pi` | The generic agent port | High | Forking an oriented architect, appending a brief without inference, context thresholds, edit/write guards and post-write hooks depend on pi runtime behavior and belong behind this adapter. Exact SDK support needs an early executable probe. |
| Coordinate contract sessions and provider obligations. | Existing `ramify-agent/harness` | Local architects, engineers and provider work items | Medium | The harness must serialize writers, persist and deduplicate revision-bound obligations, schedule providers and close delegation only after consumer verification. Its durable records remain private unless another module needs a defined projection. |
| Own check selection, execution and bounded repair. | Existing `ramify-agent/harness` | Every engineering role and final acceptance | High | The architecture makes the harness, rather than the agent, authoritative for readiness, module gates, global gates and repair counters. Runner discovery and hardcoded MVP commands remain project-policy details. |
| Extend the harness-owned client protocol for autonomous runs. | Existing `ramify-agent/harness`, after the prerequisite refactor | Web, with a future CLI as another client | High | Start/stop commands, snapshots and cursor events should reuse existing command IDs, expected versions and HTTP validation. The public protocol projects private run records without owning them separately. |
| Present run operation, review and basic capability progress. | Existing `ramify-agent/web` | People operating the harness | High | Existing map and progress views establish the UI seam. The MVP needs list/detail operation and review of hypotheses versus decisions, gates and KPI coverage; the dependency graph remains a follow-up. |
| Capture execution observations and compute KPI projections. | Existing `ramify-agent/harness` | Web and future protocol clients | Medium-high | Baselines, scope identities, usage, mutations, compactions, blocked writes and gate attempts are execution facts. The harness should retain canonical observations and compute projections; clients only render them. Reconciliation with the existing KPI document is still required. |

Only the entry assignments above are accepted as this spike's executable
architectural output. Every candidate owner in this table remains a hypothesis
for the global architect or relevant local architect to confirm when the need is
concrete.

## Alternatives

### Keep all new behavior in the current modules

This remains the default for workflow coordination, contract scheduling, check
gates and KPI calculation until their internal contracts are known. It is a
poor fit for evidence capture and generic job lifecycle: predecessor evidence
already identified a hidden toolkit dependency with several consumers, and the
new design supplies the second job kind that was the stated extraction trigger.

### Add one broad `harness/execution` child

This would give the plan a convenient container, but it would combine workflow
composition, durable jobs, project evidence, checks and measurements before the
interfaces among them are understood. That moves complexity rather than hiding
knowledge. The forecast therefore keeps coordination in `harness` and proposes
only the two boundaries with existing evidence.

### Put contracts in a neutral global branch

This gives both sides one import location, but leaves behavioral authority
unclear and makes definitions globally available merely because several modules
use them. The harness owns map acceptance and the HTTP service. It should retain
private durable records and expose only its map and client contracts. A neutral
contract module remains appropriate only for an agreement whose authority is
actually independent of its implementations.

## Proposed changes

These are the remaining candidate module declarations for later local/global
placement decisions, not edits authorized by this spike:

```ramify
# subs/harness/subs/evidence/module.ramify
ramify 1
module evidence

# subs/harness/subs/jobs/module.ramify
ramify 1
module jobs

```

The prerequisite refactor removes the `contracts`, `contracts/map` and
`contracts/protocol` module declarations. Their source moves to the harness's
same-owner `src/interfaces/` area. The harness exposes the browser-safe map and
client interface to its parent, and the root re-exposes only that named surface
to descendants. The evidence and jobs APIs should expose named behavior only
after their consumers and hidden knowledge are explicit.

## Not verified

- The contract-authority revision read `module.ramify`,
  `subs/contracts/module.ramify`, the map and protocol declarations and
  interface files, and their imports from `harness` and `web`. It did not
  execute the proposed moves or establish their final generated evidence.
- Requester-specific API views were not materialized because this phase assigns
  owners and forecasts placement; it does not claim that one module can already
  import a proposed capability.
- Pi support for context forks, deferred brief append, reliable context-size
  observations and pre-tool blocking was not tested here.
- Test-runner discovery, complete Ramify hook behavior and KPI collection were
  not executed.
- The architect view's cut means source inspection may be needed when a local
  architect resolves a concrete placement or contract.

## Next step

Execute and verify the
[contract-authority refactor](../../plans/02-contract-authority-refactor/main-plan.md)
before authoring or starting the autonomous-loop implementation plan. Then use
the two entry assignments as its starting work-item frontier. Carry all deeper
hypotheses into the plan's initial analysis record, but require each relevant
local or global architect decision to confirm, revise or reject them before
they create scope or provider obligations.

Before detailed iteration planning for the autonomous loop, resolve two
foundation decisions with small executable probes: the pi adapter's
resumable-session/tool-hook surface, and the exact generic boundary between
mapping jobs and autonomous run jobs. Those probes test the highest-risk
assumptions without converting the whole hypothesis table into an upfront work
breakdown.
