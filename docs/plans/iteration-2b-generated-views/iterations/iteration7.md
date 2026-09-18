# Iteration 7: Real runs, invariance and hit cost

**Plan:** [Plan 2B: Generated architect view](../main-plan.md).
**Prerequisites:** iteration 6.
**Owners:** integration evidence under `scripts/`, `AGENTS.md`, `CLAUDE.md`
and the architecture documents.

## Goal

Establish, with the compiled CLI and daemon, that the view is correct on real
projects, leaves analysis unchanged, meets its hit-cost thresholds and
budgets, and is described to agents.

## Read first

- AV29–AV34 and the main plan's [budgets](../main-plan.md#resource-budgets)
  and [completion boundary](../main-plan.md#completion-boundary).
- The specification's [hit cost](../../../architecture/architect-view.spec.md#hit-cost),
  [determinism and bounds](../../../architecture/architect-view.spec.md#determinism-and-bounds)
  and [agent instructions](../../../architecture/architect-view.spec.md#agent-instructions).
- `scripts/reference-harness/plan2a-isolation-cases.ts`,
  `plan2a-cli-cases.ts`, `plan2a-materialize-fixture.ts` and
  `plan2a-completion-cases.ts` for the real-daemon, owned endpoint and
  invariance patterns; `scripts/measurements/plan2a.mjs`.
- `AGENTS.md` and `docs/architecture/materialized-api-view.spec.md`.

## Deliverables

1. A harness file, `scripts/reference-harness/plan2b-cases.ts` with its test,
   that runs the compiled CLI and daemon with an owned endpoint directory on
   isolated copies of the reference project and the toolkit, and establishes
   AV29–AV31 and AV34's closure and package-entry cases. The daemon is stopped
   in `finally`.
2. A measurement script, `scripts/measurements/plan2b.mjs` with an
   `npm run measure:plan2b` entry, for AV32 and AV33, writing its raw results
   under `docs/plans/iteration-2b-generated-views/evidence/`.
3. The instruction block of the specification in `AGENTS.md` and in a short
   `CLAUDE.md` section, since each trial harness loads one of them.
4. Update `docs/architecture/architect-view.spec.md` to implemented status
   with the measured values, `docs/architecture/materialized-api-view.spec.md`
   for `--view`, and the CLI section of the development guides that lists
   `materialize`.
5. Materialize the view at the worktree root for iteration 8, and record its
   revision.

## Matrix rows executed here

AV29–AV34.

## Verification

```sh
npm run build
npm run type-check
npm run check:self
npm run check:reference
npm run reference:cases
npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/plan2b.test.ts
npm run measure:plan2b
```

The full Vitest suite runs through the cucumber-viz audit, not by hand.

## Exit criteria

AV29–AV34 pass, or a budget is exceeded and the plan stops for a user
decision with the measurement recorded.

## Handoff

The materialized view at the worktree root and its revision, the evidence
files, and the hit-cost table for iteration 8's report.
