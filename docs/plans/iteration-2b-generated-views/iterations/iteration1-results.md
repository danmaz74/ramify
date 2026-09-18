# Iteration 1 results: Classify export shapes

**Date:** 2026-09-18. **Mode:** direct work in worktree `/tmp/ramify-plan2b-architect-view`,
branch `feat/plan2b-architect-view`. It is based on the plan commit `c20b723`, whose code equals `577b980`.
The implementation commit is `6e3bc88`. The AV02 comparison was run against the build of that clean commit.

## Prerequisites

- None. The iteration's inventory held at `c20b723`: `BehaviorShapes` was private to `behavior-classifier.ts` and
  answered `capable`, `data` or `unknown`; `describeSymbolDetails` resolved a defining-file export privately inside
  `describeOne`; `RetainedSourceAnalysis` offered `details` but nothing classified an export.
- `dependency-behavior.test.ts`, `symbol-details.test.ts`, `dependency-analyzer.test.ts`, `dependency-diagram.test.ts`,
  `dependency-behavior-capability.test.ts` and `src/tests/dependency-diagram-daemon.test.ts` are unchanged by this
  iteration and pass after it.

## Built

### `analysis/typescript`

- `src/behavior-shapes.ts` (new) holds the one behavior-shape rule:
  - `BehaviorShape` is `'constructable' | 'callable' | 'member' | 'data' | 'unknown'`. `BehaviorCapability` is the
    consumer classifier's `'capable' | 'data' | 'unknown'`. `collapse(shape)` maps the three behaviors to `capable`.
  - `BehaviorShapes.shape(type, depth = 0)` keeps every existing rule: the depth limit of 8, `any` and `unknown` as
    `unknown`, the filtering of nullish, `void` and `never` parts, the instantiable-constraint rule, the exclusion of
    members declared only by a default or external library, and the non-recursive member check.
  - Precedence: a construct signature gives `constructable`, else a call signature gives `callable`, else a declared
    first-level function, method, class or constructor member, or a member whose own type has a signature, gives
    `member`. A union or intersection classifies every part first, as before, and then takes the first behavior in
    that order, else `unknown` if any part is `unknown`, else `data`.
  - `BehaviorShapes.of(type)` is `collapse(this.shape(type))`. The per-instance cache holds shapes.
- `src/behavior-classifier.ts` imports `BehaviorShapes` from `behavior-shapes.ts` and calls `of` as before. The local
  that holds its answer is renamed `capability`. Nothing else changed.
- `src/symbol-details.ts` exports the declaration resolution it already performed:
  - `declarationContext(inputs)` builds the root, ordinary roots and path owners once per call;
  - `resolveDeclaration(project, context, request)` returns the compiler symbol and primary declaration of a code
    original's defining-file export, or `missing-file`, `missing-export`, `identity-mismatch` or `compiler-failure`;
  - `validRequest` and `DeclarationInputs` are exported for reuse.

  `describeOne` calls `resolveDeclaration`, so symbol details and export shapes resolve identically.
- `src/export-shapes.ts` (new):
  - `describeExportShapes(project, { inventory, areas }, requests, signal?)` returns one frozen `ExportShape` per
    request, in request order. A repeated request is answered again in its place.
  - A `resource` original gives `kind: 'resource', behavior: null` without a compiler query.
  - `kind` comes from the primary declaration: class, function, interface, type alias (and JSDoc `@typedef` and
    `@callback`), enum and module declarations give their kind; any other declaration gives `value`.
  - `behavior` is `null` when the symbol has no `SymbolFlags.Value`, the flag the catalog's `hasValue` reads.
    Otherwise it is the shape of `getTypeOfSymbol(target)`, with `data` as `null`.
  - A request the compiler cannot resolve to the requested original is `kind: 'value', behavior: 'unknown'`.
  - An invalid request throws `SourceFailure('protocol-error')`. Cancellation before or during the call throws
    `SourceFailure('cancelled')`, with no partial result.
  - `shapeRuns()` counts `describeExportShapes` calls in the process, rejected ones included, as `behaviorRuns()`
    counts classifier runs.
- `src/interfaces/source.ts` adds C1's `ExportBehavior`, `ExportKind`, `ExportShapeRequest` and `ExportShape`, and
  `RetainedSourceAnalysis.shapes(requests, signal?)`.
- `src/retained-source-analysis.ts` implements `shapes` with `details`' precondition: a disposed adapter is
  `disposed`, an aborted signal is `cancelled`, and a released compiler is `unavailable`. The compiler runs guarded,
  so a lost server rejects with `read-failure` and is discarded. Like `details`, it does not require `describe`.
- `module.ramify` is unchanged. The new types reach the parent through the existing `interfaces/source.ts` selection;
  no consumer outside the owner calls `describeExportShapes` or `shapeRuns` yet.

### `analysis`

- `src/tests/session-test-fixture.ts`: `instrumentCompiler`'s adapter double passes `shapes` through to the real
  adapter, so it still implements the widened port.

### Tests

- `src/tests/fixtures.ts` adds the `shapes` fixture (`shapesFixture`) and `definingExports(catalog)`, one request per
  top-level export of a root-owner file that defines its original.
- `src/tests/export-shapes.test.ts` (new):
  - AV01, over the catalog's defining-file exports.
  - Request order, a repeated request, and unresolvable requests: an absent name, a name only a forwarding file
    exports, another original's export name, a missing file and an unknown owner.
  - Invalid requests, cancellation before and during the call, and the counter.
  - AV02's equivalence walk, described under Evidence.
- `src/tests/retained-source-analysis.test.ts` adds an `export shapes (AV03)` block of four tests beside the symbol
  details block.

## Evidence

| Row | Witness | Result |
| --- | --- | --- |
| AV01 | On `shapes`, the requests are every top-level export of each defining file in the helper's catalog, 20 in all, and the result has one entry per request in order. `run`, `default` (binding `greet`), `twice` and `again` (binding `twice`) are `function`/`callable`; `arrow` is `value`/`callable`; `Service` and the abstract `Base` are `class`/`constructable`; the hybrid value is `value`/`constructable`; the object with a method is `value`/`member`; the namespace with a function is `namespace`/`member`. The object holding only an array, a promise and a string, the array, the number, the string and `theme` are `value`/`null`; `Mode` is `enum`/`null`, `Shape` `interface`/`null`, `Label` `type`/`null`; `loose: any` is `value`/`unknown`; the stylesheet is `resource`/`null`, as the resource original `style.css` with binding `default`. The result is frozen and JSON round-trips | pass |
| AV02 | See the AV02 witnesses below | pass |
| AV03 | See the AV03 witnesses below | pass |

AV02 witnesses:

- **Unit equivalence.** `export-shapes.test.ts` runs, on five fixtures, the real consumer classifier in process:
  - the fixtures are `shapes` with a consumer of every export, and the four fixture sets of `dependency-behavior.test.ts`
    (copied, so that file stays unchanged);
  - the recorded accesses come from the compiler helper;
  - its facts equal the helper's `dependencyBehavior()` byte for byte on each fixture.

  A spy on `BehaviorShapes.prototype.shape` records every type it meets at every depth, and on `shapes` also every
  type `describeExportShapes` meets: 37 types (18, 14, 0, 4 and 1 per fixture; the unused-and-forwarded fixture meets
  none). The type of every identifier, member access and binding element in the fixture files adds 61 more.

  For all 98 types, the test compares a verbatim copy of the `577b980` rule (`BaseShapes`) with the new
  `BehaviorShapes` on fresh instances in the same order:
  - they make the same sequence of calls at the same depths, cache hits included;
  - `of(type)` equals the base answer and `collapse(shape(type))` for every type;
  - the shapes reached are 9 constructable, 28 callable, 12 member, 42 data and 7 unknown, so every branch is exercised.
- **Existing tests.** `dependency-behavior.test.ts` (6), `dependency-analyzer.test.ts` and `dependency-diagram.test.ts`
  (13) pass with their files unchanged.
- **Before/after facts.** A scratch script, `av02-facts.mjs`, runs one build over one project:
  1. the build's `dist/src/batch-entry.js` runs with the check capabilities plus `dependency-behavior`, which gives
     the batch classifier's per-file facts;
  2. the build's `dist/src/dependency-analyzer-entry.js` runs over that report with its behavior facts and capability
     removed, as a published revision carries it, which gives the lean analyzer's diagram;
  3. the script writes `{ inputId, dependencyBehavior, diagram }` as one JSON line.

  It ran with a build of `577b980`, in a temporary detached worktree with `node_modules` linked to the main checkout's,
  and with the build of `6e3bc88`. Each build ran over the same three project directories:

  | Project | Input | Per-file facts | Diagram | Output | SHA-256 (both builds) | Result |
  | --- | --- | --- | --- | ---: | --- | --- |
  | Toolkit at `6e3bc88` | `input/1:2c3a6750…ce7f` | 3,983 (1,415 behavioral, 2,560 non-behavioral, 8 unused), 0 limits | 492 boundaries, 71 / 371, complete | 2,803,501 B | `0e487f4b…f962` | byte-identical |
  | Toolkit at `577b980` | `input/1:a5a1ed7b…dbf0` | 3,944 (1,394, 2,542, 8), 0 limits | 488 boundaries, 71 / 367, complete | 2,775,613 B | `085486d0…140f` | byte-identical |
  | Collection Review (`examples/collection-review`) | `input/1:c5c4b499…261a` | 164 (64, 100), 0 limits | 65 boundaries, 17 / 48, complete | 157,581 B | `e2f42d29…d8b2` | byte-identical |

  `cmp` found no difference in any pair. The Collection Review diagram is 47,812 B, the size Plan 6D recorded. Wall
  time for one batch and analyzer run was 15.06 s against 15.08 s on the toolkit, and 5.87 s against 6.06 s on the
  reference, for the base and the new build.

AV03 witnesses:

- **Same answers.** On `shapes`, a retained adapter's `shapes` over the catalog's 20 defining-file exports, reversed
  and with the first repeated at the end, equals `describeExportShapes` on an in-process compiler over the same
  configuration and inputs. Each answer is in its request's place; more than five carry a behavior; the result is
  frozen.
- **Precondition.** A just-opened adapter answers before any `describe`. After `releaseCompiler` it rejects with
  `unavailable`, and after the next `update` it answers again. A killed compiler server rejects the call with
  `read-failure` and leaves the adapter cold.
- **Rejections.**
  - An invalid request rejects with `protocol-error`, and an aborted signal with `cancelled`; the compiler stays hot
    after both.
  - After disposal the call rejects with `disposed`.
- **Resident trace.** `dependency-behavior-capability.test.ts` and the built-daemon BD24 test still pass, so no
  retained-session process loads `behavior-classifier.js` (see Deviations).

## Verification

```sh
npx vitest run subs/analysis/subs/typescript/src/tests/export-shapes.test.ts            # 4 passed
npx vitest run subs/analysis/subs/typescript/src/tests/dependency-behavior.test.ts      # 6 passed
npx vitest run subs/analysis/subs/typescript/src/tests/symbol-details.test.ts           # 26 passed
npx vitest run subs/analysis/subs/typescript/src/tests/retained-source-analysis.test.ts # 23 passed
npx vitest run subs/analysis/src/tests/dependency-analyzer.test.ts subs/analysis/src/tests/dependency-diagram.test.ts  # 13 passed
npm run type-check                                                                      # clean
npm run build                                                                           # built
npm run check:self   # passed: 15 owners, 398 source files, 12 resources, 5736 accesses, 0 errors, 0 warnings, 0 analysis limits, 0 denied
```

Additional focused runs, for files this iteration touched or whose witnesses it affects:

```sh
npx vitest run subs/analysis/subs/typescript/src/tests                                  # 17 files, 197 passed
npx vitest run subs/analysis/src/tests/dependency-behavior-capability.test.ts           # 2 passed
npx vitest run subs/analysis/src/tests/session-revision.test.ts subs/analysis/src/tests/membership-differential.test.ts  # 39 passed
npx vitest run src/tests/dependency-diagram-daemon.test.ts                              # 1 passed (BD24, built daemon)
```

`check:self` ran with an owned `RAMIFY_ENDPOINT_DIR`, and that daemon was stopped with `dist/src/ramify daemon stop`.
BD24 starts and stops its own daemon. The temporary `577b980` worktree was removed after the comparison. The full test
suite was not run.

## Deviations

- **Location of the shape rule.** C1 places `BehaviorShapes.shape` in `behavior-classifier.ts`. It is in the new
  `behavior-shapes.ts` instead, and `behavior-classifier.ts` imports it, so there is still one function.
  - The reason is that `RetainedSourceAnalysis.shapes` runs in the retained session. With the rule in the classifier
    module, loading the retained adapter loads `behavior-classifier.js`.
  - Plan 6D's witnesses require that no retained session loads the classifier. The capability test asserts the
    classifier module never loads in-process, and BD24 traces every retained-session process. With the rule in
    `behavior-classifier.ts`, the capability test failed (`entries.inProcess` defined).
  - With the separate module, both witnesses pass unchanged.
- **Unresolvable exports.** C1 says an unresolvable declaration gives `unknown` for a value but names no `kind`.
  Without a declaration there is no kind, so every unresolvable request is `value`/`unknown`, whatever the catalog's
  `hasValue`. This covers a missing file, missing export, identity mismatch and compiler failure. The request carries
  no `hasValue`; iteration 3 has the catalog's and can decide how to use it.
- **Additions C1 does not name.**
  - JSDoc `@typedef` and `@callback` declarations give `type`.
  - Invalid requests reject with `protocol-error`, and cancellation with `cancelled`, as `details` does. C1 names no
    result-byte bound, so `describeExportShapes` has none.
  - `shapeRuns()` counts rejected calls too.
  - `BehaviorShapes.of` no longer takes a `depth`; only the recursive `shape` does.
- **Outside the owner.** `subs/analysis/src/tests/session-test-fixture.ts` changed by one line for the widened port.

## Limitations

- For each distinct object type it classifies, the consumer classifier now asks for construct signatures before call
  signatures. A function's type therefore costs one more compiler query than before, and a class's one fewer. The
  toolkit run's wall time was unchanged within noise (15.06 s against 15.08 s).
- For a merged declaration, `kind` follows the first declaration in byte order of file, then by position. An
  interface merged with a later class is `interface`, with the class's `constructable` behavior.
- The architecture documents and the owner README do not describe `shapes` yet. Iteration 7 owns documentation.

## Handoff

- **Iteration 2** extends the same files: `interfaces/source.ts`, `retained-source-analysis.ts` and the
  `instrumentCompiler` double in `subs/analysis/src/tests/session-test-fixture.ts`, which must pass `testTitles`
  through as it now passes `shapes`.
- **Iteration 3** receives:
  - **Operation.** `RetainedSourceAnalysis.shapes(requests, signal?)` returns `ExportShape[]`, one per request in
    request order, with no deduplication. It needs a hot compiler and no `describe`. It rejects with `unavailable`
    (released), `read-failure` (server lost), `disposed`, `cancelled` or `protocol-error` (invalid request).
  - **Batch function.** `describeExportShapes(project, { inventory, areas }, requests, signal?)` in `export-shapes.ts`.
  - **Unresolved requests.** `kind: 'value', behavior: 'unknown'`. Combine them with the catalog's `hasValue` if a
    type-only original should stay supporting.
  - **Counter.** `shapeRuns()` in `export-shapes.ts` counts calls in the process that runs them, which in the resident
    is the session worker. AV11's witness needs it read there or relayed, as the bridge relays the helper's
    `behaviorRuns`.
  - **Exposure.** Neither the function nor the counter is exposed. Add `expose-src` entries in
    `subs/analysis/subs/typescript/module.ramify`, and any relay, for the names `analysis` imports.
  - **Test helpers.** `shapesFixture` and `definingExports(catalog)` in `subs/analysis/subs/typescript/src/tests/fixtures.ts`.
  - **Shape rule.** `BehaviorShapes` and `collapse` in `behavior-shapes.ts`. Keep the classifier module out of any
    retained-session import path: the capability test and BD24 enforce it.
- **Equivalence recipe.**
  1. `npm run build` in both checkouts.
  2. `node av02-facts.mjs <build-root> <project-root> <out.json>` for each build and project. The script was not
     committed; it is described under AV02 above.
  3. `cmp` the outputs.
