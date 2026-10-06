# Iteration 1: Selection rule and `/3`

**Plan:** [Affected-rule selection for audits](../main-plan.md).
**Prerequisites:**
- [Iteration 0](iteration0.md) results are committed and its gate passed.
- Patches P1 and P2 in [protected documents](../protected-documents.md) are
  authorized (coordinator ramify-65, 2026-10-06). Apply them as written.
- The coordinator has settled every iteration 0 deviation.

**Write scope:**
- analysis (`subs/analysis/src/`) and Project's observer and interface
  (`subs/analysis/subs/project/src/`);
- the CLI (`subs/cli/src/`) and `src/batch-process.ts`;
- the tests and scripted drivers that name the affected schema;
- `docs/architecture/daemon.md`, `docs/development/testing.md` and `README.md`;
- the authorized patches;
- this iteration's results file.

Not in scope:
- any `module.ramify` change;
- `scripts/validate-final-contracts.ts` or the reference harness;
- `ramify-agent/`, `/ramify` and any ramify-audit checkout.

## Goal

Implement the [rule](../contracts.md#the-rule) and the
[reader contract](../contracts.md#reader-contract) exactly as written. When this
iteration ends:

- every owned path seed carries its `kind` and `selects`;
- captured inputs are marked as such and select their governed set;
- ignored paths, every `.md` path (module READMEs as `readme`, all others as
  `inert`, including beneath `src/`) and inert files select nothing;
- auxiliary source and the other existing kinds keep selecting their owner.

## Read first

- [Contracts](../contracts.md), all of it.
- [Acceptance](../acceptance.md), AR-01 to AR-07.
- `iteration0-results.md`, for the recorded facts and the baseline.
- `subs/analysis/src/affected-query.ts`: `AffectedFacts`,
  `assembleAffectedFacts`, `projectAffected`, `resolvePath`.
- `subs/analysis/src/session-engine.ts`: `affected`. It has `current.inputs`
  and the session facts' `indexes.contributors`.
- `subs/analysis/subs/project/src/inventory.ts`: `auxiliarySource`,
  `admitsJavaScript`.
- `subs/analysis/subs/project/src/observer.ts`: `#configurationData`.
- `subs/daemon/subs/contexts/src/dispositions.ts`: `analysisInput()` and
  `emptySha256`. Mirror these; do not import them.
- `subs/cli/src/affected-command.ts`: `seedLine`.

## Implementation

1. **Spec patch first.** Apply the authorized P1 hunks and P2 verbatim. Commit them as `docs(spec): …`. Check the baseline hash first; if
   it differs, stop and report.
2. **Answer type.** In `subs/analysis/src/interfaces/affected.ts`:
   - add `kind` and `selects` to each `AffectedPathSeed` variant as inline
     unions;
   - set `schemaVersion: 'ramify.affected/3'`.

   Add no new exported type name. A new name would become a signature
   companion that the root description must relay.
3. **JavaScript admission.** Add a read-only member to `ProjectObserver` that
   answers whether a project-relative path would be auxiliary source under the
   observer's current configuration, delegating to `auxiliarySource`. It must
   not read the filesystem. Use no new exported type. If the session already
   carries the configuration options elsewhere without a new member, use that
   instead and record why.
4. **Facts.** Extend `AffectedFacts` and `assembleAffectedFacts` with:
   - the revision's captured inputs, or a map derived from them;
   - the contributors index;
   - the admission predicate.

   `projectAffected` stays pure and reads nothing.
5. **Rule.** In `resolvePath`:
   - compute `kind` in the contracts' eight-row precedence order, with the
     `.md` row before the `src/` row, and leave `basis` unchanged;
   - compute `selects`, giving governed sets as byte-ordered module IDs. Follow
     [governed sets](../contracts.md#governed-sets):
     - **Configuration files** (role `configuration`, or a captured
       `package.json`, present or absent) govern by directory: the owner of
       the file's directory plus every module whose directory lies at or
       beneath it.
     - **The extends chain.** A `configuration` input other than the selected
       configuration (`scope.configuration`, made project-relative) governs
       the selected configuration's set.
     - **Other captured inputs** map contributor files to their owners
       through the inventory, and govern every module when there are none.
   - check that every `configuration` input other than the selected one lies
     on its extends chain, using the configuration data the session already
     holds. If the engine keeps no record of the chain, rely on the observation
     that the revision captures only that chain, and record this in the
     results file. If an input is found off the chain, stop and report;
   - build `seedIds` from module seeds plus every `selects`, not from
     `module`.

   Widening, coverage, limits and refusals are unchanged. Implement the
   captured-input predicate privately in analysis, with a comment naming
   `analysisInput()` as its counterpart.
6. **Readers and writers.** Move every `/2` affected schema name to `/3`:
   - `src/batch-process.ts`;
   - `subs/cli/src/interfaces/cli.ts`, `subs/cli/src/affected-command.ts` and
     `subs/cli/src/arguments.ts`, including the help text;
   - `subs/daemon/subs/contexts/src/tests/scripted-driver.ts` and
     `subs/daemon/src/tests/measure-driver.ts`.

   Find the rest with `rg -n "affected(-cli)?/2" src subs`. The IPC protocol
   stays `ramify.ipc/2`.
7. **Human output.** In `seedLine`, append `; <kind>; selects <ids, or none>`
   inside the owned line's parentheses, as contracts show.
8. **Docs.** Update the non-protected documents:
   - the affected row of `docs/architecture/daemon.md`: each seed's kind and
     selected modules, `/3`;
   - `docs/development/testing.md`: `/3`;
   - the `ramify affected` paragraph of `README.md`: one sentence saying that
     ignored paths, `.md` files and inert files select nothing and captured
     inputs select the modules they govern.

## Tests

Write expected values from the contracts and iteration 0's recorded facts, not
from output.

- **`subs/analysis/src/tests/affected-rule.test.ts`.**
  - Change the characterization's expected values to the contracts'
    examples table and the combined queries (AR-01 to AR-03). Keep one
    assertion per row.
  - Keep the data variant's recorded widening: `all-modules`,
    `['partial-coverage']`, `testModules` all five. It is existing behavior.
  - Add the two nested-manifest rows. First list the base revision's `absent`
    inputs named `package.json`. A row whose path the revision does not
    record moves to the pure cases below, with the same expected values;
    record that in the results file. Do not change the fixture to create or
    avoid such probes.
- **`subs/analysis/src/tests/affected-query.test.ts`.** Add pure cases:
  - a captured input with no contributors selects every module;
  - configuration files by directory, each with exact expected `selects`:
    - an absent `subs/a/package.json` governs `app/a` and `app/a/grand`;
    - an absent `scripts/package.json` governs `app`;
    - a root `package.json` and the selected root configuration govern every
      module;
    - an extended base configuration governs the selected configuration's
      set;
    - a `package.json` under `subs/a/src/` stays `source-area`;
  - an existence-only `dependency` input with 0 bytes is inert;
  - a `dependency` input with the empty-file sha256 is captured;
  - an absent `scripts/x.js` is `auxiliary-source` when the configuration
    admits JavaScript and `inert` when it does not;
  - a `directory` role is never captured;
  - a `.md` resource beneath `src/` that the revision captures is `inert`,
    while a `.json` resource beside it stays `source-area`;
  - every invariant listed in [path seeds](../contracts.md#path-seeds) holds
    over all answers in the file, checked by one shared assertion helper.
- **`subs/analysis/src/tests/project-boundary-affected.test.ts`.**
  - Change the header comment, which says owned-ignored and scratch select
    their owner.
  - Update the expectations for the ignored and inert rows. The expected
    values change exactly as the rule says, and no others change.
- **`src/tests/affected-batch.test.ts`.** In `A7-11:resident-batch-agree`, add
  an inert, an ignored and a captured-input seed (AR-06).
- **Schema-version touch points.** Update the tests that name the version and
  nothing else:
  - `src/tests/compiled-client.test.ts`;
  - `subs/daemon/src/tests/ipc.test.ts`;
  - `subs/daemon/src/tests/affected-service.test.ts`;
  - `subs/analysis/src/tests/affected-session.test.ts`;
  - `subs/daemon/subs/contexts/src/tests/affected.test.ts`;
  - `subs/cli/src/tests/affected-command.test.ts`;
  - `subs/cli/src/tests/arguments.test.ts`.
- **`subs/cli/src/tests/affected-command.test.ts`.** Assert the human line for
  one seed of each kind.

Focused verification, using the exact files you changed:

```sh
npm run type-check
npm run build
npx vitest run subs/analysis/src/tests/affected-rule.test.ts subs/analysis/src/tests/affected-query.test.ts \
  subs/analysis/src/tests/project-boundary-affected.test.ts subs/analysis/src/tests/affected-session.test.ts \
  subs/cli/src/tests/affected-command.test.ts subs/cli/src/tests/arguments.test.ts \
  subs/daemon/src/tests/affected-service.test.ts subs/daemon/src/tests/ipc.test.ts \
  subs/daemon/subs/contexts/src/tests/affected.test.ts src/tests/affected-batch.test.ts src/tests/compiled-client.test.ts
```

Run any other test file you changed the same way. Do not run the full suite.

## Acceptance evidence

1. **AR-05 checks.**
   - `rg -n 'affected(-cli)?/2' src subs docs/architecture docs/development README.md`
     finds only the history sentence in `cli-invocation.spec.md`.
   - `git diff --stat b4858aec -- '**/module.ramify'` is empty.
2. **AR-07.** After `npm run build`, run
   `dist/src/ramify affected --batch --format json --path <p>` for the 18
   toolkit paths. Record the table: path, kind, selects, changed, affected,
   widening. Compare it with the
   [expected toolkit table](../contracts.md#expected-toolkit-answers-with-030).
   A difference is a defect or a contracts error. Report which; do not adjust
   silently.
3. **Self-check.** `npm run check:self` still passes. The full audit runs it
   again.

## Gate

Commit the work as one or more commits, then the results file. Run the
[gate command](../main-plan.md#execution-rules-for-every-iteration) from the
clean commit. Because the toolkit's audit runs the checkout's own
`dist/src/ramify`, ramify-audit 0.4.0's strict `/2` reader would make a
default-mode audit fall back to full. The gate uses `--full`, so this does not
apply; record it as expected.

## Results file

Write `iteration1-results.md` with:

- the commits, including the spec commit and the hashes it moved;
- the changed files by owner;
- the focused commands and their outcomes;
- the AR-01 to AR-07 evidence, including the toolkit table;
- the gate verdict and report path;
- the protected-document hashes before and after;
- flaky tests, if any;
- the remaining gaps.
