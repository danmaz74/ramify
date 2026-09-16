# Iteration 9: Agent workflow, process and resource evidence

**Plan:** [Plan 2A: Materialized API discovery](../main-plan.md).
**Prerequisites:** Iteration 8 runnable compiled command and all frozen
measurement recipes.
**Owners:** repository agent/ignore guidance, reference harness process cases,
measurement scripts/artifacts and documentation tests.

## Goal

Prove the intended agent workflow with ordinary `rg`, quantify duplication and
resource behavior, and establish Linux/macOS deterministic output without
weakening preservation rules.

## Read first

- [Agent instructions and determinism](../../../architecture/materialized-api-view.spec.md#agent-instructions).
- I2A-11/I2A-12 leaves in [subcases](../subcases.md), iteration 1 raw probes and
  iteration 8 process handoff.
- Root `AGENTS.md`, toolkit/reference `.gitignore`, existing measurement
  generators/recipes and process cleanup conventions.

## Deliverables

1. Add the exact ordinary/test search instructions to root `AGENTS.md`, including
   complete/no-combine, generated/no-edit/no-import, refresh and coverage-limit
   language. Keep commands explicit because normal `rg` omits hidden paths.
2. Materialize isolated R and T with the compiled daemon. Prove Git remains
   clean, broad `rg` omits the view, explicit paths find independently expected
   names/signatures/docs/categories and the tests path is self-contained.
3. Derive one real relative import from a generated defining path and run
   Ramify/TypeScript checks; prove a type-only-as-value negative independently.
4. Run versioned workloads for R, T, S100, S500 and S1000: files, entries, final
   bytes, duplication, largest ordinary/tests area, warm latency, staged/written
   bytes and peak RSS/heap. Preserve explicit predecessor or current-plan
   refusal instead of inventing missing measurements.
5. Run repeated no-op/changed cycles and just-under/over limit cases; require a
   settled cleanup/memory plateau and byte-for-byte old-view preservation.
6. Run the same checked-in filesystem/process fixture on Linux and macOS and
   compare relative trees/bytes. Both platforms independently execute symlink,
   rollback and no-op cases.
7. Update measurement docs with commands, environment/runtime versions, raw
   paths, ideal timing outcomes and binding integrity outcomes. Do not turn an
   unrun performance row into a pass.

## Matrix rows executed here

I2A-11: all six leaves. I2A-12: all eight leaves.

## Verification

Run the compiled process commands under unique endpoint and work directories,
the agent-instruction/document tests and each measurement one at a time on the
recorded host. Verify source/build identity before and after. CI supplies the
macOS artifact; Linux success cannot substitute for it. Stop daemons and remove
only owned temporary output in `finally`.

## Exit criteria

The documented `rg` workflow works from ordinary and tests source without
catalog merging, all requested scale outcomes are honestly recorded, integrity
budgets pass and Linux/macOS bytes agree.

## Handoff

Process receipts, raw measurements, platform comparison and finalized agent
instructions go to iteration 10's completion gate.
