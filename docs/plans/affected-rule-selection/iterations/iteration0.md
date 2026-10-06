# Iteration 0: Contract and baseline

**Plan:** [Affected-rule selection for audits](../main-plan.md).
**Checkout:** `/home/app/ramify-affected`, branch `feat/affected-rule`, at the
commit that adds this plan.
**Write scope:**
- the new test `subs/analysis/src/tests/affected-rule.test.ts`;
- this iteration's results file.

No production source changes. No changes to `module.ramify`, protected
documents, `ramify-agent/`, `/ramify` or any ramify-audit checkout.

## Goal

1. Prove that the plan starts on a passing tree.
2. Fix today's 0.2.0 affected answers on the extended topology with a
   characterization test.
3. Record the revision facts that the rule depends on, so that iteration 1's
   expectations are reasoned from recorded facts and not from its own output.

## Read first

- [Main plan](../main-plan.md), especially the planning decisions and execution
  rules.
- [Contracts](../contracts.md), especially the rule, captured inputs, governed
  sets and the examples table.
- [Acceptance](../acceptance.md), case AR-00.
- The Phase 1 [written topology](../../project-boundary-ramify/fixtures.md#topology).
- `subs/analysis/src/tests/project-boundary-affected.test.ts`. It builds that
  topology with `opened` and `revised` from `./session-test-fixture.js`. Reuse
  its construction pattern; do not import from it.
- `subs/analysis/src/affected-query.ts`, `subs/analysis/src/session-facts.ts`
  (`buildIndexes`, `contributions`) and `CapturedInput` in
  `subs/analysis/subs/project/src/interfaces/project.ts`.
- To find other symbols, run `rg -n -i '<terms>' .ramify-architect/` after
  `npm run build && dist/src/ramify materialize --view architect`.

## Steps

1. **Plan-start audit.** On the clean plan commit, run the
   [gate command](../main-plan.md#execution-rules-for-every-iteration). It must
   pass. Record the verdict and report path. If it fails, stop and report;
   do not repair.
2. **Characterization test.** Create
   `subs/analysis/src/tests/affected-rule.test.ts`.
   - **Topologies.** It builds the extended topology and the data variant from
     [contracts](../contracts.md#examples-on-the-extended-topology) in a
     temporary directory.
   - **Queries.** It asks every path seed of the examples table, plus the
     three combined queries, through the session's `affected` query with the
     production limits.
   - **Assertions.** It asserts today's `/2` answers: status, module, basis,
     exclusion, `changedModules`, `affectedModules`, `testModules`, selection
     and widening.
   - **Expected values.** Write the expected values by reasoning from the
     current rule in `cli-invocation.spec.md`: every owned seed selects its
     owner. Do not copy output. A mismatch is either a reasoning error or a
     finding; record which.
   - **Purpose.** Name the test so that iteration 1 can change the expected
     values in place. Its purpose is the before and after comparison.
3. **Record facts.** For both revisions, add assertions, or a recorded dump in
   the results file, for:
   - the role, bytes and sha256 of each of these in the revision's
     `CapturedInput` list, or that they are absent from it:
     - `tsconfig.json`;
     - `tsconfig.base.json`;
     - `package.json`;
     - `data/limits.json`;
     - `.devcontainer/devcontainer.json`;
     - `README.md` and `subs/a/README.md`;
     - `module.ramify`;
     - `scripts/run.sh`;
     - `notes/design.md`.
   - `indexes.contributors['data/limits.json']`, and whether any contributor
     key is owned, outside every `src/`, not compiler source and not under an
     exclusion. List up to ten if so; these are the paths rule row 6 will
     select through contributors.
   - the coverage notes of the data variant, and whether it widens with
     `partial-coverage`.
   - whether the toolkit's `package-lock.json` is a captured input. Check
     against the batch check in step 4.
4. **Toolkit baseline.** Build (`npm run build`). Then run
   `dist/src/ramify affected --batch --format json --path <p>` for each of the
   15 paths in the
   [expected toolkit table](../contracts.md#expected-toolkit-answers-with-030).
   - Save each answer under the scratchpad.
   - Record in the results file a compact table: path, status, module, basis,
     exclusion, changed, affected, widening.
   - Record the toolkit's captured-input role counts from
     `dist/src/ramify check --batch --format json`, read from
     `snapshot.inputs`, together with the role of each `tsconfig*.json`,
     `package.json` and `package-lock.json`.
5. **Focused verification.**

   ```sh
   npm run type-check
   npx vitest run subs/analysis/src/tests/affected-rule.test.ts subs/analysis/src/tests/project-boundary-affected.test.ts
   ```

6. **Gate.** Commit the test and the results file, then run the gate audit
   from that clean commit.

## Exit criteria

- AR-00 passes.
- The plan-start and gate audits pass.
- Every fact in step 3 is recorded.
- Every contracts cell that iteration 0 must settle is settled, either
  confirmed or recorded as a deviation for the coordinator:
  - the `package.json` row;
  - the `data/limits.json` row;
  - the `.devcontainer` row.

## Results file

Write `iteration0-results.md` with:

- the commits;
- the plan-start and gate audit verdicts with their report paths;
- the focused commands and their outcomes;
- the recorded facts from step 3;
- the toolkit baseline table;
- the protected-document hashes before and after;
- any expected value that differed from the reasoned one, and why;
- flaky tests, if any;
- the remaining gaps.
