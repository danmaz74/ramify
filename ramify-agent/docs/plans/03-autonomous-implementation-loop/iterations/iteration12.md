# Iteration 12: Integrated trials and the completion gate

**Goal:** compose the whole loop, run it for real, and record what it produced
and what it could not do.

## Prerequisites

Iterations 0 to 11, each with its results note.

## Write scope

`subs/harness/src/tests/`, `subs/web/src/tests/`, `scripts/`,
`fixtures/collection-review/plans/status-badge-tone/plan.md`, and
`docs/plans/03-autonomous-implementation-loop/` for the results note, the trial
material and the completion report. No production source change except a defect
the trials find, which is recorded as such.

## Work

### The composition suite

One suite that runs the recovery tables of all ten state machines together on
the scripted agent, with no pi and no network. It asserts:

- every crash point of every table recovers to its stated state, with no
  duplicate work, obligation, decision or brief;
- every value of every union has been written and read back, and the union list
  is complete: a value with no producer fails the suite;
- every acceptance case's owning test is present and passing, by name;
- no query appends an event, over a completed run with every query exercised.

### The small fixture plan

`plans/status-badge-tone/plan.md`, in the style of the fixture's existing plans:
`workspace/shared-ui`'s `StatusBadge` gains a `tone` prop with its own tests.
One module, no child subtree, no delegation. It exists to check that
decomposition is not imposed where it is not needed: the outline records
`single-iteration` and one accepted iteration completes the work item.

### The real pi trial

`review-notes` on a disposable copy of the fixture, with a real pi session,
driven through the browser, as Plan 1's live trial was. It must show one
consumer, one real delegation, a named fake, one registered provider obligation,
the provider implemented and the consumer verified against it on return, with a
**restart forced after contract registration**. Retain the run directory: the
records, the gate attempts, the observation logs and the measurements.

If the pi login is unavailable in the execution environment, the trial is
recorded as not done with the reason. It is never simulated, and the completion
report says so.

### The breaking trial

`reviewer-identity` on a disposable copy, with all project tests green at every
accepted boundary. Record the outline, the stages, each gate attempt and the
final state.

### Verification that the loop respected the target project

As Plan 1's `npm run trial -- verify` does: compare every file outside the
harness's directories and Ramify's generated views before and after, and report
changed and added counts and a `git status`. Here the loop **does** change
source, so the comparison is against the recorded write scopes: every changed
path is inside a scope, or it appears in `outsideScope` and in the evaluation
projection. A change in neither is a defect.

### The human review record

A review sheet beside the trials, in the style of Plan 1's: the trial record and
the agent's own factual observations filled in, and the reviewer's questions and
verdict left blank for the person. The questions cover the decisions, the work,
the checks and the metrics. **No review wait is added to execution**; the sheet
is read after the run.

### The measured re-evaluation

Run `ramify measure` and record the exact and subtree sizes of every module
after the plan, beside the sizes the main plan recorded before it. Name every
boundary inside `harness` that has since earned itself, with the evidence, as a
brief for a follow-up plan. Do not extract one here.

### The completion report

`docs/plans/03-autonomous-implementation-loop/completion-report.md`, following
Plan 1's: the completion gate item by item with its result, what the person must
do, the handoff to the next plan, the measured module candidates, and the known
limitations. The limitations must include, at minimum: which tools were guarded
and which activity was only observed; the fixture's Cucumber suite outside the
one supported runner; every port behavior iteration 0 reported unavailable; the
KPIs deferred; and anything the trials could not exercise.

## Acceptance cases owned

| # | Case | Evidence |
| --- | --- | --- |
| T1 | The scripted fake supplies deterministic state, failure and recovery coverage | The composition suite, run with no pi and no network |
| T2 | At least one real pi end-to-end non-breaking feature with a consumer, delegation, provider and verification on return | The `review-notes` trial with its retained run directory and the restart after registration |
| T3 | The breaking path on a controlled fixture with globally green iteration boundaries | The `reviewer-identity` trial with a passing all-project gate at every accepted boundary |
| T4 | Human review of the resulting decisions, work, checks and metrics is recorded, with no review wait in execution | The review sheet, with the agent's observations kept apart from the reviewer's verdict |

## Final composition gate

The suite asserts the whole [acceptance matrix](../main-plan.md#acceptance-matrix):
each case's owning test exists, passes, and belongs to the iteration the matrix
names. A case with no test, or a test in the wrong iteration, fails this gate.

## Exit evidence

- The composition suite passing.
- The three trials, each with its retained evidence, or a recorded reason a
  trial could not run.
- The before-and-after measurement table.
- The completion report and the review sheet.
- `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self`
  from `ramify-agent/`, with `check:self` reporting complete coverage and no
  findings.
