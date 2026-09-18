# Iteration 2 results: Read test titles

**Date:** 2026-09-18. **Mode:** direct work in worktree `/tmp/ramify-plan2b-architect-view`,
branch `feat/plan2b-architect-view`. It is based on `9dbb95d`, iteration 1's completed results.
The implementation commit is `ccaf1bd`. Build, type-check and `check:self` were run on that commit.

## Prerequisites

- Iteration 1 is complete at `9dbb95d`, and its handoff held. `RetainedSourceAnalysis` offered `details` and `shapes`, and
  `instrumentCompiler` in `subs/analysis/src/tests/session-test-fixture.ts` passed both through. Nothing read test
  titles.
- `behavior-classifier.ts` is outside every retained-session import path. The new reader is in its own module,
  `test-titles.ts`, which imports only `node:path`, the compiler's types and syntax guards, `interfaces/source.ts`,
  `symbol-details.ts` and `wire.ts`. `dependency-behavior-capability.test.ts` and BD24 pass after this iteration.

## Built

### `analysis/typescript`

- `src/interfaces/source.ts` adds C2's `TestTitleLimits`, `TestSuiteTitles` and `TestFileTitles`, and
  `RetainedSourceAnalysis.testTitles(files, limits, signal?)`.
- `src/test-titles.ts` (new):
  - `describeTestTitles(project, root, files, limits, signal?)` returns one frozen `TestFileTitles` per request, in
    request order. A repeated request is answered again in its place. `root` resolves the project-relative paths
    (see Deviations).
  - **Recognition.** A suite is a call whose callee is `describe`, `describe` followed by property accesses, or a call or
    tagged template of such a chain. A test is the same for `it` and `test`. The title is the first argument.
  - **Walk.** The syntax tree is walked with an explicit stack, not recursion:
    - a suite call opens a scope for the arguments after its title;
    - a test call is a leaf, and nothing inside its arguments is read;
    - scopes are created in source order of their suites, which is the order of the entries.
  - **Hiding.** A binding named `describe`, `it` or `test` hides calls of that name inside its scope. For a file's own
    top-level declaration, that scope is the whole file, as C2 states. A parameter, block-level declaration, loop or
    catch variable, or named function expression hides the name inside its own scope (see Deviations). Imports are
    not the file's own bindings.
  - **Entries.** There is one `TestSuiteTitles` per suite with direct tests and one per suite with neither tests nor
    suites (`tests: []`). Tests outside any suite get one entry with `suite: []`. A suite whose tests are all nested
    gets no entry. A list longer than `maxTitlesPerRecord` continues in further entries with the same chain.
  - **Titles.**
    - A string literal or a template literal without substitutions is kept verbatim, so `%s` stays as written.
    - Any other title is `(dynamic)` and counted in `dynamic`.
    - A verbatim title longer than `maxTitleBytes` is cut on a code point boundary with a trailing `…` and counted in
      `cut`. The cut uses `truncateUtf8`, which `symbol-details.ts` now exports.
    - A suite title is counted once per call, not once per entry that repeats it.
  - **Unavailable files.** A file the program does not hold is `unavailable` with `not-in-program`. If the program
    returns a tree but reading it throws, the file is `compiler-failure`. A failed server request is not caught.
  - **Rejections.**
    - A request that is not a canonical project-relative path ending in `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`,
      `.mjs` or `.cjs` rejects with `protocol-error`.
    - Limits that are not positive safe integers reject with `resource-limit`, as `details` does.
    - A result whose encoded bytes exceed `maxResultBytes` rejects with `resource-limit`. The bytes are counted as
      each file is added.
    - Cancellation before the call, between files or after the last file rejects with `cancelled`.
    - A rejected call answers no partial result.
  - `testTitleRuns()` counts `describeTestTitles` calls in the process, including rejected ones.
- `src/retained-source-analysis.ts` implements `testTitles` with the precondition that `details` and `shapes` have: a
  disposed adapter is `disposed`, an aborted signal is `cancelled`, and a released compiler is `unavailable`. It needs
  no `describe`. The call runs guarded, so a lost server rejects with `read-failure` and leaves the adapter cold.
- `module.ramify` is unchanged. The new types reach `analysis` through the existing `interfaces/source.ts` selection.
  No consumer outside the owner calls `describeTestTitles` or `testTitleRuns` yet.

### `analysis`

- `src/feature-titles.ts` (new), pure text:
  - `readFeatureTitles(text, limits)` returns `{ feature, scenarios, cut }`, and `FeatureTitles` is the type without
    `cut`.
  - It recognizes lines whose first non-blank text is `Feature:`, `Scenario:`, `Example:`, `Scenario Outline:` or
    `Scenario Template:`, English only, and trims each title. The first `Feature:` line gives the feature title.
  - Lines inside a `"""` or ```` ``` ```` doc string are text, and a doc string ends only at its own delimiter.
  - A leading BOM is dropped. CRLF, CR and LF all end a line.
  - Titles longer than `maxTitleBytes` are cut on a code point boundary with a trailing `…` and counted.
  - Limits that are not positive safe integers throw `RangeError`.
- `src/tests/session-test-fixture.ts`: `instrumentCompiler`'s adapter double passes `testTitles` through.

### Tests

- `subs/analysis/subs/typescript/src/tests/fixtures.ts` adds `titlesFixture`, the TypeScript part of the `titles`
  fixture:
  - `suites.test.ts`: nested suites, direct tests beside a nested suite, a suite whose tests are all nested, an empty
    suite, tests outside any suite, `describe.skip`, `it.only` and `it.skip.each`.
  - `tables.test.ts`: `describe.each`, `test.each` with `%s`, a tagged-template table, `describe.only.each` with a
    template title, a template title with and without a substitution, and two computed titles.
  - `limits.test.ts`: a 300-byte ASCII test title, a 300-byte suite title whose 240-byte cut falls inside a two-byte
    character, and a suite of 45 tests.
  - `own-bindings.test.ts`: the file's own `function describe` and `const [test]`.
  - `local-bindings.test.ts`: `describe`, `it` and `test` hidden by a parameter, loop variable, catch variable and
    block constant.
  - `no-tests.test.ts`, a file without tests.
  - `plain.test.js`, which the fixture configuration leaves out because it has no `allowJs`.
  - `tests/outside.test.ts`, outside every module's `src/`.
- `subs/analysis/subs/typescript/src/tests/test-titles.test.ts` (new): AV04, AV05 and the batch half of AV07, five tests.
- `subs/analysis/subs/typescript/src/tests/retained-source-analysis.test.ts` adds a `test titles (AV07)` block of four
  tests beside the export shapes block.
- `subs/analysis/src/tests/feature-titles.test.ts` (new): AV06 and the reader's text rules, five tests. The `.feature`
  part of the `titles` fixture is in this file, because `analysis` tests cannot import the child owner's test source.

## Evidence

| Row | Witness | Result |
| --- | --- | --- |
| AV04 | See the AV04 witnesses below | pass |
| AV05 | See the AV05 witnesses below | pass |
| AV06 | See the AV06 witnesses below | pass |
| AV07 | See the AV07 witnesses below | pass |

AV04 witnesses, from `describeTestTitles` on `titles`, compared with hand-written expected entries:

- **`suites.test.ts`** gives six entries:
  - `[]` with `runs outside any suite` and `second outside`;
  - `outer` with its two direct tests, although the nested suite `outer › inner` sits between them;
  - `outer › inner` with two tests;
  - `only nested › leaf`, and no entry for `only nested`;
  - `empty suite` with `tests: []`;
  - `skipped suite` with `focused test` and `skipped table %i`.
- **`tables.test.ts`** gives three entries, with `dynamic: 3`:
  - `[]` with `case %s`;
  - `table suite %s` with `adds %i and %i` and `tagged table $value`;
  - `template suite %i` with `template without substitution` and three `(dynamic)` titles. These are the substituted
    template, a variable and a concatenation.
- **`own-bindings.test.ts`** gives one entry, `[]` with `kept test`. The file's own `describe('not a suite', …)` opens no
  suite, and `test('not a test')` is no test.
- **`local-bindings.test.ts`** gives `scoped` with `after the loop`, and `scoped › still a suite` with `nested`. The
  calls through the parameter, loop variable, catch variable and block constant contribute nothing.
- **`no-tests.test.ts`** gives no entries.
- **Result form.** The result is frozen and JSON round-trips.

AV05 witnesses:

- **Cut titles.**
  - On `limits.test.ts`, the 300-byte ASCII title is cut to 240 bytes plus `…`.
  - The 300-byte suite title is cut to 239 bytes plus `…`, because byte 240 falls inside `é`.
  - `cut` is 2. The suite title is counted once.
- **Long list.** The 45-test suite gives two entries with the chain `forty-five`, of 40 and 5 titles.
- **Other bounds.** With `maxTitleBytes: 5` and `maxTitlesPerRecord: 20`, every title is cut and `cut` is 50. The
  45 tests give entries of 20, 20 and 5.
- **Result bound.** `maxResultBytes` equal to the encoded result passes, and one byte fewer rejects with
  `resource-limit`. The same holds for two files, so the comma between entries is counted.
- **Rejections.**
  - Eight invalid paths reject with `protocol-error`: empty, absolute, `..`, `.`, an empty segment, a directory, a
    `.feature` file and backslashes.
  - Three invalid limits reject with `resource-limit`.
  - A signal aborted before the call rejects with `cancelled`, and so does one aborted while the first file is read.
    No result is answered.
  - `testTitleRuns()` rose by exactly the 14 calls made, rejected ones included.

AV06 witnesses, from `readFeatureTitles` on the `titles` feature text. The text has a `Feature`, a `Background`, two
`Scenario`s, a `Scenario Outline` with an `Examples:` table, a `Rule` with an `Example`, tags, a comment and a doc
string:

- **Titles in order.** The feature is `Collection review`. The scenarios are, in order, the two `Scenario` titles, the
  outline's title with `<rating>` kept, and the `Example` title. `cut` is 0.
- **Ignored lines.** `Rule`, `Background` and `Examples:` add nothing, and neither does the doc string's `Scenario:`
  line.
- **Non-English keywords.**
  - A `# language: fr` file using `Fonctionnalité`, `Scénario`, `Plan du scénario` and `Exemple` gives no feature and
    no scenarios.
  - `Feature Review` without a colon, lower-case `scenario:`, `Scenarios:`, `Examples:` and `Given Scenario:` are not
    keywords. `Scenario Template:` is one.
- **Other text rules.**
  - The first `Feature:` wins.
  - A BOM and CRLF, CR and LF line ends are read.
  - An empty `Scenario:` title is `''`.
  - The 300-byte ASCII and the 300-byte multibyte scenario titles are cut to 240 and 239 bytes plus `…`.
  - A doc string closes only at its own delimiter.

AV07 witnesses:

- **Unavailable files.** `describeTestTitles` answers `unavailable`/`not-in-program` for three files:
  - `tests/outside.test.ts`, outside the configuration's `include`;
  - `src/tests/plain.test.js`, left out without `allowJs`;
  - a missing `src/tests/absent.test.ts`.

  The other entries are in request order, and a repeated request is answered again. With a configuration that sets
  `allowJs`, the same `.js` file is `described`.
- **Unreadable tree.** A program whose tree cannot be read answers `compiler-failure` for that file alone. The next
  request is described.
- **Same answers.** A retained adapter's `testTitles` over ten requests equals `describeTestTitles` on an in-process
  compiler over the same configuration and inputs. The requests cover every `titles` file, the missing file and one
  repeat.
  - The retained synthetic configuration names `plain.test.js` as an explicit root, and it still leaves the file out
    without `allowJs`.
  - Both answer `not-in-program` for the same three files.
- **Precondition.**
  - A just-opened adapter answers before any `describe`.
  - After `releaseCompiler` it rejects with `unavailable`, and after the next `update` it answers the same result
    again.
  - A killed compiler server rejects the call with `read-failure` and leaves the adapter cold.
- **Rejections.**
  - An absolute path rejects with `protocol-error`, a 64-byte result limit with `resource-limit` and an aborted
    signal with `cancelled`. The compiler stays hot after all three.
  - After disposal the call rejects with `disposed`.

Toolkit sanity counts (deliverable 4):

- **Method.** A scratch script, not committed, ran `describeTestTitles` over the toolkit's Vitest files. Those are the
  files `vitest.config.ts` includes: tracked `src/tests/**/*.test.ts(x)` and `subs/**/src/**/*.test.ts(x)`. It used an
  in-process compiler over the toolkit's `tsconfig.json` with the plan's limits (240, 40, 16 MiB).

  | Commit | Files | Described | Suite entries | `suite: []` entries | Suites | Titles | Dynamic | Cut | Empty-suite entries | Continued lists | Encoded bytes |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
  | `ccaf1bd` | 151 | 151 | 264 | 11 | 253 | 1,392 | 17 | 0 | 0 | 0 | 140,951 |
  | The 149 files tracked at `9dbb95d` | 149 | 149 | 262 | 11 | 251 | 1,382 | 17 | 0 | 0 | 0 | 139,831 |

  One call over the 151 files took 184 ms and 210 ms in process in two runs. The deepest chain has two suites. Every suite has an entry
  of its own, so no toolkit suite has only nested suites.
- **File count.** The plan's 148 files were counted at `577b980`. Iteration 1 added `export-shapes.test.ts` (149), and
  this iteration adds `test-titles.test.ts` and `feature-titles.test.ts` (151).
- **Syntactic cross-check.** An independent walk over the same trees counted `describe`, `it` and `test` calls of every
  form, without hiding and including test bodies:
  - It found 100 table-form calls (`.each(table)(…)`) in these files. The plan's 121 includes the 21 in
    `scripts/**/*.test.ts`, which Vitest does not include.
  - It found 15 template-literal titles, all with substitutions. `scripts/` adds 3 more.
  - It found 18 `describe(root, …)` calls in `subs/analysis/subs/typescript/src/tests/descriptions.test.ts`. That file
    declares its own `async function describe`. The reader gives it one entry, `[]` with its 10 top-level `it` titles,
    and no suites.
- **The 17 dynamic titles** are:
  - the 15 substituted templates;
  - `it(test.name, …)` in `src/tests/lifecycle-process.test.ts`;
  - a concatenated title in `subs/analysis/subs/model/src/tests/available-originals.test.ts`.
- **Program membership.** No toolkit test file is outside the program.

Reference sanity check: `readFeatureTitles` on `examples/collection-review/subs/integration-tests/src/features/collection-review.viz.feature`
gives the feature `Collection review`. It gives one scenario, `A reviewer inspects the catalog and reviews both records
through both surfaces`, with `cut: 0`. These are the file's only two keyword lines.

## Verification

```sh
npx vitest run subs/analysis/subs/typescript/src/tests/test-titles.test.ts              # 5 passed
npx vitest run subs/analysis/src/tests/feature-titles.test.ts                           # 5 passed
npx vitest run subs/analysis/subs/typescript/src/tests/retained-source-analysis.test.ts # 27 passed
npm run type-check                                                                      # clean
npm run build                                                                           # built
npm run check:self   # passed: 15 owners, 402 source files, 12 resources, 5803 accesses, 0 errors, 0 warnings, 0 analysis limits, 0 denied
```

The three focused files were run together after the last edit (3 files, 37 passed). Additional focused runs cover the
owner's other tests and the tests of the widened port's double. They also cover the witnesses that no retained session
loads the classifier:

```sh
npx vitest run subs/analysis/subs/typescript/src/tests subs/analysis/src/tests/dependency-behavior-capability.test.ts \
  subs/analysis/src/tests/session-revision.test.ts subs/analysis/src/tests/membership-differential.test.ts \
  subs/analysis/src/tests/feature-titles.test.ts                                        # 22 files, 252 passed
npx vitest run src/tests/dependency-diagram-daemon.test.ts                              # 1 passed (BD24, built daemon)
```

- **Mutations.** Each of these was undone after its run:
  - dropping hiding altogether;
  - dropping nested hiding by blocks, parameters, loops or catch variables, each alone;
  - dropping the call-of-a-call form;
  - dropping the cut;
  - listing the file itself when it has no tests.

  Each made `test-titles.test.ts` fail. The last one first survived, and the `no-tests.test.ts` fixture file was added
  for it.
- **`check:self`** ran with an owned `RAMIFY_ENDPOINT_DIR` under `/tmp`. The scratchpad path exceeded the 100-byte
  socket limit. That daemon was stopped with `dist/src/ramify daemon stop`, and `daemon status` answered `not running`.
- **BD24** starts and stops its own daemon.
- **Full suite.** The full test suite was not run.

## Deviations

- **The `root` parameter.**
  - C2 names `describeTestTitles(project, files, limits, signal?)`. The function takes
    `(project, root, files, limits, signal?)`.
  - The compiler's `Project` does not carry the project root, and C2's files are project-relative. The retained
    program is opened from a synthetic configuration beside the selected one, which need not be at the root.
  - `RetainedSourceAnalysis.testTitles(files, limits, signal?)` keeps C2's signature and passes its root.
- **Nested bindings hide names too.**
  - C2: "A file with its own top-level binding named `describe`, `it` or `test` contributes no calls of that name." That
    rule is kept exactly.
  - In addition, a parameter, a block-level declaration, a `for`, `for…in` or `for…of` variable, a catch variable or a
    named function expression hides the name inside its own scope.
  - **The code met:** `src/tests/explorer-process.test.ts` declares
    `async function until(read, timeoutMs, describe: () => string)` and calls `describe()`. Under the top-level rule
    alone, that call is a suite with no title. It gives the record `{"suite":["(dynamic)"],"tests":[]}` and one dynamic
    count.
  - With scoped hiding, the toolkit has 17 dynamic titles instead of 18 and no empty-suite record. This keeps the rule's
    intent: a function of the file's own named `describe` is not a suite.
- **Additions C2 does not name.**
  - **Leaf tests.** A test call is a leaf: calls inside its arguments are not read.
  - **Tagged tables.** A tagged-template table (`test.each\`…\`(title, fn)`) is recognized like
    `test.each(table)(title, fn)`.
  - **What is cut and counted.** Only verbatim titles are cut; `(dynamic)` is never cut. `dynamic` and `cut` count once
    per call, so a suite title is not counted again in each entry that repeats it.
  - **Request checks.**
    - Requests must be canonical project-relative paths with one of the eight extensions C3 lists.
    - Invalid limits reject with `resource-limit`, as `details` does.
    - A repeated request is answered again.
    - `testTitleRuns()` counts rejected calls.
  - **`compiler-failure`.** It is used for a tree the program returned that could not be read. A failed server request
    is not an entry; the retained adapter turns it into `read-failure`.
  - **`readFeatureTitles` text rules.**
    - It keeps the first `Feature:` title.
    - It treats doc-string contents as text.
    - It drops a leading BOM and reads CRLF, CR and LF.
    - It throws `RangeError` for invalid limits.
    - It does not split scenarios into records.
- **Outside the owner.**
  - `subs/analysis/src/tests/session-test-fixture.ts` changed by one line for the widened port.
  - `truncateUtf8` in `symbol-details.ts` is now exported for the title cut.

## Limitations

- **Name-based recognition.** Recognition is static and by name:
  - Aliases such as `import { test as check }`, other APIs such as `suite` or `bench`, and suites built by helper
    functions are read only as written.
  - A call made inside a helper is attributed to the scope where it is written, not where the helper is invoked, so
    those titles are usually `(dynamic)`.
  - A standalone `describe.each(table)` that is never called is read as a suite titled by its table.
- **Top-level bindings that hide real tests.** Some common forms are top-level bindings, so the file contributes no
  calls of those names:
  - a fixture test, `const test = base.extend(…)`;
  - a CommonJS `const { describe, it } = require('vitest')`.

  C2's rule decides this, and the toolkit has neither form.
- **Approximate scopes.** A nested `var` hides its name only in its block, not in its whole function. A declaration in
  one `case` clause hides its name only in that clause.
- **Gherkin coverage.** Keywords are English only; `# language:` headers are not interpreted. `Rule`, `Background` and
  tags carry no titles.
- **Documentation.** The architecture documents and the owner README do not describe `testTitles` yet. Iteration 7
  owns documentation.

## Handoff

- **Iteration 3** receives:
  - **Operation.** `RetainedSourceAnalysis.testTitles(files, limits, signal?)` returns `TestFileTitles[]`, one per
    request in request order, with no deduplication. It needs a hot compiler and no `describe`. It rejects with
    `unavailable` (released), `read-failure` (server lost), `disposed`, `cancelled`, `protocol-error` (invalid path) or
    `resource-limit` (invalid limits, or a result above `maxResultBytes`).
  - **Batch function.** `describeTestTitles(project, root, files, limits, signal?)` in `test-titles.ts`.
  - **Requests.** Send only canonical project-relative paths ending in `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`,
    `.mjs` or `.cjs`. Any other request rejects the whole call.
  - **Results.**
    - A file outside the retained program is `not-in-program`; count these as `testsUnavailable`.
    - A `.js` test file in a project without `allowJs` is one of them, even though the inventory lists it as source.
    - `dynamic` and `cut` are per file.
    - Entries are already split at `maxTitlesPerRecord` and ordered by suite start. The entry with `suite: []` is first
      when present.
  - **Counter.** `testTitleRuns()` in `test-titles.ts` counts calls in the process that runs them, which in the resident
    is the session worker. AV11's witness needs it read there or relayed, like `shapeRuns()`.
  - **Exposure.**
    - Neither the function nor the counter is exposed.
    - `TestTitleLimits`, `TestSuiteTitles` and `TestFileTitles` reach `analysis` through
      `expose-src * from "interfaces/source.ts"`.
    - For `ArchitectViewQuery.tests` to reach the root and the daemon, add `TestTitleLimits` to `analysis`'s
      `expose-sub … from typescript` list (A8), or relay it as the plan decides.
  - **Feature titles.**
    - `readFeatureTitles(text, limits)` and `FeatureTitles` are in `subs/analysis/src/feature-titles.ts`, which needs
      no exposure inside `analysis`.
    - Scenarios come back unsplit, so the projection splits them at `maxTitlesPerRecord`.
    - Add the returned `cut` to the view's `cut` count.
    - Validate limits before calling, since invalid limits throw `RangeError`.
  - **Test helpers.**
    - `titlesFixture` in `subs/analysis/subs/typescript/src/tests/fixtures.ts`.
    - The `.feature` text in `subs/analysis/src/tests/feature-titles.test.ts`.
  - **Scale.** On the toolkit the reader answers 151 files in about 0.2 s, with 140,951 encoded bytes. That is under
    1% of the 16 MiB result limit.
- **Iteration 7** documents `testTitles`, the scoped-hiding rule and the limitations above in the specification's
  `tests.jsonl` section and the owner README.
