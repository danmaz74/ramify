# Iteration 5: Exposing fixture, latency and memory evidence, completion

**Plan:** [Plan 8](../main-plan.md).
**Prerequisites:** iteration 4.
**Owners:** evidence (`scripts/probes/fixtures/`, `scripts/measurements/`);
the roadmap.

## Goal

Measured evidence that the rule keeps the hook within its budget and the
retained facts within theirs, on a fixture that actually exposes symbols.

## Read first

- Main plan: the retained dependency evaluation, SC23 to SC26, the completion
  gate.
- `scripts/probes/fixtures/synthetic-owners.ts`;
  `scripts/measurements/README.md`, `fast-fixture.mjs`, `fast-workloads.mjs`,
  `fast-assertions.mjs`.
- [Hook optimization measurements](../../iteration-5-hook-optimization/iterations/measurement-results.md)
  and the [structural-edit latency analysis](../../../analysis/structural-edit-latency.md)
  for the pre-plan rows.
- [Memory lifecycle](../../../architecture/memory-lifecycle.md) limits.

## Deliverables

1. An `exposures` option of the synthetic generator. Each owner exposes its
   `interfaces/api.ts` by wildcard and its nine `run<N>` functions by name to
   parent; each `run<N>` signature names both `api.ts` types and one type of
   the preceding owner; a grouping level re-exposes each tenth owner's
   contract. The generated project passes the rule. The default, exposure-free
   output stays byte-identical so Plan 5's archives remain comparable.
2. Two edit classes added to the hook workload for that fixture: a signature
   edit that adds a named original, and a `module.ramify` edit that removes a
   companion's exposure and restores it.
3. Pre-plan values measured on the same host from the plan's base commit, then
   SC23 to SC25 on the final build: the 14 existing rows and the two new ones
   on the reference example and the exposing fixture at 100 owners; stage
   timings including `companions`; `factBytes` on the reference example, the
   toolkit and the exposing fixture; the plateau and many-contexts rows.
4. If the `companions` stage exceeds SC24, record the measurement and the
   reverse-index alternative from the main plan's evaluation as a proposal.
   Do not implement it here.
5. The completion report, and the roadmap's Plan 8 row, brief and handoff row
   advanced to implemented.

## Matrix rows executed here

SC23 to SC26.

## Verification

The measurement scripts with archived raw results, against the installed
executable and a real daemon. SC26 runs Plan 1's reference gate and the
focused suites of Plan 5 and the structural-edit plan through the audit tool,
not the whole toolkit suite. S500, S1000 and macOS are not run and are
reported as not run.

## Exit criteria

SC23 to SC26 have archived evidence beside pre-plan values from the same
host. The completion report covers SC01 to SC27 and RD-1 to RD-7.

## Handoff

The plan's handoff section, with the measured index lookup and pass costs.
