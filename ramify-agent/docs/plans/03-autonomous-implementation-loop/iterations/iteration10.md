# Iteration 10: Breaking work and gate integrity

**Goal:** let a local architect isolate a required break into ordinary scoped
iterations that are green at every accepted boundary, and make the gate
impossible to satisfy by weakening what it checks.

## Prerequisites

Iterations 6, 7 and 9: assignments, the write guard, gates, repair and the
contract process the breaking path deliberately does **not** use.

## Write scope

`subs/harness/src/work/` (the `breaking` kind and its scope form),
`subs/harness/src/checks/` (the `breaking-iteration` checkpoint and
guarded-change authorization), `subs/harness/src/prompts/`, and the new fixture
plan `fixtures/collection-review/plans/reviewer-identity/plan.md`.

## Interfaces consumed and established

Consumed: `WorkItemOutline.breakingChanges`, `IterationAssignment`,
`WriteScope`, `GateAttempt.guardedChanges`, `TestSelection`.

Established: the `breaking` assignment kind, the explicitly broad
`WriteScope.base` form `{ modules, rationale }`, the `break-discovered`
`EngineerSubmission.unsuitable` reason, and the guarded-change authorization
rule.

## Work

### Detection and isolation

The local architect's initial work-item analysis is the detection point.
Compatible additions are the default; a preference for a cleaner interface is
not a reason to break a guarantee. When the request requires a break, the
outline records the changed guarantee, the reason, the affected consumers and
the citations that establish them, and plans the stages: compatible preparation
where useful, then the break, then the removal, ordered by dependency and
isolated from compatible feature work as far as practical.

Breaking iterations use ordinary agentic implementation, not the
contract, fake and provider protocol. They keep a bounded goal, an explicit
write scope, context limits, writer controls and durable outcomes. Their scope
may be the explicitly broad form spanning affected modules, with a narrow change
goal; that is a planned exception recorded with its rationale, never permission
for an engineer to widen its own writes. Ramify's importability rules still
apply.

### The gate at every boundary

Every accepted breaking iteration passes the `breaking-iteration` checkpoint:
all project tests, the type check and a complete Ramify check. The local
architect plans coherent intermediate states rather than accepting an iteration
with expected failures. A crash, a budget return or an insufficient-scope report
leaves a partial result, never a completed iteration. Where temporary
compatibility is inappropriate, the interface change and the affected consumer
adaptations belong in one explicitly scoped, narrowly focused iteration; if that
scope proves unmanageable the architect revises the approach and the harness
does not waive the gate.

### A break discovered during work

An engineer or a contract sub-session that discovers a break submits
`unsuitable` with reason `break-discovered`. It returns to the local architect,
which revises the remaining iterations and their execution approach. The
engineer does not switch approach or widen its writes, and a contract
sub-session still does not edit other consumers or implement the provider.

### Gate integrity

The engineer may add or update tests to implement the assigned behavior. It may
**not** narrow discovery, disable a required suite or weaken an established
conformance obligation. The assignment captures the guarded files' hashes before
the iteration starts: the test-runner and compiler configuration, the package
manifests and the required contract artifacts. At the gate, `guardedChanges`
compares them with the tree, `after: null` for a deletion, and `authorizedBy`
naming the record that authorized the change or null. An unauthorized change is
`cause: 'guarded-change'`, the verdict is never `passed`, and it returns to the
local architect for a recorded revision consistent with the original request and
the existing contract authority. There is no general sealed-file mechanism and
no automated judgment of a test's quality.

Tests whose expectations the request explicitly supersedes are revised; every
unrelated guarantee remains binding. Recording a break does not discharge its
consequences: affected consumers must be adapted and verified before the run can
complete, and previously completed work may acquire new evidence obligations
through `evidence-reopened`. Apply iteration 9's work-binding rule to those
obligations: unfinished items receive current assignments, completed items get
follow-up verification work, and run completion waits for the new evidence.
Historical completed items are never reset.

### The fixture feature

`plans/reviewer-identity/plan.md`, written in the style of the fixture's two
existing plans. It requires `ReviewOutcome` in
`workspace/reviews/core` to carry a structured reviewer in place of a plain
field, which breaks the review router and MCP surface in `workspace/reviews`
and both review views beneath it. Its acceptance names the behavior that must
hold afterwards. It is a real break across four owners, small enough to stage:
introduce the new representation with temporary compatibility, migrate the
consumers, then remove the old representation.

## Acceptance cases owned

| # | Case | Evidence |
| --- | --- | --- |
| K6 | An attempt to narrow test discovery or disable a required suite is rejected unless an accepted requirement or contract revision authorizes it | An engineer edit to the fixture's Vitest configuration is `cause: 'guarded-change'` and the gate does not pass; the same edit under a recorded obligation revision carries `authorizedBy` and passes |
| K7 | A breaking feature is isolated into coherent iterations and all project tests pass at every accepted boundary | The `reviewer-identity` fixture driven by the scripted agent: an outline with `breakingChanges` and staged iterations, each accepted boundary carrying a passing `breaking-iteration` gate |

## Guards owned

The cross-cutting JSON rule for the `breaking` assignment kind, the broad scope
form and the `break-discovered` reason. The named rule-break case is a broad
scope with no rationale.

## Exit evidence

- The `reviewer-identity` run: three accepted iterations, each with a passing
  all-project gate, and a final state where no consumer still uses the old
  representation.
- A deleted guarded file recorded as `after: null` and not passing as an absent
  file.
- A `break-discovered` return from an engineer that revises the outline without
  widening the engineer's scope.
- An explicitly broad breaking scope accepted with its rationale, and one
  rejected for lacking one.
- `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self`.
