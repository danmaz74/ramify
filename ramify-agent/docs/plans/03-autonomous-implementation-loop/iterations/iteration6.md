# Iteration 6: Iteration assignments, engineers and the iteration gate

**Goal:** a local architect fixes one executable iteration, an engineer works it
within a recorded scope, and the harness owns the verdict, the repair rounds and
the context budget. Engineers edit and write behind the write guard, so repair
is real repair and an accepted iteration is a real commit. The shell, mutation
observation and hook checks arrive in iteration 7.

The guard and the tools it guards arrive together, so the rule that a guard must
be called is testable from its first day. Decided by Dan, 2026-09-20: proving
repair and the commit on work that cannot change anything would prove little.

## Prerequisites

Iteration 5: work items, outlines, local architect sessions and the work-item
gate.

## Write scope

`subs/harness/src/work/`, `subs/harness/src/guard/`, `subs/harness/src/checks/` (the `iteration`
checkpoint and `TestSelection` resolution), `subs/harness/src/prompts/`,
`subs/harness/src/kpi/` (line-event capture).

## Interfaces consumed and established

Consumed: `WorkItem`, `WorkItemOutline`, `GateAttempt`, the check engine, the
port's context policy and outcomes, its `guard` callback and its `edit` and
`write` built-ins, `loadArchitectIndex`, `readMeasurement`.

Established: `IterationAssignment`, `WriteScope`, `TestSelection`,
`IterationResult`, `LineEventSummary`, the `guard` observation, the `LocalArchitectSubmission` member
`assign`, the `EngineerSubmission` union, and the run-log events
`iteration-assigned`, `gate-attempted` and `iteration-closed`.

## Work

### The assignment

`assign` commits an outline revision, any local `PlacementDecision`s, and one
`IterationAssignment` of kind `ordinary`, `verification` or `repair`. Its scope
is the assigned module's own contents plus the **complete** subtrees of selected
immediate children: each child subtree is wholly included or excluded, and no
descendant is selected individually. `WriteScope.resolved` captures the real
paths and the view identity; `guarded` captures the guarded files' hashes.

The architect submits no test selection. `gate` and `TestSelection` are derived
by the policy from `kind` and `scope`, so narrowing is impossible rather than
detected.

Validation beyond the schema: every module in the scope exists in the refreshed
view; every `extra` path lies under a module of the run; `includedChildren` name
direct children only; `externalCapabilities` reference registry entries that
exist.

### Test selection

`TestSelection.resolved` is built as the
[main plan](../main-plan.md#commands) defines it: each exact owner's
`src/tests/`, every descendant owner's tests for an included subtree, the
ordinary `src/` of a testing module inside the selection, and `extraSuites`,
filtered by the project's Vitest `include` patterns. `resolved` is stored, so a
reader sees that an included subtree really contributed tests and an empty list
is visible. The fixture's Cucumber suite lies outside the one supported runner
and is recorded as a `coverage-gap` on every attempt over that fixture.

### The engineer

One invocation per attempt, with `builtinTools` of read, search, `edit` and
`write`, the last two behind the write guard below, one
harness tool `run_scope_tests` that runs the assignment's selection through the
lifted executor, and the `EngineerSubmission` union. The `shell` tool arrives in iteration 7, by decision 12. Its submission members here are `completion-proposed`, `partial`
and `unsuitable`; `contract-needed` is offered from iteration 9.

### The write guard

Place [resolve-contained-path.ts](../reuse/resolve-contained-path.ts) in
`src/guard/`, keeping its provenance comment. Adjust it as the main plan
requires: take `realpath` of the target, or of the existing parent of a new
file, before the lexical check, and return `blocked-unresolved` as a distinct
result. Device and inode revalidation around a rename is deferred; the remainder
of cucumber-viz's containment file is read, not copied.

The guard runs before `edit` or `write` executes. It resolves the target
against the invocation's working directory, then checks it against the recorded
`WriteScope.resolved.roots` and `files` and the assignment's `extra` contract,
conformance, fake and exposure-declaration locations. Verdicts are `allowed`,
`blocked-scope` and `blocked-unresolved`.

A block returns a concise explanation naming the target and the scope and
directing the engineer to report the need or use the delegation mechanism. It
makes no mutation, does not end the session, does not request approval and does
not widen scope. Only a recorded assignment changes write authority; a retry or
a successful read does not.

Every guarded call becomes a `guard` observation with run, work item, iteration,
invocation, role, tool-call identity, tool, requested and resolved target, known
owner, scope revision, time and reason. **No proposed file contents are
stored.** A replayed `(invocation, callId, type)` is dropped; a new tool call to
the same target is a new attempt and remains visible. The totals of guarded
calls are kept beside the blocked counts so rates by role, tool and scope can be
reported.

### The gate and repair

`completion-proposed` is provisional. The harness pauses writers, runs the
`iteration` checkpoint and owns the verdict. A failure with `cause: 'in-scope'`
returns concise diagnostics and a bounded repair round; the rerun runs the
gate's **full** required set, with no selective reuse. `infrastructure`,
`timeout` and `invalid-session` use their own bounded paths and preserve the
original cause. `outside-assignment` and `guarded-change` return to the local
architect. Exhaustion records `next: 'exhausted'`.

`iteration-closed` commits `IterationResult` with the passing `GateAttemptId`
for `accepted`. The local architect assesses the result, may revise later
iterations, and may adopt or reject an engineer's recommendation; a
recommendation never changes the assigned scope or discharges an obligation.

### The commit at an accepted boundary

After the iteration gate passes, the harness commits the working directory on
the run branch, as the fourth external effect: an intent in the log, the commit
keyed by the gate attempt, and the commit hash in the line that closes the
iteration. Nothing is compared first and nothing can block it: run the checks,
commit, and that is all. A repeat finds the commit by its `Ramify-Gate` trailer
and makes no second one. A failed gate commits nothing.

The harness writes the message mechanically, in the format of
[run the checks, then commit](../core-records.proposal.md#run-the-checks-then-commit):
the assignment's goal, the engineer's validated `summary`, then the summary of
the checks taken from the `GateAttempt`, one line per command with its outcome,
time and resolved selection, the earlier attempts with their causes, the
coverage gaps, and the trailers. A gate that passes with nothing changed makes no commit and records
`commit: null`. A resuming engineer is told that
`git diff` shows exactly the work since the last accepted boundary.

**Created modules.** When the harness makes the accepted commit it looks at the
`module.ramify` files the commit adds and deletes. Each is a `module-created` or
`module-removed` notice in the line that closes the iteration, with the placement
decision that proposed the module, or `null` when none did, and the commit
message lists them under `Modules created:`. This is read from the tree, never
from an agent's words. See the proposal's
[a created module is always reported](../core-records.proposal.md#a-created-module-is-always-reported).

Tests: a commit adding a `module.ramify` yields one notice naming its decision;
one with no decision says so; the message is a pure function of the records; a file changed while the
gate ran blocks nothing and is in the commit; a crash between the commit and its
completion makes one commit.

### Context budget

At the threshold the harness stops further work, lets running tools settle and
allows one final response with tools disabled. The invocation ends
`context-budget-reached` with the report, the threshold and the observed usage.
The counter is keyed by the work: a fresh session does not reset it, and neither
do repair rounds.

### Line events

Each writer invocation's `LineEventSummary` is captured from its two tree
snapshots. A no-change session has an empty summary and still counts in the session
metrics.

## Acceptance cases owned

| # | Case | Evidence |
| --- | --- | --- |
| G8 | One small work item completes in one iteration; another is revised across several without losing obligations | Two work items: one outline `single-iteration` with one accepted iteration; one with three outline revisions whose open evidence obligations survive every revision |
| C4 | A crash after passing checks recovers the accepted result; a later source change invalidates stale evidence | A restart between `gate-attempted` and `iteration-closed` recovers the acceptance and makes the one commit. By Dan's decision of 2026-09-20 a later source change invalidates nothing: it is uncommitted work for the next gate, and the accepted commit stays as it is |
| K3 | Exact-owner and included-child-subtree test selection are both exercised | Two assignments over `workspace/reviews`, one with no included children and one including `reviews/core`; their `resolved` lists differ by exactly the subtree's test files |
| K5b | An invalid session, a test timeout and exhausted repair limits retain distinct causes and recovery paths | `invalid-session` reconstructs the session and preserves the counters; a timeout records `not-verified`/`timeout` and one infrastructure retry; exhaustion preserves the original cause |
| X1a | An engineer threshold returns partial evidence without compaction or false completion; repeated returns do not reset limits | `context-budget-reached` with report, threshold and usage; no `compaction` observation for the role; the third return exhausts `budgetReturnsPerIteration` |
| K1 | A module gate fails, returns concise diagnostics, is repaired and reruns the complete gate | A failing assertion in scope: `cause: 'in-scope'`, `next: 'repair'`, a second attempt at `repairRound: 1` running the full required set |
| K2 | A global work-item gate exposes a failure outside the last engineer's scope; the local architect assigns repair and rechecks | `cause: 'outside-assignment'`, `next: 'return-to-local-architect'`, a new assignment covering the failing owner, then a passing work-item gate |
| X3 | Allowed and denied `edit`/`write` targets cover existing files, new files, traversal, symlinks and explicit contract or exposure locations | One table-driven case each, asserting verdict, resolved target and the absence of a mutation |
| X4 | Denied tools do not mutate, return useful guidance and stay deduplicated across replay while a new retry is counted separately | A replayed `(invocation, callId)` appears once; a fresh call to the same target appears again |
| X5 | A path-resolution failure differs from a proven scope violation | `blocked-unresolved` and `blocked-scope` are distinct verdicts with distinct reasons and distinct counts |
| M5 | Failed, stopped, repaired, context-limited and no-change sessions remain in usage and session counts | Five constructed invocations; the session set includes all five and the no-change session contributes no change weight |

## Guards owned

| Guard | Test |
| --- | --- |
| A guard nothing calls: a denied call through the real adapter for every writer role | `subs/harness/subs/agent/subs/pi/src/tests/guard-installed.test.ts` |
| Adding a work item, an iteration or a repair leaves every completed one completed | `subs/harness/src/tests/no-rewind.test.ts` |

Plus the cross-cutting JSON rule for `assign` and for every `EngineerSubmission`
member and the `run_scope_tests` tool.

## Exit evidence

- A run over the fixture where one work item is assigned, executed and accepted,
  and a second is revised across three outline revisions.
- An assignment naming a module absent from the view is rejected with its path.
- An assignment selecting a grandchild rather than a direct child is rejected.
- Two `TestSelection.resolved` lists that differ only by an included subtree.
- A gate failing three times exhausts and returns to the local architect with
  the original cause.
- A budget return followed by a fresh session that continues from files and does
  not reset the counter.
- The X3 table, every row passing, on a fixture copy with a real symlink and a
  real new file in an existing directory.
- A denied call through the **real** pi adapter, for the engineer and the
  contract-engineer roles.
- A gate that fails on a real defect, an engineer that repairs it with `edit`,
  and the one commit that follows the passing attempt, with its checks
  summarized in the message.
- `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self`.
