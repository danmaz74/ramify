# Iteration 7: Process qualification, measurements and consumer handoff

**Plan:** [Evidence during invalid analysis](../main-plan.md).
**Prerequisites:** Iteration 6 passes; all public contracts and the complete workflow are implemented.
**Owners:** Root integration/package qualification with analysis, CLI and daemon owners fixing defects within their responsibilities.

## Goal

Prove the implementation at installed process and package boundaries, measure its resource behavior and close the complete acceptance matrix.

## Read first

- [Main plan](../main-plan.md), completion boundary, budgets and measurements.
- [Acceptance matrix](../acceptance.md), every row and evidence rules; prior results and reviewed contracts.
- [Testing guide](../../../development/testing.md), process isolation and failure reporting; [quick-test architecture](../../../architecture/quick-testing.spec.md); [memory lifecycle](../../../architecture/memory-lifecycle.md).
- Root build/package scripts, daemon IPC tests and existing measurement recipes.

## Deliverables

1. Add a focused built-process witness using isolated fixture copies and endpoint directories. Execute A→B→C→D, both reported and reportless failures, cancellation followed by repair, batch ownership and both old/new peer pairings. Verify generated-view identity rules.
2. Add a plan-specific measurement runner and register its exact command in the result. Follow the main plan's four workloads, alternating ten measured ownership/affected invocations after warm-up. Archive timings, memory, operation/stage counts and input/build/host identities; do not claim equal ownership and analysis identities.
3. Run 1,000 invalid revisions over 32 paths, overflow beyond 10,000, repair and disposal. Include smaller injected count/byte limits and multiple contexts to prove global accounting. Record actual retained-state bytes and memory observations separately.
4. Qualify an isolated packed artifact: import ownership types/schema from `ramify.ts/cli`, reuse the existing table decoder, run ownership on valid/link-invalid/broken-acquisition projects, and verify command exits and schema versions. Do not publish the package.
5. Complete regression and applicable configured audit evidence. Finalize implementation status in the specification, CLI/daemon docs and roadmap only after the plan gate passes.
6. Write `completion-report.md` and `handoff.md` with all FR IDs, exact commands/build/artifact identities, public exports, new status unions, protocol/schema migration, resource evidence and remaining limits. Preserve failures as well as successful reruns.

## Matrix rows executed here

FR17 and FR19 at process/resource boundaries, FR23–FR27, and closure of every earlier matrix row. Each variant must have an observed result, not only a registered test.

## Verification

Run from the toolkit root, preparing package dependencies under the project's workflow:

```sh
npm run type-check
npm run build
npm test
npm run check:self
npm run check:reference
npm run reference:cases
```

Run the new process and measurement commands recorded by this iteration and the isolated package smoke. Run additional reference verifier gates selected for affected shared contracts and record their scope; diagram/site checks apply if their inputs changed. Under Studio, preserve the supplied automation policy and distinguish its verdicts from local executions.

For candidate audit, use the configured toolkit auditor from a clean committed checkout under the project's instructions. A release audit, if release qualification is being performed, uses `--full` for that stated reason. Commit and publication authority comes from the execution request, not this plan.

Every owned daemon stops in `finally` and surviving processes fail the witness. Correctness, missing evidence, byte/path bound violations and cleanup failures block completion. Timing comparisons are reported without inventing a threshold or adding a cache. No expected intermediate failures remain.

## Exit criteria

FR01–FR27 and all named variants pass at their required boundaries. Required quality gates and applicable candidate audit evidence are recorded; package smoke and retention/resource checks pass. Documentation matches delivered behavior and the handoff is sufficient for an independent consumer to adopt a released pin.

## Handoff

The completion report and consumer migration document, artifact hash and qualified commit, measurement data, known limitations and release-version recommendation. Registry publication and consumer-repository implementation remain separate authorized work.
