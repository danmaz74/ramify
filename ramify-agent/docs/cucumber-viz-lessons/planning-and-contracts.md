# cucumber-viz lessons: planning and contracts

Part of [Lessons from cucumber-viz](README.md), which explains the verdicts,
sources and path abbreviations. "The proposal" is the
[core records proposal](../plans/03-autonomous-implementation-loop/core-records.proposal.md).

cucumber-viz plans ahead of execution and has a person in the loop; its
recursive planning delegates a frame of work to a child planner. ramify-agent
plans one iteration at a time with no review wait. The lessons below are the
ones that survive that difference.

## 1. A fake records its own ending

**Adopt.** cucumber-viz's plan envelope lists every temporary substitute with
its path, the real boundary it stands for, its callers, a `deleteWhen`
condition and a `provingCheck`, and the engineer's prompt renders those fields.
Its instructions for retiring a fake list the rejection reasons met in
practice, among them: "Cutover skipped: import rewrite happened but the
substitute file was left in place, leaving a stale envelope
`temporarySubstitutes[]` entry for a later planner to rediscover." Another is
a write boundary that covered the provider and not the consumer's area, so the
deletion was out of scope.

Evidence: `core/shared/services/plan-artifacts/envelope-vocabulary.ts:231-238`;
`IS/core/runtime/prompt-assembly/prompt-assembly.ts:751`;
`prompts/planning-studio/instructions/retire-fake.md:38-43` in the package.

Consequence:

- `ContractRecord.artifacts.fake` entries gain `injectedAt`, the consumer
  locations that receive the fake, and `provingSuite`, the consumer tests that
  must pass against the real provider. `ConsumerRequirement.evidence.fakeInjections`
  already points the same way and is kept consistent with it.
- `requirement-verified` requires two things: the consumer's tests pass against
  the real provider, and no `fakeInjections` location still references the
  fake. The second is mechanical.
- A fake is deleted when its last requirement is verified. The verification
  iteration's write scope therefore includes the fake's location, which the
  consumer's module scope may not contain. A shared obligation keeps the fake
  until the last consumer verifies.
- This fits the [glossary](../glossary.md#fake): "the fake is then removed."
  No separate iteration kind is needed; `verification` covers it.

## 2. Validate an assignment before it runs

**Adopt.** cucumber-viz checks a delegated planning frame mechanically against
a closed set of issue codes before the child acts on it, among them
`unknown-target`, `target-outside-parent-authority`,
`contradictory-requirements`, `missing-parent-constraints` and
`broadened-regression-ceiling`. Corrections are counted and bounded, and
exhaustion is its own blocker.

Evidence: `PS/core/recursive-planning/validation/delegation.ts`, codes at lines
102, 185 and 414; `PS/core/recursive-planning/recursive-planning-types.ts:667-684`,
not read directly.

Consequence: a local architect's `assign` submission is validated beyond its
shape before `iteration-assigned` is appended. Errors return to the same
session, as Plan 1 does for map submissions, within the existing bound on
rejected submissions. The mechanical checks that cost little:

- The base module is the work item's module or lies beneath it, except for an
  explicit breaking scope. Every included child is an immediate child in the
  current view.
- Every `extra` path names its purpose, and a `contract`, `conformance` or
  `fake` path belongs to a contract the assignment references.
- The gate's checkpoint follows from the kind, and the test selection is the
  one the policy derives from the scope. The architect does not choose it, so
  it cannot narrow it.
- Every evidence obligation registered for the work item that the kind must
  satisfy is present.
- Every external capability exists in the registry.

## 3. Placement vocabulary has two holes, and an owner is checked

**Adopt.** cucumber-viz's 0.3.0 placement service offered seven decisions,
among them `external` and `extract-or-move`, and a capability status of
existing, missing or external. It also merged an agent's
`recommendedOwnerModule` without comparing it with the valid module IDs, so an
agent could name a module that does not exist. A consumability status,
`owner-mismatch`, was declared and never produced by any detector.

Evidence, 0.3.0 source in the repository and not read directly:
`src/domains/agent-studio/app/capability-placement-service.ts:337-338`.

Consequence:

- `PlacementDecision.outcome` is `'reuse' | 'extend' | 'create'`, while
  `Hypothesis.change` also has `create-by-extraction` and `refactor`. A
  decision cannot confirm a hypothesis it cannot express. Add `extract`, for an
  existing behavior that moves to a new owner. That outcome requires `revises`
  or a list of affected consumers.
- Add `external` for a need that a package or another system satisfies. It
  registers the capability with no owner module and can create no provider
  obligation.
- The harness validates every `owner`, `suggestedOwner` and `proposed.parent`
  against the view the submission cites. An unknown module without `proposed`
  is a submission error.
- Every value of every union has a producer and a test, or it is removed. A
  declared value that nothing produces is a false promise to the reader.

## 4. Deferred discoveries are records

**Adopt.** cucumber-viz lifts an out-of-scope recommendation, with its path,
owner module, reason and focused rerun command, into the finding's evidence, so
that it is "visible in the end-of-workflow review queue rather than living only
in the module-escape markdown". A feature covers the deferral path.

Evidence: `IS/feature-tests/workflow-out-of-scope-deferred.viz.feature`;
`IS/core/workflow/workflow-model/check-finding.ts:175-192` and
`IS/core/workflow-service/machine-wiring.ts:1055-1057`, not read directly.

Consequence: `IterationResult.findings: string[]` would keep these only as
prose. Add a small record:

```ts
interface DeferredItem {
  id: string; discoveredIn: InvocationId; workItem: WorkItemId;
  description: string; owner: ModulePath | null; paths: string[];
  kind: 'out-of-scope-defect' | 'follow-up' | 'unverified-assumption';
}
```

Engineer and contract submissions may list deferred items. The harness commits
them, the local architect receives them at its next turn, and a projection
lists the open ones. They create no work by themselves, as hypotheses do not;
the local architect decides. `job-completed` reports those still open, so a
person reviewing the run sees what was knowingly left.

## 5. Acceptance is traced per requirement

**Adopt.** cucumber-viz gives each acceptance criterion an ID, a verification
approach, the iterations assigned to it, a status of pending, met or unmet, and
its last verification output. The final gap analysis receives only the unmet
ones, with evidence.

Evidence: `IS/feature-tests/workflow-final-checkfinding-gap-analysis.viz.feature`;
the criterion type was not read directly.

Consequence: the proposal's `requirementRefs` and `acceptanceRefs` point into
the plan and have no status. Add a `RequirementProgress` projection: for each
acceptance reference of an entry capability, the work items that carry it and
the gate attempt or acceptance command that currently proves it. The `final`
gate reads it, and a run completes only when none is unproven. This is a
projection over existing records, not a new stored state. How an acceptance
reference maps to an executable check is a question the plan must answer for
its trial fixtures.

## 6. Not decomposing is a recorded choice

**Adopt.** cucumber-viz's unit planning result states its decomposition,
`root-only`, `inspect-only` or `recursive-waves`, with a rationale. Its
single-iteration fast lane skips only the per-iteration scope check, records
the skip reason, keeps the final check authoritative and ends as soon as a fix
iteration is appended.

Evidence: `IS/feature-tests/single-iteration-fast-lane.viz.feature`;
`IS/core/runtime/check-execution/iteration-check-filtering.ts:22-26`.

Consequence: `WorkItemOutline` gains
`decomposition: 'single-iteration' | 'staged'` with a rationale. The
architecture requires that decomposition is not imposed, and the acceptance
case "one small work item completes in one iteration" then has a field to
assert. No gate is skipped for a single iteration.

## 7. "Unsuitable" carries evidence and the assumption it breaks

**Consider.** A cucumber-viz child planner that cannot proceed returns a
blocker with a kind, a non-empty list of evidence references, the parent
assumption it violates, the coordination it requests and the actions it would
accept, under a coordination budget.

Evidence: `PS/core/recursive-planning/recursive-planning-types.ts:161-221`, not
read directly.

Consequence: the proposal's `unsuitable` has a reason and free text. Add
`evidence: Citation[]`, required and non-empty, and `assumptionViolated`, the
assignment field that proved wrong. Leave out the menu of allowed actions: in
ramify-agent the local architect chooses the remedy, and the engineer's
`recommendation` already carries a suggestion.

## 8. A provider knows its consumers

**Consider.** cucumber-viz's delegation request carries the inbound consumers'
needs and the complete parent constraints, and omitting either is a validation
error.

Evidence: `PS/core/recursive-planning/validation/delegation.ts:317-338`, not
read directly.

Consequence: a provider work item's origin is its obligation, which references
the contract, and requirements reference the obligation. The consumers are
therefore derivable, and the prompt assembly for a provider's local architect
should include them with their required behavior. No field is needed; the
plan's prompt inputs should name this.

## Confirms

- A closed outcome union is right. cucumber-viz recovered results from text
  with `/Status:\s*Complete/i` and used a checklist of three booleans that had
  no value for blocked, so blockage had to be restated as findings. One boolean
  later gained `"pending"` because a strict boolean made agents claim passes
  they had not verified. The proposal's `not-verified` serves the same purpose.
- Revisioned outlines are right. cucumber-viz revises a plan by replacing or
  splicing the iteration manifest and keeps no earlier version.
- Reopening every consumer requirement on a new contract revision is right.
  cucumber-viz verifies contracts at planning time only; nothing verifies a
  completed consumer again after its provider changes, and a provider that
  declares nothing is skipped with a recorded reason.
- Prompt packages identified by content hash go further than cucumber-viz,
  which stores a template's name, variant and variables and relies on git.
- Correcting malformed structured output in the same session, under a small
  bound, matches Plan 1.

## Not found

No record of merging duplicate capabilities, only a validation error for a
duplicate ID; identity is a slug the caller supplies, as in the proposal. No
findings or recurring-issue document about placement going wrong in use.
