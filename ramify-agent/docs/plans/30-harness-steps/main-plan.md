# Plan 30: harness steps as a library and a CLI

**Date:** 2026-10-10. **Status:** implemented in iterations 1–5 on `feat/plan30-harness-steps`;
the real-plan exercise is not started and awaits the user's go-ahead.
Source inspected at `5bd14875d16bf96ae3c8e0de90661aa3d21cf269`.
**Execution:** authored serial iterations in an isolated checkout, one
implementing session per iteration.

This plan implements Layers A and B of
[Exercising the harness one step at a time](../../analysis/2026-10-10-step-wise-dogfooding.md).
[Plan 31](../31-operator-driver/main-plan.md) follows with Layer C.

## Outcome

A generalist coding agent, or a person, runs one step of the harness from the
command line while implementing a real plan: it renders the packet a role
would receive, runs that role once with the harness's own equipment, guard,
hook, judge and bounds, runs the gate the harness would run, and applies the
handling the harness performs after the submission. Each step reads its
inputs from files and writes the records a run writes, so it can be exercised
again after a harness fix. Exact replay of the old tree or provider history
is not a requirement. The agent operates through the CLI and reads the run's
files; keeping the web client current is not a requirement.

The run itself builds its invocations through the same constructors. A step
run from the CLI and the same step inside a run receive the same packet,
tools, validator and bounds by construction.

Concretely, after this plan:

```sh
ramify-agent step inputs  --role engineer --from-run <run dir> --invocation inv-0007 --out inputs.json
ramify-agent step inputs  --role engineer --work-item wi.json --assignment assignment.json --out inputs.json
ramify-agent step render  --inputs inputs.json
ramify-agent step run     --inputs inputs.json --agent pi|fake --run <manual run dir> [--script <file>]
ramify-agent step gate    --run <manual run dir> --checkpoint iteration|work-item|readiness|final
ramify-agent step after   --run <manual run dir> --invocation inv-0001
```

## Why this scope

The current loop is "fix the harness, rerun the plan": 15 to 60 minutes per
attempt, one failure per attempt, and a run that cannot be resumed after the
fix because recovery requires byte-identical prompt packages
(`subs/harness/src/run/service.ts:2672`, `:4214`). The October real runs show
that most prompt defects were visible in the rendered packet and that the
fatal defects of the Plan 28 self-run sat in the harness's handling after a
submission, not in the model's turn
([self-run report](../../analysis/2026-10-10-plan28-self-run.md)). A step
runner that renders, runs, gates and applies the after-handling covers both.

The existing `session` command is the seed: it runs one engineer from a
synthetic assignment with the harness's equipment and validator
(`subs/harness/src/sessions/single.ts`). It cannot take an architect-authored
or recorded assignment, runs no other role, and writes records nothing else
reads (`sessions/records.ts:12-14`). This plan replaces its internals with the
step runner and keeps its command line.

No token, cost or quality improvement is asserted. The deliverable is the
ability to execute and observe one step, then run it again with the current
harness and working tree.

## Decisions taken

These were suggested in the proposal and are adopted here. Any of them can
be reversed before implementation starts.

1. **First roles:** the engineer iteration (fresh, repair continuation,
   resumed after handback), the local architect's work turn with its
   orientation and context selection, the iteration and work-item gates, and
   the three reviewers and their design-guidance orientation. Analysis roles, the capability architect, the
   failure analyst and the nonfunctional roles are later plans.
2. **Manual step runs write into the real run layout** under
   `plans/<plan>/.harness/jobs/<run>/`, in a run record marked `manual`.
   Recovery skips manual runs. CLI output and the recorded files are the
   inspection surfaces; manual runs need no run-list or run-page integration.
3. **The after-handling is in this plan**, extracted where it is a function
   of records and reported as not run where it is not.
4. **No MCP surface.** The CLI is the interface; Plan 31 adds the operator
   channel.
5. **No exact replay requirement** (R30-1 resolved, 2026-10-10). Recorded
   inputs support new executions. Importing from another run starts fresh
   with the complete task briefing, keeping the original start/point as
   provenance only; it does not import or reconstruct provider history.
   Continuation/fork execution remains supported for available compatible
   points within the same manual run. Missing or incompatible context starts
   fresh with that reason recorded. Neither path changes the source run.
6. **CLI-first manual operation** (R30-2 resolved, 2026-10-10). Keep the
   implementation simple when an agent runs the workflow: retain durable
   records and terminal output, without adding manual-run UI projections,
   lifecycle phases or synchronization. The UI may omit manual runs.
7. **Real implementation in an agent-created worktree** (R30-3 resolved,
   2026-10-10). The agent creates a worktree for the real project and plan,
   following the project's ordinary development instructions. The expected
   outcome is useful implementation to review and retain; an unsuccessful
   attempt can be discarded. Workspace preparation belongs to the agent,
   so this plan adds no `step prepare` command or `--self` setup mode. The
   documentation lists the harness's own preconditions, which are not
   ordinary project setup: the plan under `plans/<id>/plan.md`, a committed
   audit configuration, the project configuration file and a parent commit
   for the patch check.
8. **No working-tree snapshot** (review, 2026-10-10). Without tree
   restoration the snapshot is evidence that costs a registered Git witness
   and buys little. The invocation record names the base commit and whether
   the tree was dirty at start. Before a retry, the agent resets the tree
   itself, since a failed step leaves its edits behind.

## Current implementation and ownership

All production changes belong to the harness, its reviews child and the root
command line. The evidence and web modules are unchanged. Discover foreign access through the consuming module's API view
before adding an import. Paths are relative to `subs/harness/src/` unless
stated.

| Existing surface | Use in this plan |
| --- | --- |
| `run/service.ts` `takeIteration` (`:8912`), `implementationTools` (`:7722`), `taskBrief` (`:4735`) | Replace the inline construction of the engineer invocation with a call to the extracted constructor. |
| `run/service.ts` `takeWorkItem` (`:5707-6392`), orientation (`:5373`), selector (`:5543`), work turn (`:6072`) | Same for the local architect's three invocations. |
| `run/service.ts` `runInvocation`, `startInvocation`, `runSession` (`:4164-4670`) | Extract the invocation runner shared with the step runner: records, transcript, judge, equipment binding, bounds, outcome. |
| `run/service.ts` `assignIteration` (`:7484`), `closeIteration` (`:10547`), `requestReviews` (`:1012`), the ownership query after an edit | Extract the record-only after-handling the `after` command applies. |
| `run/service.ts` `committingCheckpoint` (`:11348`), `commitGate` (`:11529`); `checks/gate.ts`, `checks/checkpoint.ts` | The `gate` command runs the same checkpoint over a manual run. |
| `work/engineer.ts` `iterationMessage`, `validateEngineer`, `IterationBriefing`; `work/session.ts` `workItemMessage`; `context-selection/prompts.ts`, `submissions.ts` | Builders the constructors call. Unchanged in meaning. |
| `work/engineer-equipment.ts` | The engineer's tools, guard and hook; built by the constructor's equipment inputs. |
| `run/session-operations.ts` `HarnessSessionOperations.start`, `prompts/tasks.ts` `buildTaskPacket` | Delivery stays as it is; the constructor supplies its inputs. The correlation packet is read by `inputs --from-run`. |
| `sessions/command.ts`, `sessions/single.ts`, `sessions/records.ts` | `session` keeps its command line and is reimplemented on the step runner; its private record layout is retired. |
| `run/records.ts` `runLayout` (`:936-981`), `job.json` | Gains the `manual` marker and the step inputs record. |
| `guard/write-guard.ts:146` | Report the cause when the placement query throws. |
| `interfaces/protocol/transcripts.ts` `started` entry | Carries the tool declarations and continuation additions. |
| `subs/reviews/src/preparation.ts`, `message.ts` | Existing review preparation consumed by harness-owned reviewer step constructors. |
| `src/cli.ts`, `src/main.ts` (root) | The `step` command family. |

## Contract to implement

### Step inputs

`StepInputs` is a discriminated union by role and start, with a zod schema
per member, schema id `ramify-agent.step-inputs/1`. It holds only what is on
disk or authored:

| Role and start | Inputs |
| --- | --- |
| engineer, fresh | plan and run identity, work item, outline, iteration assignment, context selection, assigned scenarios and obligations, API view identities, write scope and test policy, bounds overrides |
| engineer, repair continuation | the fresh inputs plus the failed gate attempt and the session point |
| engineer, resumed after handback | the fresh inputs plus the handback record and the session point |
| local architect, orientation | work item, outline, local briefing inputs, view identities |
| local architect, selection | orientation point, element catalog |
| local architect, work turn | work item, outline, selection, prior iteration results, open findings, session point or fresh |
| reviewer (code, scope, design) | review request, candidate identity, questions, guidance inputs |
| reviewer, design orientation | captured guidance inputs and orientation key |

Path fields in the inputs explicitly identify their project or run base and
are relative to it. Reject absolute paths and escaping traversal in those
fields. This does not ban absolute-path text in captured messages or source
content. Nothing in the inputs is a closure or an in-memory identifier.

### Step constructors

For each member, a pure function from `StepInputs` and a `StepEnvironment`
(project root, run directory, loaded prompt packages, view readers) to a
`ConstructedStep`:

- the `TaskPacket` inputs the delivery already takes (role instructions,
  message, declarations, procedure, blocks);
- the equipment inputs: tools, write scope, guarded paths, test policy,
  working directory;
- the validator and its evidence;
- the bounds and the context policy;
- the start mode: fresh, continue or fork, with the point;
- the records the invocation writes before it starts.

`RunService` calls these constructors wherever it built the invocation
inline. Validate and persist the structured inputs before starting each
supported invocation, beginning with iteration 1. Supplying a TypeScript
type alone does not establish JSON serializability. The environment supplies
resolved runtime locations; it does not silently replace recorded inputs.

### `inputs`

- `--from-run <run> --invocation <id>` reads the run's records and the
  invocation's correlation packet and derives the inputs, preferring the
  recorded structured inputs when present. Never reverse-engineer structured
  assignments from prompt prose. It refuses, with
  the reason, an invocation whose role or start is outside the first set, or
  whose task records are incomplete. Compare the rendering with the recorded
  packet and print `equal` or the differing sections as a diagnostic, not an
  admission gate. A fresh re-execution renders the full briefing, even when
  the original turn delivered only continuation additions. Retain the
  original start and actual selected start distinctly.
- Authored inputs: `--work-item`, `--assignment`, `--selection` and the other
  files are validated with the schemas and validators the harness applies to
  the producing role. Validate an authored assignment in its producing
  `assign` submission envelope, with the supplied outline/report context;
  do not pass an extracted assignment directly to the whole-submission schema.
  Use the same scope preparation and work-item validation as the run, including
  current view, registry, obligation and policy inputs. Refuse missing context
  with the validator's errors rather than manufacturing permissive defaults.
  The engineer is then tested on a briefing a run could have produced.

### `render`

Prints the role instructions, the message, each tool declaration and the
submission schema as they would be delivered for a fresh start, and for a
continuation the additions alone, marked as such. No model call, no lock, no
records.

### `run`

- Takes the project lock and creates or reuses a manual run directory in the
  real layout with `job.json` marked `manual`.
- Refuses an existing implementation run as its output directory. Records
  the project, plan, base and candidate branch identities and checks them
  before reuse; branch setup uses the existing harness Git operations.
- Materializes the views the role needs, as the run does.
- Starts one invocation through the extracted invocation runner with the
  constructed step and the chosen agent: `pi` with an optional model, or
  `fake` with a script file.
- A review needing a design orientation does not silently start a second
  invocation. Run that orientation as its own step, or use the ordinary
  complete fresh review briefing when reusable context is unavailable.
- Prints a condensed live transcript: tool calls with truncated input, tool
  errors, guard denials, hook findings, appended harness text, each
  submission with its verdict, and a summary with usage and changed paths.
  The full transcript, blobs, observations, shell and hook output go to the
  run directory as in a run.
- The invocation record names the base commit and whether the tree was
  dirty at start. Each execution receives a new invocation ID and uses the
  current tree; nothing restores an earlier one.
- Exit status: 0 submitted, 1 ended any other way, 2 refused or not started.

### `gate`

Runs the named checkpoint over the manual run using `checkpointPolicies`.
Iteration and work-item checkpoints commit the candidate on the run branch
and request the project-default audit; final commits and requests the full
nested audit. Readiness audits the existing baseline in full nested mode
without making a candidate commit. Write the gate attempt with its exact
subject, proposed-by invocation and candidate identity. Allow
`--invocation <id>` to select an iteration proposal; refuse ambiguous subjects
and missing prerequisite records rather than choosing the latest invocation.

Before an iteration audit, apply the accepted proposal's scenario bindings
as the ordinary run does. A gate result never creates or retracts the
architect's semantic completion reports. Work-item/final prerequisites,
including required review settlement, are not waived for manual runs.

`--no-commit` runs only the in-place diagnosis used by `session --gate`:
setup, type check and complete Ramify check. It is not a configured audit,
does not qualify a committed candidate and cannot authorize an accepted
iteration close or review request.

### `after`

Applies the harness's handling that follows the named invocation's accepted
submission, as far as it is a function of records:

| Submission | Applied | Reported as not run |
| --- | --- | --- |
| local architect `assign` | accepted obligation/scenario reports, outline and iteration assignment records | scheduling the engineer |
| local architect `request-completion` | accepted obligation/scenario reports, completion blockers and the outline revision the run records | review settlement, reconciliation, work-item gate and completion |
| engineer `completion-proposed` | proposal bindings before the gate; after a matching passing committed iteration gate, ownership evidence for that candidate, iteration close and review requests | gate execution, repair sessions, review sessions; close/reviews when qualifying evidence is absent |
| engineer `partial`, `unsuitable` | the result record and the local architect's next-turn inputs file | the architect session |
| engineer `capability-needed` | the provisional-source capture | the capability workflow |

Every error, including an ownership query that throws on an invalid module
description or a ledger bound exceeded, is reported with its cause and the
command exits 1. The command never invents a record the run would not write.
In particular, the current run writes no separate work-item gate-request
record. Missing, failed, stale or diagnosis-only gate evidence cannot close
an engineer iteration as accepted. Return the recorded next action instead.

`run`, `gate` and `after` hold the same project lock and require writer
settlement before applying effects. `after` validates the accepted submission
against its recorded hash and handles repeated calls for the same invocation
without duplicating transitions or reviews. Each existing ledger transaction
remains atomic; a later failure retains earlier committed transitions and
reports the last completed one. Do not promise rollback of the whole command
or add a second transaction system. Unsupported submission kinds are reported
as not run, never silently treated as completed handling.

### Working checkout

Before invoking the step commands, the agent creates a worktree in the real
project and performs its usual documented dependency/configuration setup.
The project and plan are the actual implementation target. The harness uses
that checkout and its declared configuration; it adds no project-copying,
fixture configuration or special self-run preparation workflow. The existing
`trial prepare` remains a separate fixture-testing utility.

The agent uses `inputs`, `render`, `run`, `gate` and `after` to advance the
real plan, inspect results and correct problems. It retains the implementation
branch for ordinary review and integration when the result is good. The
agent and user decide whether to discard an unsuccessful attempt; the
harness does not automatically delete the worktree or its work.

### Records and recovery

- A manual run has `job.json` with `kind: 'manual'`, no drive and no
  phase progression. Preserve the existing `kind: 'implementation'` for
  ordinary runs. `RunService.load` skips manual execution/recovery and
  reports that fact. The CLI accesses the explicitly named run directory;
  files remain available for direct inspection and postmortems. No separate
  server discovery or UI projection is required for manual runs.
- The step inputs are written to `invocations/<id>/inputs.json`.
- The transcript's `started` entry carries the tool declarations; a
  continuation records its additions. Readers of the current entry remain
  valid by making the new fields optional for historical entries; absence
  means unavailable evidence, not an empty declaration list. Update the
  harness-owned shared schemas/readers together. Already deployed strict
  readers cannot be promised compatibility with newly added fields.
- `plans/.harness/sessions/` is no longer written. Existing directories are
  left in place.

### Repairs folded in

- `guard/write-guard.ts:146`: a thrown placement query yields a refusal that
  names the error, in the guard decision and the transcript, instead of
  "outside every location" for every path.

## Failure cases the design must prevent

| Problem | Required behavior |
| --- | --- |
| The step runner drifts from the run | One constructor per step, called by both; the inputs schema forbids closures and absolute paths in path fields |
| An authored assignment no run would produce | `inputs` refuses it with the producing role's validator errors |
| A rerun is mistaken for exact replay | Record the current base and dirty state; distinguish original start from actual fresh/continued start. No tree restoration or provider-history import |
| A manual run is resumed as a real run | `load` skips `manual` runs |
| `after` hides the error that would have ended a run | Every error exits 1 with its cause and the record it was writing |
| `render` output differs from what a session receives | The started entry carries declarations; a test compares `render` to the recorded started entry of a scripted run |
| The guard refuses every path without saying why | The refusal names the thrown error |

## Relationship to other work

- [Plan 15](../15-prompt-workbench/main-plan.md) is superseded by this plan
  for capture, overlay-free replay and render. Its prompt overlay directory,
  bench, experiments and reports are not implemented here; a later plan may
  add them over `step run`.
- [Plan 27](../27-projections-extraction/main-plan.md) moves query
  ownership out of `run/service.ts`. The two refactors touch different
  regions of that file; serialize edits if both are in flight.
- [Plan 29](../29-common-prompt-passages/main-plan.md) changes prompt
  composition inside the builders the constructors call. It does not change
  the constructor boundary.
- The fixed analysis worker heap reported in the self-run has been fixed
  separately and is not part of this plan.

## Implementation sequence

Serial iterations; they share `run/service.ts`. Record each commit, focused
checks and remaining issues in the iteration's result receipt during
implementation.

| Iteration | Deliverable | Prerequisite |
| --- | --- | --- |
| [1: engineer constructor and render](iterations/01-engineer-constructor.md) | `StepInputs` for the engineer, its constructor used by the run, `inputs --from-run`, `render` | Baseline full audit |
| [2: local architect and reviewer constructors](iterations/02-architect-reviewer-constructors.md) | Orientation, selection, work turn and the three reviewers as steps; authored-input validation | 1 |
| [3: invocation runner and `run`](iterations/03-step-run.md) | Shared invocation runner, manual runs in the real layout, `session` on the runner, live transcript | 2 |
| [4: gates and after-handling](iterations/04-gate-and-after.md) | `gate`, `after`, guard cause, transcript declarations | 3 |
| [5: documentation and qualification](iterations/05-documentation-and-qualify.md) | Agent-owned worktree workflow, documentation, Plan 15 status, final audit, real-plan implementation | 4 |

The [manifest](iterations/manifest.json) records dependencies and case
ownership; the [acceptance cases](acceptance.md) distinguish deterministic
harness checks from real implementation evidence.

## Verification and boundaries

Follow the [testing specification](../../testing.spec.md). Ordinary tests use
the scripted agent, scripted Git and fixtures; none launches a model, Git,
Ramify or the audit. Each iteration runs `npm run type-check`,
the changed owners' focused tests and `npm run check:self` from
`ramify-agent/`.

Take a baseline full audit from the clean committed implementation base and
qualify the final committed candidate from the repository root:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

No other whole-suite run. Iteration 5 applies a real plan, or a bounded
deliverable from it, to a real project in an agent-created worktree. It
spends model calls and is asked for before it starts. Record
the resulting implementation, project verification, review outcome and model
cost. Scripted tests qualify the harness behavior; the responsible agent's
review assesses whether the implementation fulfills the chosen work. Neither
an invocation ending nor passing harness tests alone establishes that result.

Outside scope: exact replay, tree snapshots and restoration, cross-run
provider-history import; the operator driver and its channel (Plan 31), analysis and
capability roles as steps, prompt overlays and experiments, resuming a real
run after a harness change, workspace provisioning by the harness, MCP,
and changes to the web client.
