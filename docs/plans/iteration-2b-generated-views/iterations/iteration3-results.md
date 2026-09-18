# Iteration 3 results: Project the architect view in the session

**Date:** 2026-09-18. **Mode:** direct work in worktree `/tmp/ramify-plan2b-architect-view`,
branch `feat/plan2b-architect-view`. It is based on `f99e511`, iteration 2's completed results.
The implementation commit is `488e007`. Build, type-check and `check:self` were run on that commit.

## Prerequisites

- Iterations 1 and 2 are complete, and their handoffs held:
  - `RetainedSourceAnalysis` offered `details`, `shapes` and `testTitles` with the hot-compiler precondition.
  - `instrumentCompiler` passed all three through.
  - `readFeatureTitles` returned scenarios unsplit.
- `behavior-classifier.ts` stays outside every retained-session import path. The engine now imports `architect-view.ts`,
  which imports `feature-titles.ts`, `api-view.ts`, `report.ts` and the model's `originalKey`.
  `dependency-behavior-capability.test.ts` and BD24 pass after this iteration.

## Built

### `analysis`

- `src/interfaces/architect-view.ts` (new) holds C3's types as the contract names them:
  - `ArchitectModuleFacts` and `ArchitectSymbol`;
  - `ArchitectTestRecord` and `ArchitectViewCounts`;
  - `ArchitectViewProjection`, `ArchitectViewQuery` and `ArchitectViewQueryOutcome`.
- `src/architect-view.ts` (new) is pure. It has no filesystem, compiler or retention access.
  - `planArchitectView(facts)` answers `planned` or `unavailable`/`analysis-failed`. A plan holds:
    - `requests`: one detail and shape request per selected original, under its `name`, in byte order;
    - `testFiles`: the TypeScript and JavaScript files of `testing`-profile areas;
    - `features`: the `.feature` files of those areas.
  - `projectArchitectView(facts, sequence, inputId, provided, limits)` answers `projected` or `unavailable`:
    - it folds in `provided` (`ArchitectViewProvided`), which holds details, shapes, test titles and feature texts;
    - it repeats the plan's join;
    - it answers `resource-limit` for invalid limits or an encoded size above `maxProjectionBytes`;
    - a result missing for a planned request or file throws, as `projectApiView` does.
  - `architectLimitIssue(query)` checks that every limit is a positive safe integer. The engine calls it before any
    compiler work.
  - **Selection.** An original is selected when it meets all of these:
    - it is a catalog original of a declared owner;
    - its defining file (`origin.file`) exports it under at least one top-level name;
    - it is the first occurrence of its key.

    A catalog original missing from the linked model fails the facts with `analysis-failed`.
  - **Symbols.** For each selected original:
    - `name` is the byte-least defining-file export name;
    - `binding` is set when `name` is `default` and the binding is not itself `default`;
    - `role`, `destinations` and `exposureNames` come from the model's exposures with `provider === null` and
      `module === owner`;
    - `reexposed` holds the effective relays (`provider !== null`, `effective: true`), one entry per relaying module,
      deepest first, which is nearest to the owner;
    - `tags` and `hasValue` come from the model's `Original`;
    - `kind` comes from the shape;
    - `behavior` is the shape's behavior when `hasValue`, else `null` (see Deviations).
  - **Modules.**
    - Modules are in tree order: a module before its children, children in byte order.
    - `dir` is `''` for the root.
    - `areas` are the present areas as `src` and `src/tests`.
    - `purpose` is the README's first paragraph, uncut, or `missing`.
    - `docs` lists the inventory files under `<dir>/src/docs/`.
    - `files` counts inventory `source` files: `own` for the module, `subtree` for it and its descendants.
  - **Tests.**
    - Suite records carry the reader's entries as they come.
    - A feature file gives its scenarios in records of at most `maxTitlesPerRecord`, each record repeating the feature
      title.
    - Records are ordered by module in tree order, then file, then source order.
  - **Counts.**
    - `coverage` counts distinct catalog limits, with the check report's filter for resource descriptions.
    - `detailsUnavailable` and `unknownShapes` count symbols.
    - `dynamicTitles` sums the reader's `dynamic`, and `testsUnavailable` counts unavailable test files.
    - `cut` counts truncated details (one per symbol) plus every cut test, feature and scenario title.
- `src/api-view.ts` exports `validFacts`, unchanged, so both views refuse the same facts.
- `RetainedSession.architectView(query, control?)` is added in `interfaces/session.ts` and follows `apiView`:
  - **Engine** (`session-engine.ts`):
    - The call is serialized with every other operation. A disposed session and any sequence other than the current one
      answer `invalid-revision`.
    - Missing facts answer `analysis-failed`, and invalid limits answer `resource-limit`.
    - The engine plans, then reads the planned `.feature` files from the project root. It compares each file's size and
      SHA-256 with the revision's captured input:
      - a changed, removed or replaced file answers `superseded` with `observedInputId: null`;
      - a file the revision did not capture, or a read failure other than `ENOENT`, `ENOTDIR` or `EISDIR`, answers
        `analysis-failed`.
    - A released compiler is recreated through `#rehydrate`, as `apiView` recreates it.
    - The engine then calls `details`, `shapes` and `testTitles` on the retained adapter. Their failures map as
      `apiView`'s do: cancellation gives `cancelled`, a `resource-limit` code gives `resource-limit`, and anything else
      gives `analysis-failed`.
    - The call publishes no revision, and neither `report()` nor a revision step runs.
    - `#rehydrate` now returns the union of its own three outcomes, which both views accept.
  - **Protocol** (`session-messages.ts`): `SessionCommand` has an `architectView` operation, and `WorkerResult` includes
    `ArchitectViewQueryOutcome`.
  - **Worker** (`session-worker.ts`): the worker dispatches the operation to the engine.
  - **Host** (`session-host.ts`): the host answers `cancelled` for a signal aborted before the call. It maps a disposed
    session to `invalid-revision` and any other failure to `analysis-failed`, exactly as its `apiView` does.
- `src/index.ts` exports the new types beside the session types.
- `module.ramify` gains statement A16:
  - `expose-src * from "interfaces/architect-view.ts" to parent`;
  - `expose-sub ExportKind, ExportBehavior, TestTitleLimits from typescript to parent`, which re-exposes to root the
    names the new types take from the compiler owner.
  - `planArchitectView` and `projectArchitectView` stay internal to `analysis`.

### Outside the owner

`RetainedSession` gained a required method, so every implementer changed by one pass-through or double:

- root `src/resident-assembly.ts` (`ownedSession`);
- `subs/daemon/src/service.ts` (the counted session wrapper);
- `scripts/reference-harness/session-driver-operations.ts`;
- the test doubles in `subs/daemon/src/tests/session-counters.test.ts`, which answer `cancelled` as their `apiView` does;
- `subs/daemon/subs/contexts/src/tests/scripted-driver.ts`, which answers `unavailable`/`analysis-failed` until iteration
  6 makes it serve the view.

`subs/analysis/subs/descriptions/src/tests/descriptions.test.ts` records the new A16 statements in its snapshot of the
toolkit's module descriptions.

### Tests

- `src/tests/architect-fixture.ts` (new) holds the `architect` fixture (`architectFixture`, `architectPaths`), a
  project helper (`architectProject(check, overrides)`, where a `null` override removes a file) and the plan's query
  limits (`architectLimits`). The fixture is described below.
- `src/tests/architect-view.test.ts` (new): AV08–AV10 on the pure functions, over the fixture's retained facts and real
  compiler results, 12 tests.
- `src/tests/architect-view-session.test.ts` (new): AV10's supersession and AV11, on the in-process engine and through
  the real worker, 9 tests.

The `architect` fixture:

| Module | What it holds |
| --- | --- |
| `fixture` (root) | Exposes `Config` to descendants. Relays `Engine`, `launch`, `loose` and `run` from `core` to descendants. Its relay of `settings` is ineffective, because `core` exposes `settings` to its descendants only. Internal `main`. |
| `fixture/core` | Exposes `run` to parent and descendants and `settings` to descendants. Relays `Engine`, `launch` and `loose` from `engine` to parent. Internal `helper` and `Mode`. A forwarding file `index.ts` for `Engine`. Two `src/docs/` files. `src/tests/` with a test file and an exported testing helper. |
| `fixture/core/engine` | No README. Exposes `Engine`, `EngineOptions` and `loose` to parent, and `start` as `launch`. `start` is also exported as `begin`. `boot` is the file's `default`. `src/tests/legacy.test.js`, which the compiler options leave out. |
| `fixture/alpha` | Constructs `Engine` from `engine` and names its type through `core`'s forwarding file. Its ordinary `src/` has `alpha.test.ts`, `notes.feature` and a stylesheet resource. |
| `fixture/beta` | Tagged `ui`. Names `Engine` as a type only and calls `run`. |
| `fixture/gamma` | Reads `loose`, whose type is `any`. |
| `fixture/checks` | Tagged `testing`. Its ordinary `src/` imports `Engine` and `run`, and holds a test file, a testing helper and `features/review.feature`. |

The check passes with 0 errors, and its coverage is partial. The JavaScript test gives two `compiler-blocked` notes, one
of them a catalog limit.

A batch run with `dependency-behavior` and `projectDependencyDiagram` gives these boundaries under the production
filter:

| Consumer | Imported module | Original | Class |
| --- | --- | --- | --- |
| `fixture` | `fixture/core` | `run` | behavioral |
| `fixture/alpha` | `fixture/core` | `Engine` | non-behavioral |
| `fixture/alpha` | `fixture/core/engine` | `Engine` | behavioral |
| `fixture/beta` | `fixture/core` | `run` | behavioral |
| `fixture/beta` | `fixture/core` | `Engine` | non-behavioral |
| `fixture/core` | `fixture/core/engine` | `Engine` | behavioral |
| `fixture/core/engine` | `fixture` | `Config` | non-behavioral |
| `fixture/gamma` | `fixture/core/engine` | `loose` | unknown |

These cover behavioral, non-behavioral and unknown use, and mixed use of one original through two imported modules.
`fixture/checks` appears in none of them.

## Evidence

| Row | Witness | Result |
| --- | --- | --- |
| AV08 | See the AV08 witnesses below | pass |
| AV09 | See the AV09 witnesses below | pass |
| AV10 | See the AV10 witnesses below | pass |
| AV11 | See the AV11 witnesses below | pass |

AV08 witnesses, from `architect-view.test.ts` with real details, shapes and titles:

- **All 18 symbols.** The projection gives 18 symbols. Each is compared with a hand-written row of module, `name`,
  `binding`, `exposureNames`, `role`, `destinations`, `kind`, `behavior`, `hasValue`, `tags`, `reexposed` and `file`.
  Among them:
  - `Engine`, `begin` and `loose` list `reexposed` as `fixture/core` to parent, then `fixture` to descendants.
  - `run` lists `fixture` to descendants, and its destinations are `descendants` and `parent`.
  - `settings` lists no relay, because the root's relay of it is ineffective.
  - `begin` is the byte-least of the defining-file names `begin` and `start`. Its `exposureNames` are `launch`.
  - Engine's `default` has `binding: 'boot'`. The stylesheet's `default` has `binding: null`, with `kind: 'resource'`
    and `behavior: null`.
  - `helper`, `Mode`, `main`, `build`, `view`, `drive`, `makeEngine`, `sample` and `total` are `internal` with no
    destinations.
  - `drive` has the tag `ui`, and `makeEngine` and `sample` have `testing`.
  - `loose` is `unknown`, `Engine` is `constructable`, and `Config`, `Mode` and `EngineOptions` have no runtime value
    and `behavior: null`.
- **Each original once.** Keys are unique, every symbol's module is its original's owner, and `core`'s forwarding file
  adds no record.
- **Details.** Each detail is the one for the recorded name.
- **Counts.** The counts are `coverage 1`, `detailsUnavailable 1` (the stylesheet), `unknownShapes 1`,
  `testsUnavailable 1`, and zero dynamic titles and cuts.
- **Plan.** The plan has 18 requests in byte order, and `engine`'s requests are its five names.
- **Type-only originals.** With every shape replaced by an unresolved `value`/`unknown`, the originals without a runtime
  value stay supporting. Only the 15 with a value count as `unknownShapes`.

AV09 witnesses:

- **All seven modules.** Each module is compared whole, in tree order: identifier, `dir` (`''` for the root), parent,
  children in byte order, header tags (`ui`, `testing`), present areas, purposes, `docs` and source counts.
  - `fixture/core/engine` has `purpose: { state: 'missing' }`.
  - `fixture/core` lists `subs/core/src/docs/guide.md` and `subs/core/src/docs/notes/usage.md`, with `own 4` and
    `subtree 6`.
  - The root has `own 2` and `subtree 16`.
- **Tree order is not identifier order.** An added module `core-x` sorts between `core` and `core/engine` by identifier.
  It follows `core/engine` in tree order, with no areas, a `missing` purpose and zero files.

AV10 witnesses:

- **Planned files.** The plan's test files are exactly the five sources of `fixture/checks/src` and of the `src/tests/`
  areas of `core` and `engine`. Its features are exactly `subs/checks/src/features/review.feature`.
- **Excluded files.** `alpha.test.ts` and `notes.feature` in `alpha`'s ordinary `src/` give no record. `legacy.test.js`
  is counted in `testsUnavailable`.
- **Records.** The records are the `[]` and `engine` suites of `checks`, the `Review` feature with its `Scenario` and
  `Scenario Outline` titles, and `core`'s `run` suite, in that order.
- **Split and cut.** With `maxTitleBytes: 10` and `maxTitlesPerRecord: 1`:
  - every list is split into one-title records that repeat their suite chain or feature title;
  - three test titles and two scenario titles are cut;
  - `cut` is 5.
- **Feature records.** A feature without scenarios gives one record with `scenarios: []`. A file with neither a feature
  nor a scenario gives none. A scenario without a feature gives `feature: null`.
- **Supersession (engine).** The in-process session:
  - answers `superseded` with the revision's sequence and `observedInputId: null` after `review.feature` changed on disk;
  - projects exactly as before once the original bytes are restored;
  - answers `superseded` again after the file is removed.

  A changed `notes.feature` in `alpha`'s ordinary area supersedes nothing. After an update publishes the changed feature,
  the query projects its added scenario.
- **Supersession (worker).** Through the worker, a changed `review.feature` answers `superseded` too.

AV11 witnesses:

- **Counters.** The counter test is first in its file, and Vitest isolates each file, so it starts at zero.
  - The file mocks `export-shapes.js` and `test-titles.js` with their own modules, only to read `shapeRuns()` and
    `testTitleRuns()`. This is the pattern `dependency-behavior-capability.test.ts` uses for the classifier.
  - Over an in-process session it runs:
    - the cold open (a check);
    - a watch update of `core.ts`;
    - a changed-file check (`update` with an invocation) of `gamma.ts`;
    - an unchanged check;
    - a changed-file check of a test file;
    - a sweep, an audit, a report and an API-view query;
    - a compiler release and the broad update that follows.
  - After all of these, both counters are 0. One `architectView` query then makes them 1 and 1.
- **Current sequence.** For the current sequence, the engine's outcome equals an independent oracle: the plan, the three
  compiler calls and the projection over the same state. The projection has the revision's sequence and input.
  `report()` is not called, no revision step runs, and `current` is unchanged.
- **`invalid-revision`.** An older sequence, an unknown sequence and a disposed session each answer `invalid-revision`.
  - A query queued behind an update answers for the sequence that update publishes.
  - A query naming the sequence a queued update replaces answers `invalid-revision`.
- **`resource-limit`.** One byte under the projection's size answers `resource-limit`, and its exact size projects.
  Invalid limits and a 64-byte detail result bound answer `resource-limit`. The next query projects again.
- **`cancelled`.** A signal aborted before the call answers `cancelled`, and so does one aborted inside the `shapes`
  call. The next query projects.
- **Warm rehydration.** After `releaseCompiler`, the query recreates the compiler, publishes no revision and equals the
  hot projection.
- **Real worker.** Through `openRetainedSession`:
  - the outcome is frozen plain data and equals the in-process oracle;
  - `sequence + 1` answers `invalid-revision`, and `maxProjectionBytes: 1` answers `resource-limit`;
  - a pre-aborted signal answers `cancelled`, and so does one aborted after the request was posted, while the worker
    reads the feature file;
  - after disposal, the query answers `invalid-revision`.

  Five consecutive runs of the file passed.

Toolkit measurement (deliverable 4):

- **Method.** A scratch script, not committed, opened a session over this worktree at `488e007`'s code, with the
  resident's analysis limits and `maxReportBytes` raised to 128 MiB. It queried with the plan's limits: 240, 280, 4 and
  32 MiB for details; 240, 40 and 16 MiB for titles; 64 MiB for the projection. Wall times:

  | Session | Open | Hot queries | Warm query (rehydrating) | Hot after rehydration |
  | --- | ---: | --- | ---: | ---: |
  | In-process engine, run 1 | 4.75 s | 889, 734, 838 ms | 1,813 ms | 659 ms |
  | In-process engine, run 2 | 4.96 s | 993, 653, 673 ms | 1,751 ms | 628 ms |
  | Real worker | 5.30 s | 908, 664, 638 ms | 1,670 ms | 622 ms |
  | Reference project, in-process | 1.56 s | 98, 55, 52 ms | 587 ms | 49 ms |

  The warm toolkit query is under 2 s, against the 15 s budget.
- **Toolkit projection.**
  - **Size.** 1,176,169 bytes (1.12 MiB), 1.75% of the 64 MiB `maxProjectionBytes`.
  - **Modules and symbols.** 15 modules and 1,275 symbols. 447 are exposed and 828 internal.
  - **Behavior.** 543 symbols carry a behavior: 21 constructable, 522 callable, 0 member and 0 unknown. 93 of them are
    exposed. The other 732 are supporting.
  - **Kinds.** 505 functions, 438 interfaces, 160 values, 150 types, 21 classes and 1 resource.
  - **Details.** 928 are described, 346 truncated and 1 unavailable (the resource).
  - **Tests.** 274 suite records from 154 files, holding 1,414 titles. There are no feature records.
  - **Counts.** `coverage 0`, `detailsUnavailable 1`, `unknownShapes 0`, `dynamicTitles 19`, `testsUnavailable 0` and
    `cut 346`.
  - **Determinism.** The hot, warm and later projections are byte-identical.
- **Titles against iteration 2.**
  - Iteration 2 read 1,392 titles and 17 dynamic ones from Vitest's files. This iteration's two test files add 21
    titles.
  - `subs/analysis/src/tests/session-worker-fixture.ts` is a testing-area source that Vitest does not run as a test file.
    Its `workerSuite` calls `describe(name, …)` twice, which adds 2 dynamic titles and 1 test title.
- **Reference.** 96,226 bytes: 89 symbols, 41 carrying a behavior, and 34 test records, one of them the
  `collection-review.viz.feature` record.

## Verification

```sh
npx vitest run subs/analysis/src/tests/architect-view.test.ts            # 12 passed
npx vitest run subs/analysis/src/tests/architect-view-session.test.ts    # 9 passed
npx vitest run subs/analysis/src/tests/api-view.test.ts subs/analysis/src/tests/api-view-session.test.ts   # 24 passed, files unchanged
npx vitest run subs/analysis/src/tests/session-worker.test.ts subs/analysis/src/tests/retained-session.test.ts   # 27 passed
npm run type-check                                                       # clean
npm run build                                                            # built
npm run check:self   # passed: 15 owners, 407 source files, 12 resources, 5915 accesses, 0 errors, 0 warnings, 0 analysis limits, 0 denied
```

These were run on the committed tree. Additional focused runs cover the files and witnesses this iteration touched:

```sh
npx vitest run subs/analysis/subs/typescript/src/tests/export-shapes.test.ts subs/analysis/subs/typescript/src/tests/test-titles.test.ts \
  subs/analysis/src/tests/dependency-behavior-capability.test.ts subs/analysis/src/tests/feature-titles.test.ts \
  subs/daemon/src/tests/session-counters.test.ts subs/daemon/subs/contexts/src/tests/api-view.test.ts   # 6 files, 28 passed
npx vitest run src/tests/dependency-diagram-daemon.test.ts                                    # 1 passed (BD24, built daemon)
npx vitest run src/tests/resident-assembly.test.ts subs/daemon/src/tests/service.test.ts      # 14 passed
npx vitest run subs/analysis/subs/descriptions/src/tests/descriptions.test.ts                 # 31 passed
```

- **Mutations.** Each of these was restored from a copy after its run:
  - keeping ineffective relays;
  - dropping the `testing`-profile filter;
  - listing relays farthest first;
  - ignoring `hasValue`;
  - not comparing a feature's bytes;
  - not checking the sequence.

  Each made at least one of the new tests fail.
- **`check:self`** ran twice with an owned `RAMIFY_ENDPOINT_DIR`, `/tmp/rp2b3-ep`, created with mode 0700. Each time,
  that daemon was stopped with `dist/src/ramify daemon stop`, `daemon status` answered `not running`, and its PID was
  gone.
- **BD24** starts and stops its own daemon.
- **Full suite.** The full test suite was not run.

## Deviations

- **Unresolved type-only originals stay supporting.** `behavior` is the shape's behavior only when the model's
  `hasValue` is true; otherwise it is `null`.
  - Iteration 1 answers an unresolved request as `value`/`unknown` whatever the original is, so without this rule an
    unresolved interface would become a behavior record.
  - `kind` is kept as the compiler answered, so an unresolved type-only original is a `value` with `hasValue: false`.
  - For a resolved export this changes nothing: the shape's own `null` for a symbol without a value reads the same flag.
- **Orders C3 leaves open.**
  - **Tree order.** Modules are in tree order, a module before its children and children in byte order. This is not
    the byte order of identifiers, because `-` sorts before `/`.
  - **Symbols and tests** are ordered by module in that tree order. Symbols then go by `name`, then `file`, then
    original key. Test records go by file, then source order.
  - **`destinations`** and every `reexposed[].to` are in byte order, as the model stores them, so both destinations read
    `["descendants","parent"]`.
- **Values C3 leaves open.**
  - **`binding`** is `null` when the binding is itself `default`, as for an anonymous default or a resource's
    `default`.
  - **`counts.cut`** counts each truncated detail once per symbol, and each cut test, feature and scenario title.
    `purpose` is uncut in the projection, so its cut belongs to the renderer.
  - **`counts.coverage`** counts distinct catalog limits, filtered as the check report filters resource descriptions.
- **Feature records.** A feature file with a `Feature:` line and no scenarios gives one record with `scenarios: []`, like
  a suite with no tests. A file with neither a feature nor a scenario gives none.
- **Feature reads.** The contract names only a mismatch.
  - A removed or replaced file (`ENOENT`, `ENOTDIR`, `EISDIR`) also answers `superseded`.
  - A file the revision did not capture, or another read failure, answers `analysis-failed`.
  - A supersession does not mark the session stale. The watcher or the next sweep publishes the change.
- **Limits.** Invalid query limits answer `resource-limit`, as `details` rejects invalid limits, both in the engine
  before any compiler work and in `projectArchitectView`.
- **Additional exports in `analysis`.**
  - `ArchitectViewPlan`, `ArchitectViewProvided`, `ArchitectViewProjectOutcome` and `architectLimitIssue` are exported
    from `architect-view.ts`.
  - `validFacts` is exported from `api-view.ts`.
  - None of them is exposed.
- **Outside the owner.** See [Outside the owner](#outside-the-owner): five pass-throughs or doubles and one description
  snapshot. They are needed because `RetainedSession` gained a required method that type-check enforces for every
  implementer.
- **Counter witness scope.** `shapeRuns()` and `testTitleRuns()` are read in the process that runs the compiler
  operations: the test process for an in-process session.
  - The worker does not relay them, and no protocol or status field was added.
  - The real-worker test verifies the protocol, not the counters. The engine code is the same in both.

## Limitations

- **Resource details.** A resource original always has a `detail` of `unavailable`/`unsupported-declaration`, and counts
  in `detailsUnavailable`: 1 on the toolkit, 2 on the reference project.
- **Test sources.** Every eight-extension source in a `testing`-profile area is read for titles, including helpers and
  declaration files. A helper that calls `describe` or `it`, such as `session-worker-fixture.ts`, contributes records.
- **Resident counters.** The daemon's own counters are not witnessed here; AV30 (iteration 7) covers them.
- **Documentation.** The architecture documents and the owner README do not describe `architectView` yet. Iteration 7
  owns documentation.

## Handoff

- **Iteration 4** receives:
  - **Types.** `ArchitectViewProjection` and its parts in `subs/analysis/src/interfaces/architect-view.ts`, exposed to
    root. Root does not re-expose them to descendants yet.
  - **Order.** The projection's arrays are in the orders above. The specification's record order, by role and consumer
    counts, is the renderer's.
  - **Destinations and purposes.** `destinations` read `["descendants","parent"]` when both. `purpose.text` is uncut;
    cut it at 600 bytes, add the cut to `_meta.json`'s `cut`, and add nothing else to the projection's `counts.cut`.
  - **Test records.** Suite records are already split at `maxTitlesPerRecord`. Feature records are split by the
    projection.
  - **Fixture.**
    - `architectFixture`, `architectPaths`, `architectProject(check, overrides)` and `architectLimits` are in
      `subs/analysis/src/tests/architect-fixture.ts`.
    - Its dependency boundaries are listed above.
    - Its `inputId` depends on the temporary root, so golden files should pass a fixed `inputId` to
      `projectArchitectView`, as `architect-view.test.ts` does.
  - **Scale.** The toolkit projection has 1,275 symbols, 543 of them carrying a behavior and 93 exposed ones, and 274
    test records. It is 1.12 MiB.
- **Iteration 6** receives:
  - **Operation.** `RetainedSession.architectView(query, control?)` with `ArchitectViewQuery`'s limits; the plan's
    values are `architectLimits`.
  - **Pass-throughs.** `ownedSession` in `src/resident-assembly.ts` and the daemon service's counted wrapper already
    pass it through.
  - **Double.** The contexts scripted driver answers `unavailable` and must be made to serve the view.
  - **Supersession.** `superseded` can carry `observedInputId: null`.
