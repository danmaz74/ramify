# Plan 33: consult architect

**Date:** 2026-10-10. **Status:** completed and qualified in `feat/plan33-consult-architect`.

All four serial iterations are complete; [final results](final-results.md) records
all 20 acceptance cases and the released configured full nested audit on source
`7885b9dfb102193f72535f625f422f1261cc17fc` (evidence
`7b32b969e8b2b34679f87d6e9ffbd95679bb7bba`), including skips and analysis limits.
**Execution:** four serial iterations in an isolated checkout.
**Scope decision:** R33-1 resolved; capability-assigned engineers are included.

## Outcome

Implement [Consult architect](../../analysis/2026-10-10-consult-architect.md):
an engineer can ask its assigning local or capability architect for advice;
a local architect can consult its global architect. A local consultation fork can itself ask the
global architect before answering the engineer. Every exchange is inspectable,
including its question, answer, investigation, lineage, timing and usage.

This is an ordinary asynchronous Pi tool. It awaits another invocation and
returns a tool result. It changes no assignment, architectural decision, source
or original architect conversation. Clear instructions and existing read-only
equipment express this agreement; no new semantic enforcement system is needed.

## Accepted decisions and simple defaults

The analysis records the user's decisions: advisory-only behavior, pinned
delegation points, ordinary tool execution, one-level nesting from day one,
and logging for evaluating usefulness. Preserve all of them.

This plan selects the following implementation defaults:

- Feature name `consult-architect`; Pi tool `consult_architect({ message })`.
  The answering fork submits `answer_architect_consultation({ answer })`.
  Both inputs contain one nonblank string; no agent-selected session IDs.
- Each question makes a new fork of its recorded target. Follow-ups include
  any earlier exchange the caller needs; no persistent consultation thread.
- Local forks may consult their recorded global target; global forks have
  no consultation tool. Capability consultation forks answer directly and have
  no consultation tool. No generalized recursion/depth configuration.
- A missing target means no advertised tool. A recorded target that becomes
  unavailable returns an explicit tool error. No automatic fresh substitute,
  latest-head substitution, or run-wide failure for an ordinary consultation error.
- Read existing source and available generated views through existing read-only
  tools. Supply their known paths/revisions/limits; inherited observations may be
  stale. No snapshot creation, Git command, materialization or global-view refresh
  is added to the tool handler. The caller includes relevant new facts in its message.
- Use the run's selected model and existing role bounds. Hold the caller's idle
  bound while awaiting its child, retain absolute deadlines, and pass cancellation
  through both levels. No new scheduler, budgets subsystem or suspend/resume state.
- Keep implementation in harness, with root CLI wiring for inspection. Use
  existing neutral session operations and Pi dispatch, not a new messaging module.
- Provide text and JSON inspection, without a new web page or HTTP endpoint.
  Recording is present when the tool first works, not postponed to qualification.

These are bounded choices between similar alternatives. Reopen a choice only
if implementation reveals a material difference that warrants user judgment.

## Resolved decision R33-1: capability-assigned engineers

The user selected: “Also support capability-assigned engineers consulting their
capability architect.” Include this relationship in the first version.

Eligible callers are engineers assigned by local or capability architects and
local architect orientation and work turns (assignment, completion and repair
tasks). A local architect's reconciliation and capability-qualification forks
are not callers. A capability-assigned engineer consults
the capability architect that made its assignment, including assignments inside
nested capability tasks. It does not consult the suspended consumer engineer's
local architect or another coordinator further up the capability-task stack.
An ordinary engineer returning from capability handback still uses its original
local assignment target.

The simple initial boundary is a direct answer from the capability fork. The
one-level nested path remains engineer → local → global; capability-to-global
or capability-to-parent consultation is not added implicitly by this decision.
Keep the consultation tool absent from ordinary capability-coordinator,
contract-engineer, nonfunctional, reviewer and context-selector sessions.
Capability architects are consultation targets without changing their normal
coordination workflow or treating them as local architects.

## Baseline, prerequisites and ownership

Source inspected on branch `ramify-agent`, HEAD
`969d8cda574bfc47a1764d052cfd510f95acceab`, with unrelated local changes.
This is working-tree inspection, not a clean-candidate qualification.
Prepare an isolated implementation checkout and record its actual source before
starting; preserve all existing user changes. Do not depend on proposed Plans
27, 29, 31, 32 or 34. If their implementation lands first, adapt paths to the same
owning responsibilities without expanding this feature.

| Existing surface | Use and required change |
| --- | --- |
| `subs/harness/src/run/service.ts`: `takeWorkItem`, assignment handling, `takeIteration`, capability assignment execution | Deliver the correct assigning architect point for both assignment kinds and capture the global work-dispatch point. |
| `run/log.ts` `iteration-assigned.architectRef` / `capability-assigned.architectRef`, `run/after-handling.ts` `recordAssignment` | Reuse the existing exact assignment points already used by scope reviews; do not capture duplicates. |
| `architecture/context.ts`: `globalContext` | Read the settled global context at dispatch; never look up its latest head at question time. |
| `steps/inputs.ts`, `engineer.ts`, `local-architect.ts`, `construct.ts`, `from-run.ts`, `manual.ts` | Represent consultation availability in the same recorded inputs and constructors used by execution and rendering. |
| `steps/runner.ts` | Existing per-invocation records, signal, idle hold and concurrent reader execution; add a narrow way to disable fresh fallback for consultation. |
| `run/session-operations.ts`, `prompts/tasks.ts`, `prompts/packages.ts` | Exact-point fork, task-specific procedure/submission, active tools and immutable delivery. |
| `run/log.ts`, `run/records.ts`, `transcripts/`, `run/observations.ts` | Consultation association and durable start/outcome, linked to existing content and usage. |
| `projections/`, `subs/harness/module.ramify`, root `src/cli.ts`, `src/main.ts` | Read-only inspection command exposed by harness to its parent with signature companions. |
| `subs/harness/subs/agent/src/session-operations.ts`, Pi `src/session-operations.ts` | Existing isolated operations and awaited tool dispatch; reuse without changing the neutral API unless a concrete gap appears. |

The runner releases its start lock before running a session. Neutral tool handlers
execute outside the per-operation record-update queue; forks have distinct
session identities. This supports nesting without a new execution protocol.
The runner currently retries lost context fresh: consultation must explicitly
opt out while preserving every other task's existing fallback.

Use project instructions and [testing rules](../../testing.spec.md). Search the
consumer's generated API view before adding imports or exposures. Do not edit
generated catalogs. The initial inspection found the existing session operations
in harness's ordinary API view. A new CLI command is a harness-owned contract,
exposed like `runStepCommand`; no toolkit change is needed.

## Contract

### Recorded consultation targets

Keep a small harness-owned value with an optional assigning-architect target
(local or capability) and optional global target. Each target names its actual
architect role, run, harness session, exact provider-neutral point and
originating invocation or context-append reference. It must be serializable in
step inputs; runtime handlers are bound separately.

Capture the global target at `work-item-started` and at an actual
`work-item-resumed` dispatch that launches a new local context. Reuse that
capture for continued local turns and recovery of the same dispatch. A provider
recovery/fresh fallback does not silently select a new global head. If no settled
global point exists, record absence rather than invent one.

Reuse `iteration-assigned.architectRef`, which already records the completed local
architect point that produced the accepted assignment, and its invocation identity. Preserve
that point through repair and capability-return continuations of the same
assignment; a new assignment gets its own point. Carry the local work context's
global target as well so the local consultation fork can ask upward.

For capability-assigned engineers, reuse `capability-assigned.architectRef` and
the originating invocation/task identity instead. Preserve that exact assigning
coordinator point through repairs and nested capability handback of the same
assignment. A new capability assignment gets its own point. Do not attach an
upward consultation target to the capability fork or infer one from task ancestry.

Add the missing global context to existing dispatch records and carry the resolved
targets in step inputs; reuse the existing assignment reference rather than creating
a supervisor registry or a duplicate local-point record. Old records without fields remain readable and
mean unavailable consultation. Do not mutate old admitted packets, operation
hashes or historical records to advertise a newly added tool.

Same-run manual steps may use recorded targets only when the corresponding
sessions exist in that manual run. Authored standalone inputs and imports from
another run do not import provider history: remove executable consultation
targets, retain provenance and explain unavailable consultation in rendered inputs.
Do not add a command to manufacture an architect.

### Tool and invocation

Implement a small harness-owned tool factory and consultation executor using the
existing runner/session facilities. The executor accepts the recorded target,
message, caller identity, optional parent consultation identity, and abort signal.
It runs a non-writing reader invocation with an `architect-consultation` task,
a concise advisory procedure and the answer schema. Use existing local/capability/global
roles with an explicit task kind/fork reason; do not overload placement or the
existing engineer capability-consultation task.

The local fork gets read/grep/ls and, when available, `consult_architect` bound to
its global target. The global fork gets read/grep/ls and its answer submission.
The capability fork gets read/grep/ls and the same answer submission, without
`update_capability_plan`, capability-action submission or consumer-consultation
actions. Old assignment/placement submissions are inactive through normal task binding.
The original architect sessions are neither continued nor appended.

Return the accepted answer as the tool result. Malformed answer submissions use
the normal bounded submission repair. Unavailable context, exhaustion, provider
failure or interruption yields a recorded error, not a fabricated answer.
An inner error can be reported to the local fork, which may still answer with
its own evidence and uncertainty. Caller cancellation propagates; it does not
turn into another model attempt. Check already-aborted signals before dispatch
and remove listeners/release idle holds on all exits.

### Durable observation

Use the caller invocation plus tool-call ID as the stable consultation identity.
Nested calls add a parent consultation reference. Persist a start before launching
the fork and retain the actual target, child invocation/session and outcome.
Link exact message, answer/error and investigation to existing transcripts and
accepted submission records; do not maintain a duplicate transcript format.

Distinguish answer accepted by the fork, tool result recorded for the caller,
and incomplete/failed/cancelled execution. A recorded tool result is not evidence
that the next model call consumed it. Record transcript entry IDs or positions
for the caller request and result; absence remains explicit.

Replay of a completed tool effect returns its existing result without another
fork or another consultation count. For interrupted effects, use existing
session recovery semantics and retain an incomplete/unknown delivery state.
Do not add automatic re-execution or a new recovery engine for this feature.
If the existing recovery mechanism cannot return a previously recorded result,
report that limitation rather than infer successful delivery.

### Inspection

Add a read-only command:

```sh
ramify-agent consultations --run <run-directory> [--session <session-id>] [--format text|json]
ramify-agent consultations --run <run-directory> --id <consultation-id> [--format text|json]
```

Default text lists consultations in occurrence order, nested beneath their parent:
caller/role/work, question preview, status, elapsed time, available usage and
record/transcript references. Detail prints the exact exchange, source point,
model and full references. JSON preserves the same facts and unknowns for analysis.
The session filter includes consultations called by that session and their
descendants; the unfiltered run view includes each exchange once. Unknown IDs
are errors; a valid older run with no consultation records returns an empty list.
The command reads retained records without starting agents or writing run state.

Show per-invocation usage and chain totals. Sum each actual child invocation once;
inherited historical calls are not new usage. Distinguish known subtotals from
complete totals, including provider input/cache/output categories. The harness
records no cost; none is computed. Outer latency includes the inner wait: do not add the inner duration
again to engineer waiting time. Report per-call elapsed time and, if summed, label
top-level durations as cumulative call time rather than session wall time; calls
may overlap. No interval-merging machinery is needed. Incomplete durations remain
incomplete, not zero.

No automatic usefulness rating or benefit claim. The listing points directly to
the caller's subsequent transcript so the user can judge the advice.

## Iterations and acceptance

[Acceptance cases](acceptance.md) assign each case once.
[Manifest](iterations/manifest.json) fixes serial order and write boundaries.

| Iteration | Deliverable |
| --- | --- |
| [1](iterations/01-targets-and-records.md) | Durable targets, input compatibility and consultation record contract. |
| [2](iterations/02-tool-and-nesting.md) | Working advisory tool, both relationships and one-level nesting, with logging. |
| [3](iterations/03-inspection.md) | Text/JSON inspection with linked exchanges and correct totals. |
| [4](iterations/04-qualification.md) | Integrated workflow/Pi-adapter evidence, documentation and exact-candidate full audit. |

Each iteration commits its authorized changes and writes a concise result receipt
with candidate, cases, commands/outcomes and successor inputs. There is no feature
release between iterations: day-one delivery includes nesting and inspection.
Intermediate commits must type-check and pass their focused checks; missing later
behavior is pending, never passed or hidden behind new skips.

Use small scripted ordinary tests with real session operations and in-memory
stores. A Pi adapter witness with a scripted provider proves nested tool transport,
not live-model advice quality or cache savings. Do not require a paid live run or
a benefit benchmark for this plan. The final clean committed integration candidate
must pass the configured full nested audit; skipped/unrun checks remain explicit.

