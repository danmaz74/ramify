# Iteration 4: Measure command, toolkit evidence and completion

**Plan:** [Plan 2C](../main-plan.md).
**Prerequisites:** Iteration 3's `measure` operation.
**Owners:** `cli`; plan evidence, specifications and roadmap.

## Goal

`ramify measure` prints the measurements, and the toolkit's values, latency,
budgets and hit cost are recorded.

## Read first

- Main plan: query/path/surface/resource contracts, acceptance MM10–MM13 and
  MM18, review dispositions and completion gate.
- `subs/cli/src/arguments.ts`, `run-cli.ts`, `materialize-command.ts`,
  `command-support.ts`, and their tests.
- [CLI invocation contract](../../../architecture/cli-invocation.spec.md);
  Plan 2B's [measurements and method](../../iteration-2b-generated-views/iterations/iteration8-results.md).

## Deliverables

1. `ramify measure [--root <dir>] [--format json]`: argument parsing, help,
   exit codes and outcome reporting as for `materialize`; JSON and text output.
   CLI consumes the bounded service document; it does not obtain an unbounded
   inventory or reinterpret provisional paths as owned files.
2. CLI tests, including an end-to-end run on a temporary project and MM10's
   ownership-rule check against the printed document. MM18 uses a dedicated
   temporary fixture with generated variants, dependency/output paths,
   independent compiler scopes, source symlinks, known outside files and
   initially absent then inventoried new files. Its test helper implements the
   published rule only; no production path-query API is introduced.
3. Toolkit evidence under `evidence/`: the `measure` document, the MM11
   consistency check, `measure` latency warm and after a new daemon, Plan 2B's
   budgets re-measured with the in-memory render, peak memory during rendering
   and response assembly, and hit cost for its terms. Compare hit cost with
   Plan 2B's recorded deferred overages; do not claim they were passing gates.
   Select the fixed measure/omit architect metrics policy with evidence; repeat
   MM16 for the delivered wiring. Runtime resource ceilings cannot be waived by
   choosing omit or increased silently to pass the toolkit run.
4. Completion report with the decision taken on each review item; roadmap row
   for Plan 2C; the architect-view specification's measured-values table and
   the processes-and-clients command table updated. Include all MM01–MM18,
   delivered policy, limits, classification derivation and attribution limits.

## Matrix rows executed here

MM10–MM13 and MM18.

## Verification

Focused CLI tests, then on the built toolkit `ramify measure --format json`,
`ramify materialize --view architect`, the MM11 script and
`npm run check:self`. Verification follows the project's audit path, not a
full-suite run.
The CLI fixture must preserve an explicit service resource refusal and its
non-success exit; no partial JSON document is presented as successful output.

## Exit criteria

Every acceptance case has evidence; numeric resource ceilings hold; the fixed
architect policy meets the agreed performance budget or has a recorded contract
amendment. Specifications match the delivered fields, attribution limits,
availability rules, operation and command. No open review item is silently
treated as passing.

## Handoff

The `ramify.measure/1` contract and the architect view's `metrics` for
consumers; the latency and hit-cost evidence for Plans 4 and 7.
