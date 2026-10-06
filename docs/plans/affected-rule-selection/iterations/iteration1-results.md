# Iteration 1 results: selection rule and `/3`

**Date:** 2026-10-06. **Checkout:** `/home/app/ramify-affected`, branch
`feat/affected-rule`. **Base revision:** `f82cb0af` (iteration 0 done, plan
corrected after it). Uncommitted evidence is under
`/home/app/ramify-affected-evidence/iteration1/`.

## Commits

| Commit | Content |
| --- | --- |
| `e3ac50d6` | `docs(spec)`: the authorized patches P1 (three hunks in `docs/architecture/cli-invocation.spec.md`) and P2 (the status line of `docs/model/glossary.md`), applied verbatim. |
| `f49cfbb6` | `feat(affected)`: the rule, `ramify.affected/3` and `ramify.affected-cli/3`, the observer member, readers, human output, help and tests. |
| `11b93d02` | `docs`: the affected row of `docs/architecture/daemon.md`, the affected row of `docs/development/testing.md` and the `ramify affected` paragraph of `README.md`. |
| `cb292684` | `test(cli)`: the PB1-20 human affected lines in `src/tests/project-boundary-cli.test.ts`, which the first gate found (see [gate](#gate)). |
| this commit | `docs(plan)`: this results file. |

No `module.ramify`, `scripts/validate-final-contracts.ts`, reference harness,
`ramify-agent/` or ramify-audit file changed.

## Protected documents

### The spec commit

Both baseline hashes matched before patching. Each "Old" block of P1 and P2
occurred exactly once; a script took the "Old", "New" and "Insert" blocks from
`protected-documents.md` byte for byte and replaced them. Hunk 3 was inserted
after the paragraph that begins "Project boundaries moved every machine
document", as P1 says.

| Document | Before (`f82cb0af`, = baseline at `b4858aec`) | After (`e3ac50d6` and `HEAD`) |
| --- | --- | --- |
| `docs/architecture/cli-invocation.spec.md` | `7386295542372967c25040735d89e8e9e5230323d4320e57490bf2c031f32e6a` | `dac3ae58473c74d5f03f82d695e715a41cab98466df48cd4477efd7d8bdabd9f` |
| `docs/model/glossary.md` | `fd3a1bad54fc8651ae6c33f7c19a75c8268ffc50b89f2342c574cc2ccc7747e0` | `247587c20b8864b2d0a07f7688fe3e3eeb8b61aadb42603387fa72be0c192cfc` |

Review of the applied patches:

- `git diff f82cb0af e3ac50d6` shows only the three P1 hunks and the P2 line
  change; nothing else in either file moved.
- The rule list in hunk 2 matches the contracts' eight rows, in their order.
- The history sentence of hunk 3 sits between the project-boundary history
  paragraph and the `--no-snapshot` paragraph.
- The implementation follows the patched wording. One reading the wording
  leaves to the contracts: "A configuration the compiler configuration extends
  governs what the configurations extending it govern" is implemented as the
  selected configuration's set, which the contracts state.

### Inventory

All tracked `.principles.md` and `.spec.md` files and the glossary, before
(`f82cb0af`) and after (`HEAD`). Only the two authorized files changed.

| File | Before | After |
| --- | --- | --- |
| `docs/agents/module-architect.principles.md` | `3858898770ab5f2a54fd375ba5aa6a4c3f72a5ac00f04f974405ac95aa580d25` | unchanged |
| `docs/architecture/architect-view-diff.spec.md` | `da621110a5557ae955e2c39f4abb718b3d4c3f74396114e05d66d3a1fc19b573` | unchanged |
| `docs/architecture/architect-view.spec.md` | `f8989ad661566eaf668ad6c213994e345988a4f31d7d733e175302225a826794` | unchanged |
| `docs/architecture/cli-invocation.spec.md` | `7386295542372967c25040735d89e8e9e5230323d4320e57490bf2c031f32e6a` | `dac3ae58473c74d5f03f82d695e715a41cab98466df48cd4477efd7d8bdabd9f` (P1) |
| `docs/architecture/materialized-api-view.spec.md` | `abf24295d49ff32ad1202c8c8209d76e68ed4c18a2aa0ab758811b0527a92bb5` | unchanged |
| `docs/architecture/modularity-report.spec.md` | `00fc9dba0b42145267e9e83a9b454d2d332deecc845adeadf14cfcf60472c1b4` | unchanged |
| `docs/architecture/quick-testing.spec.md` | `b04db2008bacef3146dbfc211206187ac28abb41866f91b07568f56d1d271002` | unchanged |
| `docs/model/cross-module-importability.principles.md` | `c3b6539448902130822c183f6d3613f49c4686cb91eef17d5f73cfe546b441ea` | unchanged |
| `docs/model/cross-module-importability.spec.md` | `4aba3df0be6ff7356e7107f8d7c2786ff45ab35c9ede0b319454547b5029d789` | unchanged |
| `docs/model/glossary.md` | `fd3a1bad54fc8651ae6c33f7c19a75c8268ffc50b89f2342c574cc2ccc7747e0` | `247587c20b8864b2d0a07f7688fe3e3eeb8b61aadb42603387fa72be0c192cfc` (P2) |
| `docs/model/module-description.spec.md` | `19e292a9bc44bff47d60398b7cc1a507523e1aa73e11cc4b2c56e0988c10b07c` | unchanged |
| `docs/model/typescript-source-interpretation.spec.md` | `c1fd4d6551d130bbcd723c8b1a56075e858c06e2a6eaacb50fb147ea0e3a1a95` | unchanged |
| `ramify-agent/docs/architecture/plan-context-catalog.spec.md` | `0ce605884b1f2996401040d5ba4d2a49e59906c7a12fb223c28d3c0c1ef4fa14` | unchanged |
| `ramify-agent/docs/check-findings.principles.md` | `6c72c2175de7ecbe3e0746cba469fac7a9051a47c529b3769d11f6b7107bbfea` | unchanged |
| `ramify-agent/docs/check-findings.spec.md` | `ad0c9df605cd60385775c676a7920fbd7865857f84fe02b721b475e2c3c132df` | unchanged |
| `ramify-agent/docs/harness.principles.md` | `80222a6460a08f9c6221f50a8d2ba8ae6d698f632a86c2552521e3cf621d1a84` | unchanged |
| `ramify-agent/docs/harness.spec.md` | `78b1de2aef9c013fd40048cf8d664e819d00887259036bb590aaa46529e8e6ed` | unchanged |

`git diff --name-status -M f82cb0af HEAD -- '*.principles.md' '*.spec.md'`
lists only `M docs/architecture/cli-invocation.spec.md`; the same command for
the glossary lists only `M docs/model/glossary.md`.

## Changed files by owner

| Owner | Files |
| --- | --- |
| `ramify` (root) | `src/batch-process.ts`; tests `src/tests/affected-batch.test.ts`, `src/tests/compiled-client.test.ts`, `src/tests/project-boundary-cli.test.ts`; docs `README.md`, `docs/architecture/daemon.md`, `docs/development/testing.md`, the two protected documents |
| `ramify/analysis` | `subs/analysis/src/affected-query.ts`, `interfaces/affected.ts`, `session-engine.ts`; tests `affected-fixtures.ts`, `affected-query.test.ts`, `affected-rule.test.ts`, `affected-session.test.ts`, `project-boundary-affected.test.ts`, `session-test-fixture.ts` |
| `ramify/analysis/project` | `subs/analysis/subs/project/src/interfaces/project.ts`, `observer.ts` |
| `ramify/cli` | `subs/cli/src/affected-command.ts`, `arguments.ts`, `interfaces/cli.ts`; tests `affected-command.test.ts`, `arguments.test.ts` |
| `ramify/daemon` | tests `subs/daemon/src/tests/affected-service.test.ts`, `ipc.test.ts`, `project-boundary-wire.test.ts` |
| `ramify/daemon/contexts` | tests `subs/daemon/subs/contexts/src/tests/affected.test.ts`, `scripted-driver.ts` |

`subs/daemon/src/tests/measure-driver.ts` names no schema literal, so it did
not change.

## Implementation

- **Answer type.** `AffectedPathSeed` gains `kind` and `selects` as inline
  unions, exactly as the contracts' TypeScript shape; the selection's
  `schemaVersion` is `'ramify.affected/3'` and the document's
  `'ramify.affected-cli/3'`. No exported type name was added.
- **JavaScript admission.** `ProjectObserver.auxiliarySource(path)` delegates
  to `inventory.ts`'s `auxiliarySource` with the observer's current
  `#configurationData`. The session holds the configuration options nowhere
  else: `SessionFacts`, `SessionRevision` and the source adapter carry no
  compiler options, and the adapter can be released.
- **Facts.** `AffectedFacts` gains `inputs` (the revision's captured inputs),
  `contributors` (`indexes.contributors`) and `auxiliarySource`.
  `assembleAffectedFacts` takes the inputs and the predicate; the session
  passes `current.inputs` and the observer's member. `projectAffected` stays
  pure.
- **Rule.** `resolvePath` keeps `basis` and adds `kind` and `selects` by the
  eight rows in order. The captured-input predicate is private to
  `affected-query.ts`, with a comment naming `analysisInput()` in
  `subs/daemon/subs/contexts/src/dispositions.ts`; it counts the same read
  roles plus `absent`. `seedIds` is the module seeds plus every `selects`.
- **The extends chain.** The engine keeps no record of the chain:
  `ConfigurationData` holds only `options`, `files` and `references`. The
  configuration helper records role `configuration` only for the `.json`
  files other than `package.json` that the compiler reads while parsing the
  selected configuration (`api.parseConfigFile`), which are that
  configuration and the configurations it extends. Referenced configurations
  are read from the raw metadata and never parsed. The implementation
  therefore relies on the observation that the revision captures only that
  chain. Measured: the extended topology has two `configuration` inputs
  (`tsconfig.json`, `tsconfig.base.json`, its base), the toolkit one
  (`tsconfig.json`). No input lies off the chain.
- **Human output.** `seedLine` appends `; <kind>; selects <ids, or none>`
  inside an owned line's parentheses.
- **Help.** The `affected` help paragraph states the kinds and names
  `ramify.affected-cli/3`.

## Focused verification

| Command | Outcome |
| --- | --- |
| `npm run type-check` | passed, all four compiler scopes |
| `npm run build` | passed (`build.log`) |
| The brief's eleven files (`npx vitest run subs/analysis/src/tests/affected-rule.test.ts … src/tests/compiled-client.test.ts`) | first run: 2 failures in `affected-session.test.ts`, both `toEqual` seed expectations missing the two new members; after adding them, `affected-session.test.ts` 23 passed; the other ten files passed (`focused-1.log`) |
| `npx vitest run subs/analysis/src/tests/affected-worker.test.ts subs/daemon/src/tests/project-boundary-wire.test.ts src/tests/batch-cli.test.ts src/tests/resident-assembly.test.ts` | 4 files, 36 tests passed (`focused-2.log`) |
| `npx vitest run subs/analysis/subs/project/src/tests/observer.test.ts subs/analysis/subs/project/src/tests/project-boundary-observer.test.ts subs/analysis/src/tests/project-boundary-session.test.ts subs/analysis/subs/descriptions/src/tests/descriptions.test.ts` | 4 files, 81 tests passed (`focused-3.log`) |
| `npx vitest run src/tests/project-boundary-cli.test.ts` (after the first gate) | 1 file, 5 tests passed |
| `npm run check:self` | passed: 15 owners, 0 errors, 0 warnings, 41 analysis limits (`check-self.log`) |

## Acceptance evidence

### AR-01 to AR-03 on the extended topology

`subs/analysis/src/tests/affected-rule.test.ts` now asserts every row of the
contracts' examples table on a real retained session, one assertion per row,
plus the three combined queries and the data variant. Every expected value was
written from the contracts before the run, and every one matched on the first
run:

- 32 base-revision rows: each with status, module, basis, exclusion, kind,
  selects, changed, affected and test modules, selection and widening.
- `../outside.ts`: outside, widened `unowned-path`.
- Combined queries:
  - notes plus api: changed [app/a], affected [app, app/b];
  - README plus scratch: three empty lists, `dependency-closure`;
  - module `app/b` plus `.devcontainer`: changed [app/b], affected [].
- The data variant: `data/limits.json` is `captured-input` selecting
  [app/b], changed [app/b], affected [], widened `partial-coverage` with
  all five test modules (existing behavior, as recorded in iteration 0).
- Every answer passes the shared seed-invariant helper `expectSeedInvariants`.

**Nested manifests.** The base revision records both `subs/a/package.json`
and `scripts/package.json` as `absent` (asserted in the test as a recorded
fact). Both rows therefore run on the fixture revision, not on pure facts:

- `subs/a/package.json` selects [app/a, app/a/grand], affected [app, app/b];
- `scripts/package.json` selects [app], affected [].

The base revision records 18 inputs whose path ends in `package.json`; the
root manifest is read with content (30 B), and both rows' paths are `absent`.

`subs/analysis/src/tests/affected-query.test.ts` adds the brief's pure cases,
each with exact expected kind, selects, changed and affected:

- no contributors: every module;
- readers: the contributors' owners only;
- configuration files by directory:
  - absent `subs/a/package.json`: app/a and app/a/grand;
  - absent `scripts/package.json`: app;
  - content-read root `package.json` and the selected root configuration:
    every module;
  - with the selected configuration at `subs/a/tsconfig.json`, it and the
    root base it extends both govern exactly app/a and app/a/grand;
  - an absent `subs/a/src/package.json`: `source-area`;
- a 0-byte `dependency` probe is `inert`; one with the empty-content sha256 is
  captured;
- an absent `scripts/x.js` is `auxiliary-source` when JavaScript is admitted
  and `inert` when it is not; `scripts/x.ts` is `auxiliary-source`;
- a `directory` input is never captured;
- a captured `.md` resource beneath `src/` is `inert`, while a `.json`
  resource beside it is `source-area`;
- only `readme`, `inert` and `ignored` seeds together: three empty lists with
  `dependency-closure`.

`answered()` and `select()` in that file run `expectSeedInvariants` on every
answer, which asserts each invariant of the reader contract's path-seed list.

### AR-02 and AR-04: existing tests

The existing pure cases keep their behavior where the rule keeps it, and
change exactly as the rule says where it does not:

- A README seed is `readme` and selects nothing.
- An uncaptured `package.json`, `docs/notes.md` and `.` are `inert`.
- An owned-ignored seed and a scratch seed are `ignored` and select nothing.
- `subs/c/tests/loose.ts` and `subs/ab/srcx/x.ts` are `auxiliary-source`.
- A module directory `subs/a` is `inert`.
- The scratch-import and partial-coverage cases now seed the module, or show
  that the scratch seed alone selects nothing while the answer still widens.

The import edge into an owned-ignored tree is unchanged.

`project-boundary-affected.test.ts`:

- The header comment now states the kinds.
- The written rows for prose, owned-ignored, scratch and `grand/new.txt` now
  select nothing; the union changes to [app, app/a].
- The PB1-08 prose and ignored query selects no test modules.
- In PB1-19, the prose rename and the declared and child-module stages select
  nothing, and `subs/b/vendor/lib.ts` is `auxiliary-source`.
- In PB1-17, `['.', 'package.json', 'tsconfig.json']` now selects every
  module, because both files are captured inputs that govern every module, and
  `.` alone selects nothing. This is a captured-input change, not an ignored
  or inert one; see [deviations](#deviations).

Source-area, auxiliary-source, description and module-ID answers, widening,
invalid seeds, unknown module IDs and the resource limits pass unchanged apart
from the new members and the version. The new JavaScript admission case is
`AR-04:javascript-admission`.

### AR-05: schema

- `rg -n 'affected(-cli)?/2' src subs docs/architecture docs/development README.md`
  finds one hit, the history sentence at `docs/architecture/cli-invocation.spec.md:202`.
- `git diff --stat b4858aec -- '**/module.ramify'` is empty.
- The IPC protocol stays `ramify.ipc/2`; `project-boundary-wire.test.ts`
  still asserts it and passes.
- `A7-10:human-kinds` asserts the human line for one seed of each owned kind;
  the other human cases assert the extended line format.
- The JSON document keeps exactly the six members (`A7-10:json-document`,
  `A7-11:reference-json`).

### AR-06: resident and batch agree

`A7-11:resident-batch-agree` adds a fourth seed set:

- `docs/notes.md`: inert;
- `subs/core/src/tmp/x.ts`: ignored, scratch;
- `tsconfig.json`: captured input, selecting all five modules.

The resident and batch selections are byte-identical, and the test asserts the
three kinds and selections. It passed.

### AR-07: toolkit answers

`npm run build`, then `dist/src/ramify affected --batch --format json --path <p>`
for each of the 18 paths at `f49cfbb6` (the working tree of that commit). JSON:
`toolkit-answers/01.json` to `18.json`.

- Every answer exits 0 with `ramify.affected-cli/3`, batch mode, inputId
  `input/1:a9545adec9e4…`, `ramifyVersion` `0.2.0`.
- Every answer is `all-modules` with 15 test modules.
- Module IDs drop the `ramify/` prefix; `ramify` is the root.

| Path | Kind | Selects | Changed | Affected | Widening |
| --- | --- | --- | --- | --- | --- |
| `docs/agents/README.md` | ignored | [] | [] | [] | partial-coverage |
| `subs/presentation/subs/layout/README.md` | readme | [] | [] | [] | partial-coverage |
| `tsconfig.json` | captured-input | all 15 | all 15 | [] | partial-coverage |
| `package.json` | captured-input | all 15 | all 15 | [] | partial-coverage |
| `scripts/build-production.ts` | auxiliary-source | [ramify] | [ramify] | [cli, daemon, explorer, integration-tests, service-api] | partial-coverage |
| `scripts/probes/fixtures/synthetic-owners.ts` | auxiliary-source | [ramify] | [ramify] | [cli, daemon, explorer, integration-tests, service-api] | partial-coverage |
| `vitest.config.ts` | auxiliary-source | [ramify] | [ramify] | [cli, daemon, explorer, integration-tests, service-api] | partial-coverage |
| `scripts/probes/fixtures/compiler-api/consumer.ts` | ignored | [] | [] | [] | partial-coverage |
| `subs/cli/src/tmp/x.ts` | ignored | [] | [] | [] | partial-coverage |
| `.devcontainer/devcontainer.json` | inert | [] | [] | [] | partial-coverage |
| `CLAUDE.md` | inert | [] | [] | [] | partial-coverage |
| `tsconfig.scripts.json` | inert | [] | [] | [] | partial-coverage |
| `.` | inert | [] | [] | [] | partial-coverage |
| `subs/presentation/subs/project-view/src/tests/fixtures/dependency-models.json` | source-area | [presentation/project-view] | [presentation/project-view] | [explorer, integration-tests, presentation] | partial-coverage |
| `subs/presentation/subs/layout/module.ramify` | description | [presentation/layout] | [presentation/layout] | [explorer, integration-tests, presentation, presentation/project-view] | partial-coverage |
| `subs/service-api/package.json` | captured-input | [service-api] | [service-api] | [ramify, cli, daemon, explorer, integration-tests] | partial-coverage |
| `subs/daemon/package.json` | captured-input | [daemon, daemon/contexts] | [daemon, daemon/contexts] | [ramify, cli, explorer, integration-tests, presentation, presentation/project-view, service-api] | partial-coverage |
| `scripts/package.json` | captured-input | [ramify] | [ramify] | [cli, daemon, explorer, integration-tests, service-api] | partial-coverage |

Every kind and every selection equals the
[expected toolkit table](../contracts.md#expected-toolkit-answers-with-030).
The contracts list no changed or affected values for these rows; the
auxiliary-source rows keep 0.2.0's root + 5, and the two unchanged rows keep
their 0.2.0 closures. No difference to report.

## Gate

The gate command, from a clean tree, with ramify-audit 0.4.0 and `--full`.
JSON: `gate-audit.json` and `gate-audit-2.json`.

| Run | Commit | `composition.verdict` | Run ref | Report commit |
| --- | --- | --- | --- | --- |
| 1 | `11b93d02` | `fail` (1 outstanding failure) | `refs/audited/runs/2026-10-06T14-36-59Z-11b93d028` | `e97117d6` |
| 2 | `cb292684` | **`pass`** (0 outstanding failures; `summary.overall: pass`) | `refs/audited/runs/2026-10-06T14-43-42Z-cb2926844` | `69fa85a2` |

- **Run 1** failed one test:
  `src/tests/project-boundary-cli.test.ts` > "PB1-20: affected states each path
  seed's status, with outside and whitespace seeds, in both modes". It asserts
  the human affected lines through the real CLI process, and still expected
  the `/2` line format. This was a miss in this iteration, not a flaky test:
  the brief's touch-point list did not name the file, and my search for seed
  assertions matched JSON members, not human lines. `cb292684` updates the
  three owned lines to the kinds the rule gives (owned-ignored `ignored`,
  prose `inert`, `subs/a/scripts/report.ts` `auxiliary-source` selecting
  app/a). The file then passed alone (5 tests).
- **Run 2** ran fresh and passed every check:
  - patch integrity;
  - build;
  - type-check;
  - structure;
  - tests: 204 files, 2823 tests, 0 failed, 312 s.

The results commit changes only this file. The gate therefore stands on
`cb292684`; the coordinator may audit the results commit as well.
As J11 expects, the toolkit's own audit runs the checkout's `dist/src/ramify`,
which 0.4.0 cannot read in default mode; `--full` does not query it.

## Judgments the contracts do not settle

1. **No observer.** The session answers JavaScript admission through its
   observer. If a stale cancellation released the observer and a caller queries
   without an update, `affected` refuses with the existing reason
   `missing-facts` ("The current revision's configuration is no longer
   observed") instead of guessing admission. Synchronized resident queries and
   batch sessions always have an observer, so no CLI answer changes.
2. **Which configuration.** After a failed update the observer may hold a
   configuration newer than the published revision. Admission then follows the
   observer, as the brief's "current configuration" says. Only an unlisted
   `.js`, `.jsx`, `.mjs` or `.cjs` path outside every `src/` can be affected.
3. **Owners of a configuration input's set.** A `configuration` input
   governs `governedBy(directory of the selected configuration)`, with the
   owner of the selected configuration's directory added; a selected
   configuration outside the root would govern every module, because every
   module directory lies beneath its directory. The second case cannot occur
   with today's discovery.
4. **Contributors.** Contributor files are mapped to owners through the
   inventory, and through the scope's ownership for a contributor the
   inventory does not list; a contributor with no owned module adds nothing.
   If none remain, the input governs every module.
5. **Captured predicate.** The private predicate counts the roles that
   `analysisInput()` counts, plus `absent`. The `description` and `readme`
   roles are included for parity; rows 2 to 4 always classify them first.
6. **Fixture scope.** The pure fixtures' `scope.configuration` changed from
   the relative `tsconfig.json` to `/project/tsconfig.json`, because real
   scopes hold an absolute path and the governed set is computed from it.
7. **Help wording.** The contracts do not fix the help text. The new
   paragraph names the kinds in the rule's terms.

## Deviations

- **Test files beyond the brief's list.** These needed changes the brief did
  not name:
  - `affected-session.test.ts`: two `toEqual` seed expectations gained `kind`
    and `selects`, which AR-04 allows; the brief listed the file for the
    version only.
  - `subs/daemon/src/tests/project-boundary-wire.test.ts`: one `toEqual` of
    three seeds gained the members; its owned-ignored seed is `ignored`.
  - `session-test-fixture.ts`: the instrumented observer forwards the new
    member.
  - `affected-fixtures.ts`: the new facts fields, an admission switch and
    the shared invariant helper.
- **PB1-17 captured-input expectation.** The brief said only the ignored and
  inert rows of `project-boundary-affected.test.ts` change. One query there
  combines `.`, `package.json` and `tsconfig.json`; by the rule the last two
  are captured inputs that govern every module, so that expectation changed
  from [app] to all five. A separate assertion keeps `.` alone selecting
  nothing.
- **A missed touch point.** `src/tests/project-boundary-cli.test.ts` (PB1-20)
  asserted the old human lines and failed the first gate; fixed in
  `cb292684`.
- **Version-only touch points.** `affected-service.test.ts`,
  `resident-assembly.test.ts` and `batch-cli.test.ts` compare seeds with
  `toMatchObject`. They pass without the new members and changed only in
  version, or not at all.

## Flaky tests

None observed. Every focused run passed on its first attempt, apart from the
two expectation updates above, which were real member omissions.

## Remaining gaps

- `ramifyVersion` is still `0.2.0`; iteration 2 sets `0.3.0`.
- With ramify-audit 0.4.0, a default-mode toolkit audit cannot read `/3` and
  falls back to full (`ramify-unavailable`), as J11 expects. The gate uses
  `--full`, so this does not apply to it.
- The architect view was not needed: every API this iteration touched was
  named by the brief and read directly.
