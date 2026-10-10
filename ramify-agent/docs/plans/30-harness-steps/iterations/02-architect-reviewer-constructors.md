# Iteration 2: local architect and reviewer step constructors

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and owners

Iteration 1 committed. Owner: harness `steps/`, `run/service.ts`
`takeWorkItem` and its orientation, selection and work-turn calls, and the
reviews child's existing preparation contracts. Read `work/session.ts`,
`context-selection/`, `subs/reviews/src/preparation.ts` and `message.ts`,
and the review request path in `run/service.ts:1302`.

## Goal

The local architect's three invocations and the three reviews are steps:
constructed by the run through the constructors, derivable from records, and
renderable from the CLI. Authored inputs are validated as the producing
role's output.

## Deliverables

- `StepInputs` members for orientation, selection (including the selector
  fork point), the work turn (fresh and continued), the three reviews and
  their design-guidance orientation. The orientation is a separate invocation,
  never an implicit extra model call inside one `step run`.
- Harness-owned `steps/local-architect.ts` and `steps/reviewer.ts`
  constructors, called from `takeWorkItem` and the review start; inline
  construction removed. Reuse the reviews child's exposed preparation and
  message contracts; it does not import harness-internal `StepInputs` or
  `ConstructedStep` types.
- `inputs` with authored files: `--work-item`, `--outline`, `--assignment`,
  `--selection`, `--review-request`. An authored assignment is validated with
  `localArchitectSubmissionSchema` in its full assign envelope and the same
  work-item/scope validators and supplied context as the run; an authored
  selection with the selector's schema. Missing context or invalid output
  prints the validator's errors, without fabricated defaults.
- `from-run` extended to these roles; starts outside the first set refused
  with the reason. Imported turns use a complete fresh briefing and retain
  their original point as provenance, as iteration 1 specifies.

## Verification

Own S05–S08. Extend the plan 23 and plan 25 prompt tests with the
architect and review equalities; extend `review-questions.test.ts` and the
reviews child's tests for the review constructors; add authored-input
refusal tests. Run the focused files from `ramify-agent/`, then
`npm run type-check` and `npm run check:self`.

## Exit and handoff

Every invocation of the first role set in a scripted run is constructed by a
step constructor. Commit and write `02-results.md`.
