# Plan 2B acceptance matrix

**Date:** 2026-09-18. **Status:** accepted strict gate for [Plan 2B](main-plan.md),
with its [contracts](contracts.md) and [agent test cases](test-cases.md).
Every row is required. Only AV31's macOS half may be recorded as unexecuted,
with its reason.

## Fixtures

- `shapes`: a compiler-backed project whose defining files export a function,
  an arrow constant, a class, an abstract class, a value with both call and
  construct signatures, an object literal with a method, an object with only
  an array, promise and string, a namespace with a function, an enum, an
  interface, a type alias, a number, a string, an `any` value, a `default`
  function, an original exported under two names, and an imported stylesheet
  resource.
- `titles`: Vitest files with nested suites, direct tests beside a nested
  suite, a suite with no tests, tests outside any suite, `describe.skip`,
  `it.only`, `test.each(table)` with `%s`, a template title with and without a
  substitution, a computed title, a 300-byte title, a suite with 45 tests, a
  file that declares its own `describe`, and a `.feature` file with a
  `Feature`, two `Scenario`s, a `Scenario Outline`, an `Example` and a `Rule`.
- `architect`: a three-level module project with owned exposures to parent
  and descendants, an `expose-sub` relay by the parent and by the root, an
  internal export, a testing module that imports production originals, a
  module without a README, a module with `src/docs/`, and consumers with
  behavioral, non-behavioral, unknown and mixed use of one original through
  two imported modules. From iteration 6 it also has test files that call a
  same-owner original, only import a type, call an original and name its
  type, and reference an original the classifier cannot settle.
- `reference`: `examples/collection-review`.
- `toolkit`: this repository.

## Export shapes (iteration 1)

| ID | Case |
| --- | --- |
| AV01 | On `shapes`, each export has the `kind` and `behavior` the [classification table](../../architecture/architect-view.spec.md#classification) gives: the hybrid value is `constructable`, the object with a method and the namespace with a function are `member`, library-only members give `null`, `any` gives `unknown`, the resource is `resource` with `null`, the interface, alias and enum are `null`. |
| AV02 | For every type the consumer classifier meets on `shapes` and the existing dependency-behavior fixtures, `of(type)` equals `collapse(shape(type))`; the existing dependency-behavior and analyzer tests pass unchanged; the lean analyzer's diagram facts for `toolkit` and `reference` are byte-identical to those at commit `577b980`. |
| AV03 | `RetainedSourceAnalysis.shapes` returns what `describeExportShapes` returns on the same project, in request order, and requires a hot compiler as `details` does. |

## Test titles (iteration 2)

| ID | Case |
| --- | --- |
| AV04 | On `titles`, `describeTestTitles` yields one entry per suite with direct tests, one for the empty suite, one with `suite: []`, none for a suite whose tests are all nested, modifiers and tables recognized, `%s` verbatim, the substituted template and the computed title `(dynamic)` and counted, and no calls from the file that declares its own `describe`. |
| AV05 | The 300-byte title is cut to 240 bytes plus `…` and counted; the 45-test suite yields entries of 40 and 5 with the same chain; exceeding `maxResultBytes` and cancellation throw `SourceFailure` with no partial result. |
| AV06 | `readFeatureTitles` gives the feature and the `Scenario`, `Scenario Outline` and `Example` titles in order, ignores `Rule`, and ignores non-English keywords. |
| AV07 | A test file outside the compiler program is `unavailable` with `not-in-program`; `RetainedSourceAnalysis.testTitles` matches the batch function. |

## Projection and session (iteration 3)

| ID | Case |
| --- | --- |
| AV08 | On `architect`, every owned exported original appears once with the contract's `name`, `binding`, `exposureNames`, `role`, `destinations`, `tags` and `reexposed` (nearest first); the internal export is `internal`; relayed originals appear only at their owner. |
| AV09 | Module facts: identifier, `dir`, parent, children, header tags, present areas, the missing README as `missing`, the `src/docs/` file listed, own and subtree source counts. |
| AV10 | Test records come only from `testing`-profile areas; a `.feature` whose bytes changed after the revision answers `superseded`. |
| AV11 | `RetainedSession.architectView` answers `projected` for the current sequence through the real worker, `invalid-revision` for another sequence, `resource-limit` above `maxProjectionBytes` and `cancelled` on abort; after `check`, watch updates and changed-file checks, `shapeRuns()` and `testTitleRuns()` are zero. |

## Rendering (iteration 4)

| ID | Case |
| --- | --- |
| AV12 | Every module has a directory with the four files, the root module's at the view root; empty record files are `"\n"`; the file set is exactly the specification's. |
| AV13 | Records follow the field order; optional fields are omitted, never `null`; `as` holds four names with `asMore`; consumer lists hold twelve with `…More`; `cut` and `detail` appear as specified. |
| AV14 | With measured facts on `architect`, units follow the precedence, each consumer appears in one list, the testing module appears nowhere, `uses` and `usedBy` count distinct originals per pair; with unavailable facts, no consumer field, `uses` or `usedBy` appears and `_meta.json` names the reason. |
| AV15 | Records are ordered by role, consumer counts and name; tests by file and source order. |
| AV16 | `README.md` opens with the instruction block, names the revision, and lists every module in tree order with tags, the purpose cut at 600 bytes, the counts line (`uses ? · used by ?` when unavailable) and at most eight headline names with `+N`. |
| AV17 | `_meta.json` has the schema, revision, input, module count, dependency state, scope and metrics state, and exceptional counts only when nonzero; every `module.json` repeats the revision. |
| AV18 | The same input renders the same bytes; output has no timestamp, absolute path or process value; measured facts with another `inputId` throw. |

## Reserved name and publisher (iteration 5)

| ID | Case |
| --- | --- |
| AV19 | `.ramify-architect` and its `.tmp-*` and `.old-*` siblings, including marker files, are reserved at any depth; the near misses are ordinary; inventory, the configuration host, capture, the observer and the watcher skip them. |
| AV20 | The publisher creates `.ramify-architect` with `_meta.json` last; an unchanged repeat writes nothing; a changed view replaces it completely, removing stale files. |
| AV21 | API and architect targets publish as one transaction: an injected failure while switching the second target restores the first; cancellation before switching changes nothing. |
| AV22 | An existing `.ramify-architect` that is a file, lacks `_meta.json`, names another schema or contains a symbolic link refuses the invocation and is left untouched; leftover `.tmp-*` and `.old-*` siblings are recovered. |
| AV23 | The toolkit's and the reference project's `.gitignore` list the three patterns; `rg` from the root returns no line from a materialized view, and `rg <term> .ramify-architect/` returns them. |

## Test references (iteration 6)

| ID | Case |
| --- | --- |
| AV38 | On `architect`, `projectTestReferences` lists per test file the originals it references behaviorally, including a same-owner original; a type-only reference is absent; a file that calls an original and names its type lists it once; a pair classified unknown is counted in `unclassified`, not listed; a production file appears in no entry; the analyzer's `ready` outcome carries the references through the process runner; the diagram facts for `architect`, `toolkit` and `reference` are byte-identical to those at commit `06ccfca`. |
| AV39 | Rendered with measured references, every suite record of one file carries the same `exercises` as `<owner>#<name>` in byte order, twelve with `exercisesMore`, `[]` for a file without behavioral references; feature records carry none; with `testReferences: null` or unavailable dependencies no record carries it; `_meta.json` records `testReferences` after `dependencyScope` and `unclassifiedExercises` only when nonzero; consumer lists and `uses`/`usedBy` are unchanged by the test files; references with another `inputId` throw; AV12–AV18 still pass with the golden files regenerated and reviewed. |

## Materialize (iteration 7)

| ID | Case |
| --- | --- |
| AV24 | CLI grammar: repeated `--view`, unknown and duplicate values, and `--from` or `--all` without `api` exit 2 before connecting; without `--view` the request has no `views` field and output is Plan 2A's. |
| AV25 | Wire: validation of `views`; the daemon advertises `materialize-views`; a client facing a daemon without it exits 2 with `incompatible-service`. |
| AV26 | Contexts: one synchronized revision; the session is called only for requested views, both at the pinned sequence; either `superseded` makes the outcome `superseded`. |
| AV27 | Dependency wait with a controllable runner: `ready` gives measured dependencies and test references, and the renderer receives both; `busy` waits and then succeeds; `superseded` publishes nothing; `unavailable` publishes with its reason; the wait limit publishes with `wait-limit`; cancellation during the wait publishes nothing. |
| AV28 | Quick end-to-end: `materialize --view api --view architect --all` through the quick environment publishes both targets in one transaction and prints the architect line. |

## Real runs and evidence (iteration 8)

| ID | Case |
| --- | --- |
| AV29 | The compiled CLI and daemon materialize the architect view for `reference` and `toolkit`; the trees match an independently computed expectation for `reference`; an unchanged repeat writes nothing; the owned daemon is stopped in `finally`. |
| AV30 | Invariance: identical inputs give identical check reports, revision sequences and session counters with and without interleaved materialization, and publishing the view starts no revision. |
| AV31 | Determinism: two materializations of each project are byte-identical on Linux; macOS is run if a host is available, otherwise recorded as unexecuted. |
| AV32 | Hit cost: for `revision`, `project`, `session`, `publish`, `watch` and `create`, lines and bytes per file kind on `toolkit` and `reference`, each term within 200 lines and 64 KB; mean and maximum behavior record length recorded. |
| AV33 | Measurements against the [budgets](main-plan.md#resource-budgets): session query and whole-command latency with and without dependency facts, files, bytes, unchanged-repeat writes and peak daemon memory on `toolkit`, `reference` and S100. |
| AV34 | Regressions: the Plan 2A harness passes and `ramify materialize` without `--view` is byte-identical; build, type-check, `check:self`, `check:reference` and `reference:cases` pass; the `./cli` and `./client` closures still exclude analysis, the worker and TypeScript; the eight package entries are unchanged. |

## Defect fixes (iteration 9)

| ID | Case |
| --- | --- |
| AV40 | After a context opened by one invocation form is reached by another (`check` from the root, then `materialize --view architect --root <root>` from another directory; `check --root .`, then a command without `--root`), the dependency analyzer answers `ready` for unchanged inputs, `materialize --view architect` publishes measured dependencies within the whole-command budget, and a real input change still answers `inputs-changed` or supersedes the wait. |
| AV41 | A resident session opened while `.ramify` and `.ramify-architect` directories exist records none of their paths as inputs, and its input identity equals a batch check's of the same project. |
| AV42 | When removing a failed stage fails, its marker remains and sibling recovery later removes the stage, for both targets; with a leftover marker file at the project root of the toolkit and the reference project, `git status` shows nothing from it. |
| AV43 | `npm run reference:cases` passes: the five predecessor tests describe the fifteen-owner toolkit and the documents' current explorer status, and no Plan 2A or Plan 2B case changes. |

## Agent trials and completion (iteration 10)

| ID | Case |
| --- | --- |
| AV35 | The [core cases](test-cases.md#core-set) run on Claude Code and Codex CLI and meet the pass criteria, or the failure is recorded as H1's falsification with its evidence. |
| AV36 | The [extended cases](test-cases.md#extended-set) run on both harnesses and are recorded. |
| AV37 | `AGENTS.md`, the specification, the roadmap and the completion report describe the implemented view, its measured limits, the trial results and the verdict on H1. |
