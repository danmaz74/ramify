# Iteration 6 results: Test references

**Date:** 2026-09-18. **Mode:** direct work in worktree `/tmp/ramify-plan2b-architect-view`,
branch `feat/plan2b-architect-view`. It is based on `ccd1dff`, the plan amendment that added this iteration.
The implementation commit is `314ca6f`. Every verification command was run on that tree.

## Prerequisites

- Iteration 4's handoff held:
  - `renderArchitectView` imported only `byteOrder` from `modularity-context.ts`;
  - the golden files were rewritten by `RAMIFY_UPDATE_GOLDEN=1`;
  - A16 and A17 exposed the architect names, and root's R11 re-exposed them to descendants.
- `DependencyBehaviorFacts` held one fact per (consumer file, original) pair whatever the ownership of either file, with
  the precedence already applied. `projectDependencyDiagram` read them under the production filter only. The
  classifier and the diagram projection are unchanged by this iteration.
- `analyzeDependencyDiagram` built its `ready` outcome from one `projectDependencyDiagram` call. The context manager's
  `mapDiagram` retained `outcome.diagram` alone, so no other field of the outcome reached a public answer.

## Built

### `analysis`

- `src/interfaces/dependency-diagram.ts` gains C9's types:
  - `TestFileReferences`: `file`, `exercises` (`OriginalId[]`) and `unclassified`;
  - `TestReferenceFacts`: `inputId` and `files`;
  - `TestReferenceOutcome`, C9's return type under a name (see [Deviations](#deviations)).

  `DependencyDiagramLimits.maxResultBytes` now says it bounds the references separately.
- `src/test-references.ts` (new) holds `projectTestReferences(input: DependencyDiagramInput)`. It is pure and reads only
  the report.
  - **Refusals.** It follows `projectDependencyDiagram`'s order:
    - an incomplete report is `analysis-incomplete`;
    - an invalid candidate ownership throws;
    - an analysis without `dependency-behavior` is `not-requested`;
    - requested but absent facts, or facts with `status: 'failed'`, are `capability-failed`.
  - **Files.** The consumer files are `viewFacts(report, 'test', …).sources`: the source files of areas whose profile
    includes `testing`. Owners are not compared, so same-owner originals are included.
  - **Pairs.** Each fact is one (file, original) pair, keyed by `(owner, file, binding, kind)`. A repeated pair keeps
    the stronger class, behavioral, then unknown, then non-behavioral, then unused.
  - **Entries.**
    - `exercises` holds the behavioral pairs' originals, ordered by owner, file, binding and kind in byte order;
    - `unclassified` counts the unknown pairs;
    - a file with neither is omitted, and files are in byte order.
  - **Result.** The result is deep-frozen. Its JSON above `limits.maxResultBytes` is `resource-limit`, with
    `observedBytes` and `maximumBytes`.
- `src/dependency-analyzer.ts` projects the diagram as before, from one input object that the references share.
  - After the diagram is projected, it calls `projectTestReferences` on the same input.
  - A refusal or a throw of the references alone gives `testReferences: null`; the diagram is still returned.
  - `timings.projectMs` covers both projections.
- `src/interfaces/dependency-analyzer.ts`: the `ready` outcome gains `testReferences: TestReferenceFacts | null`.
- `src/interfaces/architect-view.ts`: the measured `ArchitectDependencies` gains `testReferences: TestReferenceFacts | null`.
- `src/architect-render.ts`:
  - **Input check.** References whose `inputId` differs from the projection's throw, as facts do.
  - **Labels.** Each exercised original becomes `<module>#<name>`, from the projection's own record for it:
    - labels are distinct and in byte order;
    - an original with no record is left out;
    - a suite record carries at most twelve, with `exercisesMore` counting the rest;
    - a suite record whose file has no entry carries `[]`.
  - **Absence.** Feature records carry nothing, and no record carries `exercises` when `testReferences` is null or the
    dependencies are unavailable.
  - **Key order.** Suite records hold `module`, `file`, `suite`, `tests`, `exercises`, then `exercisesMore`.
  - **`_meta.json`.**
    - It writes `testReferences` (`measured` or `unavailable`) after `dependencyScope`.
    - It writes `unclassifiedExercises` after `testsUnavailable` and before `coverage`, only when nonzero. The count sums
      `unclassified` over the files that have a suite record.
  - **Instructions.** The instruction block gains the specification's line "A test record's exercises names the symbols
    its test file calls."
- `src/index.ts` exports `projectTestReferences`.
- `module.ramify`: A14 also exposes `TestFileReferences`, `TestReferenceFacts` and `TestReferenceOutcome` to parent.
  `projectTestReferences` stays internal, as `projectDependencyDiagram` does.

### Root `ramify`

- `src/dependency-analyzer-process.ts` validates the `ready` outcome's `testReferences`. It must be one of:
  - `null`;
  - an object whose `inputId` equals the diagram's, with `files` entries of a string `file`, `exercises` of well-formed
    `OriginalId`s (`code` or `resource`) and a non-negative safe-integer `unclassified`.

  Anything else, an absent field included, is the existing `analysis-failed` "invalid outcome". The child entry is
  unchanged: it writes the analyzer's outcome whole.
- `module.ramify`: R9 also re-exposes `TestFileReferences` and `TestReferenceFacts` to descendants, for `daemon`.

### Outside the owners

The `ready` outcome gained a required field, so every analyzer double changed by one field. Type-check enforces it.

- `subs/daemon/subs/contexts/src/tests/dependency-diagram.test.ts` and `subs/daemon/src/tests/service.test.ts` give
  non-null references. Their unchanged `toEqual` assertions on every ready answer, including the direct, shared and
  codec dispatch paths, verify that the public answer does not carry them.
- `subs/daemon/src/tests/ipc.test.ts` and `subs/integration-tests/src/explorer-router.test.ts` give `null`.
- `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts` records A14 and R9 in the toolkit snapshot.
- Documents, see [Deviations](#deviations):
  - `docs/architecture/architect-view.spec.md` and C9 say `exercises` entries are distinct;
  - `test-cases.md` corrects D4's `exercises` key.

### Tests

- `subs/analysis/src/tests/architect-fixture.ts`: the `architect` fixture gains AV38's test files:
  - `core`'s `src/tests/core.test.ts` now calls its own module's `run` and internal `helper`;
  - `engine`'s new `src/tests/options.test.ts` only names `Engine` and `EngineOptions` as types;
  - the `checks` test now constructs `Engine` and names its type, calls `run`, and reads `loose`, whose `any` type the
    classifier cannot settle;
  - `alpha`'s test-named ordinary file `alpha.test.ts` now calls `build`, so a production file has a behavioral fact.

  Titles are unchanged except the new file's. The eight production boundaries are unchanged.
- `subs/analysis/src/tests/test-references.test.ts` (new), 4 tests:
  - synthetic reports cover the projection, precedence of repeated pairs, refusals and the separate byte bound;
  - the `architect` fixture runs through the real analyzer.
- `subs/analysis/src/tests/dependency-analyzer.test.ts`:
  - BD14/BD15 also compare the analyzer's references with `projectTestReferences` of the requesting batch;
  - a new test shows `null` references beside an unchanged diagram when only the references exceed the bound.
- `src/tests/dependency-analyzer-process.test.ts`:
  - the built child's references equal the in-process analyzer's byte for byte;
  - a new test runs stub child entries through the runner for validation;
  - BD17's no-child assertion is scoped to this process's children (see [Deviations](#deviations)).
- `subs/analysis/src/tests/architect-render.test.ts` has 29 tests, up from 23:
  - a third golden state and five AV39 tests;
  - the fixture's changed counts;
  - `_meta.json` in three states;
  - the references' input check.
- `subs/analysis/src/tests/architect-view.test.ts` has the fixture's new counts, plan files and records.
- Golden files: `architect-view-measured.txt` and `architect-view-unavailable.txt` are regenerated, and
  `architect-view-measured-unreferenced.txt` (new) holds measured facts with `testReferences: null`. Every changed line
  was reviewed:

  | Change | Measured | Measured, no references | Unavailable |
  | --- | --- | --- | --- |
  | Instruction line added to `README.md` | yes | yes | yes |
  | `engine`'s map counts `tests 1` | yes | yes | yes |
  | `_meta.json` `testReferences` | `measured`, with `unclassifiedExercises: 1` | `unavailable` | `unavailable` |
  | `engine/module.json` files `3/3`, tests `1/1`; `core` subtree 7; root subtree 17 | yes | yes | yes |
  | New `engine/tests.jsonl` record | `exercises: []` | no `exercises` | no `exercises` |
  | `checks` suite records | both carry `["fixture/core#run","fixture/core/engine#Engine"]` | unchanged | unchanged |
  | `core` suite record | `["fixture/core#helper","fixture/core#run"]` | unchanged | unchanged |

  No behavior, supporting or `uses`/`usedBy` line changed. The measured and no-references files differ only in
  `_meta.json` and the `exercises` fields.

## Evidence

| Row | Witness | Result |
| --- | --- | --- |
| AV38 | See the AV38 witnesses below | pass |
| AV39 | See the AV39 witnesses below | pass |
| AV12–AV18 | Re-run on the regenerated golden files; see below | pass |

AV38 witnesses:

- **Fixture through the analyzer** (`test-references.test.ts`). An ordinary report of the `architect` fixture runs
  through `analyzeDependencyDiagram`. Its `ready` outcome's `testReferences` equals `projectTestReferences` of a report
  that requested `dependency-behavior`, byte for byte. Its diagram equals `projectDependencyDiagram` of that report.
  The references are exactly:

  | File | `exercises` | `unclassified` |
  | --- | --- | --- |
  | `subs/checks/src/engine.test.ts` | `fixture/core` `run`, `fixture/core/engine` `Engine` | 1 |
  | `subs/checks/src/support.ts` | `fixture/core/engine` `Engine` | 0 |
  | `subs/core/src/tests/core.test.ts` | `fixture/core` `helper`, `fixture/core` `run` | 0 |

  - **Same owner.** `core.test.ts` lists its own module's `run` and internal `helper`.
  - **Call and type.** The checks test's `Engine` fact has evidence `construction, type` and is listed once.
  - **Unknown.** `loose` is `unknown` and counted, not listed.
  - **Type only.** `options.test.ts` has two non-behavioral `type` facts and no entry.
  - **Production.** `alpha.test.ts` has a behavioral `build` fact and no entry; no entry names a file outside the four
    testing-classified files. The diagram's `consumerFiles` name none of them.
- **Synthetic** (`test-references.test.ts`):
  - a root test calls a same-owner original, two originals of another module, names a type, reads an unknown value and
    imports one unused; a testing module's ordinary file has a behavioral pair and two facts for one pair;
  - exercises are ordered by owner, file, binding and kind; a type-only test file and the production file have no
    entry;
  - a repeated pair keeps the stronger class in either order;
  - refusals: `analysis-incomplete` for three executions, `not-requested`, `capability-failed` for missing and for
    failed facts;
  - `resource-limit` one byte below the references' size with both byte counts, and projection at it, where the
    larger diagram of the same report is refused;
  - the `dependency-report` fixture's test file gives its one `act` entry.
- **Same run, null alone** (`dependency-analyzer.test.ts`). BD14/BD15 compare the analyzer's references with the
  requesting batch's on `path-facts` and `forwarding`. On a fixture where only a test uses another module, the diagram
  has no boundary and the references exceed the diagram's size. With `maxResultBytes` equal to the diagram's size, the
  outcome is `ready` with the same diagram bytes and `testReferences: null`.
- **Process runner** (`dependency-analyzer-process.test.ts`):
  - **Real child.** The built child over the reference project returns non-null references of the report's input,
    byte-identical to the in-process analyzer's.
  - **Stub children.** Stub entries printing crafted outcomes return `null` and valid references unchanged. They give
    `analysis-failed` "invalid outcome" for eight defects: an absent field, another input, no `files`, an exercise
    without a binding, an unknown kind, a negative or fractional `unclassified`, and a non-string `file`.
- **Public answers unchanged.** The contexts and service doubles return non-null references, and every ready answer is
  still exactly `{ status, requestId, revision, diagram }`. BD24 (built daemon, `dependency-diagram-daemon.test.ts`)
  passes.
- **Diagram byte-identity** against `06ccfca`: see [below](#diagram-byte-identity).

AV39 witnesses (`architect-render.test.ts`, "test references"):

- **Fixture.**
  - Both suite records of the checks test carry the same list, in byte order; the feature record carries none.
  - `core`'s record lists its same-owner originals, and the type-only test has `exercises: []`.
  - Every suite record's keys are `module`, `file`, `suite`, `tests`, `exercises`.
  - Each label's name matches exactly one `behavior.jsonl` or `supporting.jsonl` record of its owner.
- **Bounds and names** (synthetic):
  - sixteen distinct labels give twelve and `exercisesMore: 4` on both records of one file;
  - the binding `start` is labelled by its record's name `begin`, and two `default` originals of one module give one
    `app/lib#default`;
  - an original without a record is left out;
  - a file without an entry gives `[]` with no count, and a `.feature` record with a reference entry gets nothing;
  - twelve entries give no `exercisesMore`.
- **Absence.** With `testReferences: null` and with unavailable dependencies, no record has `exercises` or
  `exercisesMore`, and `_meta.json` has `testReferences: "unavailable"` right after `dependencyScope`, with no
  `unclassifiedExercises`.
- **`unclassifiedExercises`** sums 2 and 3 over two suite files and ignores 5 from a file without a suite record. It is
  written between `testsUnavailable` and `coverage`, and omitted when the sum is zero.
- **Consumer lists unchanged.** With and without references, every file except `tests.jsonl` and `_meta.json` is
  byte-identical, and `tests.jsonl` is identical once `exercises` and `exercisesMore` are removed. AV14's hand-written
  consumer lists, `uses` and `usedBy` are unchanged by the fixture's new test references.
- **Input check.** References naming `input/1:other` throw, naming both inputs.

AV12–AV18 re-run: all 29 renderer tests pass on the regenerated golden files, with these fixture updates:

- AV12 and AV13 still cover the measured and unavailable states; the AV39 test that compares the view with and without
  references verifies the same file set and record count for the third;
- AV16 expects `engine`'s `tests 1`;
- AV17 expects `_meta.json` in three states and `core`'s subtree of 7;
- AV18 covers three states for determinism and host values.

Mutations were each restored from a copy after their run. Each of these made at least one test fail:

- **Projection:** the production filter instead of `test`; same-owner pairs excluded; unknown pairs listed; no original
  order; failed facts projected; no byte bound.
- **Analyzer:** always null references.
- **Renderer:** no twelve-entry bound; the binding instead of the record's name; labels not made distinct; no `[]` for
  a file without an entry; unknown pairs summed over every file; no references input check; `testReferences` after
  `metrics`; `exercises` on feature records.
- **Runner:** no reference validation; the diagram's `inputId` not compared.

"The weaker class kept" first passed: every repeated-pair case put the strongest class last. The test now orders it
first and in the middle, and fails under the mutation.

## Diagram byte-identity

A scratch script, `av38-facts.mjs`, was not committed. It follows iteration 1's recipe with one build over one project:

1. The build's `dist/src/batch.js` produces a report with the check capabilities and no `dependency-behavior`.
2. The build's `dist/src/dependency-analyzer-entry.js` runs as a child over `{ project, report }`, as a published
   revision carries it.
3. The script writes the diagram's JSON exactly as the child printed it.

The base build was made in `/tmp/rp2b6-base`:

- the directory held `git archive 06ccfca`, so the main checkout's worktree list was not touched;
- `node_modules` was linked to the main checkout's;
- `tsx scripts/build-production.ts` built it.

Both builds ran over the same four directories, with the final build of `314ca6f`:

| Project | Boundaries | Diagram bytes | SHA-256 (both builds) | Result | References (new build) |
| --- | ---: | ---: | --- | --- | --- |
| `architect` fixture, written from `architect-fixture.ts` | 8 | 4,690 | `665d576f…` | byte-identical | 3 files, 700 B |
| Collection Review (`examples/collection-review`) | 65 | 47,812 | `bd52633a…` | byte-identical | 24 files, 6,463 B |
| Toolkit at `314ca6f` | 497 | 343,527 | `668288c7…` | byte-identical | 175 files, 100,421 B |
| Toolkit at `06ccfca` | 495 | 342,049 | `7233eb44…` | byte-identical | 172 files, 97,637 B |

- `cmp` found no difference in any pair, and the base build's outcomes have no `testReferences` field.
- An earlier run of the same comparison, before the last test-file edit, was also byte-identical in all four pairs.
- The Collection Review diagram is 47,812 B, the size Plan 6D and iteration 1 recorded.
- The fixture's input identity differed between the two sessions of the comparison, but was equal for both builds
  within each session. It comes from the batch, which this iteration does not change.

## Toolkit measurement (deliverable 6)

- **Analyzer time.** The analyzer ran over the toolkit tree five times per build, alternating: four runs before the
  commit on identical code, and one on `314ca6f`. The figures are the child's own `timings`.

  | | `06ccfca` build | `314ca6f` build |
  | --- | ---: | ---: |
  | `totalMs`, range | 5,306–5,505 | 5,199–5,638 |
  | `totalMs`, mean | 5,362 | 5,424 |
  | `projectMs`, range | 39.0–46.0 | 42.6–47.2 |
  | `projectMs`, mean | 41.5 | 43.9 |
  | Child response, bytes | 343,700 | 444,132 |

  The whole-run difference is within the spread between runs. The projection stage grows by about 2.4 ms.
- **References.** The toolkit's references are 100,421 bytes (0.6% of the 16 MiB bound), for 175 files:
  - 153 files have a suite record, and the other 22 are helpers in testing areas;
  - they hold 836 behavioral pairs, 4.8 per file on average and at most 23;
  - 758 pairs (90.7%) are same-owner;
  - no pair is unknown, so `unclassifiedExercises` is absent;
  - no exercised original lacks a record.
- **View.** A second scratch script, `measure-view.mjs`, opened a retained session over the committed tree with the
  final build, the CLI's capabilities and `maxReportBytes` of 128 MiB. It queried `architectView` with the plan's
  limits, ran `analyzeDependencyDiagram` over the same revision's report, and rendered three states:

  | | Measured with references | Measured, `testReferences: null` | Unavailable |
  | --- | ---: | ---: | ---: |
  | Files / records | 62 / 1,583 | 62 / 1,583 | 62 / 1,583 |
  | Total bytes | 802,863 (0.77 MiB) | 739,396 (0.71 MiB) | 689,878 (0.66 MiB) |
  | `tests.jsonl` bytes | 223,023 | 159,553 | 159,553 |
  | `tests.jsonl` mean / max line, characters | 760.0 / 2,763 | 543.4 / 2,586 | 543.4 / 2,586 |
  | Render time | 10.9 ms | 6.0 ms | 4.8 ms |
  | Byte-identical re-render | yes | yes | yes |

  The view is 0.77 MiB against the 8 MiB budget. The mean behavior record is 402.0 characters, which is evidence only,
  as in iteration 4.
- **`exercises`.** All 293 suite records carry it:
  - **Non-empty.** 289 lists are non-empty. The four `[]` records are in `capabilities.test.ts`,
    `project-view-projection.test.ts`, `launcher-script.test.ts` and `lifecycle-process.test.ts`.
  - **Length.** A list holds 5.60 entries on average, at most 12. Before the bound, a file's list is 5.87 on average
    and at most 23.
  - **Characters.** The list itself is 202.6 characters on average and at most 631.
  - **Bound reached.** 16 records carry `exercisesMore`. They are in four files: `session-revision.test.ts` (+3),
    `session-worker.test.ts` (+1), `retained-source-analysis.test.ts` (+1) and `ProjectExplorerView.test.tsx` (+11).
- **D3 and D4 keys.**

  | File | Label | Listed | Position | Records |
  | --- | --- | --- | --- | --- |
  | `subs/service-api/src/tests/project-binding.test.ts` | `ramify/service-api#createProjectBinding` | yes | 4th of 5 | both records |
  | `subs/daemon/subs/contexts/src/tests/context-manager.test.ts` | `ramify/daemon/contexts#createContextManager` | yes | 2nd of 8 | both records |
  | `subs/daemon/subs/contexts/src/tests/covering.test.ts` | `ramify/daemon/contexts#createContextManager` | **no** | — | none of 8 |

  `covering.test.ts` imports only `sessionEnvironment` from `session-fixture.ts` and `capture`, `flush` and `hash` from
  `scripted-driver.ts`. The helper creates the context manager, so the file's own references are those four. Its eight
  records list `ramify/daemon/contexts#capture`, `#flush`, `#hash` and `#sessionEnvironment`. The D4 key in
  `test-cases.md` is corrected accordingly.
- **Reference project.** 24 files and 6,463 bytes of references, mostly one or two originals per file.

## Verification

```sh
npx vitest run subs/analysis/src/tests/architect-render.test.ts subs/analysis/src/tests/test-references.test.ts     # 33 passed (29 + 4)
npx vitest run subs/analysis/src/tests/dependency-diagram.test.ts subs/analysis/src/tests/dependency-analyzer.test.ts   # 14 passed
npx vitest run subs/analysis/src/tests/dependency-behavior-capability.test.ts subs/analysis/src/tests/modularity.test.ts  # 22 passed
npx vitest run src/tests/dependency-analyzer-process.test.ts src/tests/dependency-diagram-daemon.test.ts                 # 5 passed
npx vitest run subs/daemon/subs/contexts/src/tests/dependency-diagram.test.ts                                           # 8 passed
npm run type-check                                                                                                       # clean, all four scopes
npm run build                                                                                                            # built
npm run check:self   # passed: 15 owners, 413 source files, 15 resources, 6066 accesses, 0 errors, 0 warnings, 0 analysis limits, 0 denied
```

Type-check and build ran before the root tests, which run the built analyzer entry. Additional focused runs cover the
files this iteration touched:

```sh
npx vitest run subs/analysis/src/tests/architect-view.test.ts subs/analysis/src/tests/architect-view-session.test.ts    # 21 passed
npx vitest run subs/analysis/subs/descriptions/src/tests/descriptions.test.ts                                           # 31 passed
npx vitest run subs/daemon/src/tests/service.test.ts subs/daemon/src/tests/ipc.test.ts subs/integration-tests/src/explorer-router.test.ts   # 20 passed
npx vitest run subs/daemon/src/tests/architect-view-publisher.test.ts subs/daemon/src/tests/api-view-publisher-crash-recovery.test.ts      # 31 passed
```

- **Retained sessions.** `dependency-behavior-capability.test.ts` and BD24 pass, so no retained session loads
  `behavior-classifier.ts`. `test-references.ts` imports only types and `modularity-candidate.ts`,
  `modularity-context.ts` and `modularity-owner.ts`.
- **Renderer imports.** The renderer's import test passes: its only runtime import is still `./modularity-context.js`.
- **`check:self`** ran twice, before and after the commit, with an owned `RAMIFY_ENDPOINT_DIR` created with mode 0700,
  `/tmp/rp2b6-ep`. Each time:
  - the daemon (PID 394099, then 405327) was stopped with `dist/src/ramify daemon stop`;
  - `daemon status` answered `not running`, and the PID was gone;
  - the directory was removed.
- **Temporary directories.** `/tmp/rp2b6-base` and `/tmp/rp2b6-arch` were removed after the comparison.
- **Other processes.** No process from this worktree remained. Daemons of other worktrees were not touched.
- **Full suite.** The full test suite was not run.

## Deviations

- **Named outcome type.** C9 gives `projectTestReferences` an inline return type. It is named `TestReferenceOutcome`
  in `interfaces/dependency-diagram.ts`, beside `DependencyDiagramOutcome`, and exposed with it in A14.
- **Function location.** C9 lists the function under `interfaces/dependency-diagram.ts`. The types are there; the
  function is in a new `src/test-references.ts`, so `dependency-diagram.ts`, whose output must stay byte-identical, is
  unchanged.
- **Failed facts.** C9 names `capability-failed` without saying when. Facts with `status: 'failed'` are
  `capability-failed`, like absent facts. The diagram projects failed facts as partial coverage, but references have
  no coverage field, and every file would read as referencing nothing.
- **Thrown references.** A throw from `projectTestReferences` in the analyzer gives `testReferences: null`, like a
  refusal, rather than making the whole outcome `analysis-failed`. That keeps C9's rule that the diagram and the
  explorer's answer are unchanged.
- **Distinct labels.** Two originals can have the same `<owner>#<name>`, such as two `default` exports of one module.
  The renderer lists the label once. The specification and C9 now say the entries are distinct, and the specification
  says an original with no record is left out, as C9 already did.
- **Runner validation.** The process runner also requires the references' `inputId` to equal the diagram's, since both
  come from one report.
- **BD17 scope.** In one run of the fourth verification command, BD17's final check found an analyzer child that BD24's
  built daemon had started in the parallel test file, and failed. Each file passed alone. BD17's assertion ("the
  runner started no child") now looks only at this process's children, as its `analyzerProcesses` helper already did.
  The command then passed on three runs.
- **D4 key.** `test-cases.md` said both D4 title records list `createContextManager`. On the toolkit only
  `context-manager.test.ts` does, since `covering.test.ts` reaches the manager through a test helper. The key now says
  so. `exercises` lists a file's own references, as the specification defines.
- **Outside the owners.** Four daemon and integration test doubles gained the required field, and the description
  snapshot records A14 and R9. See [Outside the owners](#outside-the-owners).

## Limitations

- **Own references only.** `exercises` names what a test file references itself. A test that reaches a symbol through
  a helper lists the helper, as `covering.test.ts` does. The helper's references are in the analyzer's references, but
  no record shows them, because the helper has no suite record.
- **Per-file attribution.** Every suite record of a file carries the same list, as the specification states.
  `tests.jsonl` lines grow by 217 characters on average on the toolkit, from 543.4 to 760.0.
- **Bound reached.** 16 toolkit records reach the twelve-entry bound. For `ProjectExplorerView.test.tsx`, 11 labels are
  counted but not shown.
- **Context retention.** The context manager still retains the diagram alone, and its byte budget counts only the
  diagram. The toolkit's references add 100,421 bytes.
- **Documentation.** The owner README and the architecture index do not describe the references yet. Iteration 8 owns
  documentation (its earlier number was 7).

## Handoff

- **Iteration 7** receives:
  - **Outcome.** `DependencyAnalyzerOutcome`'s `ready` variant carries `testReferences: TestReferenceFacts | null`,
    validated by the process runner, with the same `inputId` as `diagram`. `null` means only the references were
    refused.
  - **Carrying.** The context manager's `mapDiagram` retains `outcome.diagram` alone, in `context.diagram`, and answers
    with it; `testReferences` is dropped there today. Iteration 7 should:
    - retain the references beside the diagram for the same revision, and count their bytes against
      `maxRetainedBytesPerContext` and `maxRetainedBytesGlobal`;
    - pass them to the service's materialize path;
    - keep the public `dependencyDiagram` answer, whose tests compare the whole answer, without them.

    A cached `context.diagram` is served without a new analyzer run, so the references must be cached with it.
  - **Rendering.** Call `renderArchitectView({ revision, projection, dependencies: { state: 'measured', facts,
    testReferences } })`. References with another `inputId` throw, as facts do. For an unavailable wait, the
    `unavailable` state needs no references.
  - **Names.** `TestFileReferences` and `TestReferenceFacts` reach descendants through R9. `ArchitectDependencies`
    (R11) names `TestReferenceFacts`.
  - **Doubles.** The contexts `dependency-diagram.test.ts`, `service.test.ts`, `ipc.test.ts` and `explorer-router.test.ts`
    doubles already return `testReferences`.
  - **AV27.** Its "renderer receives both" needs a controllable runner returning non-null references.
- **Iteration 8** receives:
  - the toolkit's view size with references, 0.77 MiB, and its `tests.jsonl` lengths for the hit-cost measurement;
  - the three golden files as expectations;
  - `unclassifiedExercises` absent on the toolkit.
- **Iteration 9** receives the D3 and D4 checks above: D3's record lists `createProjectBinding`; D4's
  `context-manager.test.ts` records list `createContextManager` and `covering.test.ts`'s records list
  `sessionEnvironment`.
