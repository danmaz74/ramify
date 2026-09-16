# Iteration 5 results: Complete API-view projection

**Status:** complete. **Plan:** [Plan 2A](../main-plan.md). **Iteration:**
[iteration5.md](iteration5.md). **Owner:** `analysis` composition and its
tests (plus the two `module.ramify` files and the root relay owners.md's
"Cross-subtree relay additions" item 4 assigns to this iteration).

## Summary

Added `planApiViewRequests` and `projectApiView` to `analysis`
(`subs/analysis/src/api-view.ts`): a pure, two-step join from `SessionFacts`
into complete, bounded, deterministic ordinary and testing `ApiViewProjection`
data, with no filesystem, compiler or retention access. `planApiViewRequests`
names the unique `SymbolDetailRequest`s one query needs (for the caller's
single `RetainedSourceAnalysis.details(...)` call); `projectApiView` performs
the identical deterministic join a second time and folds each result in
through a synchronous `detailsOf` lookup, enforcing the area/invocation byte
bounds before returning. Added the nine `ApiView*` projection types plus
`ApiViewQuery`/`ApiViewQueryOutcome` to `interfaces/session.ts` (not the
`RetainedSession.apiView` method itself, left for iteration 7, per the
coordinator's explicit instruction). Wired all nine `I2A-05` leaves into the
reference harness, and also wired the fifteen `I2A-03`/`I2A-04` leaves that
were previously registered but unwired (per the coordinator's mid-task
request), so `npm run reference:verify -- --plan 2a --iteration 5` passes
honestly: 41/41 required instances pass, 63 correctly `not-executed`
(`future-iteration`).

## Files changed

### `analysis` (owned)

- `subs/analysis/src/api-view.ts` (new) -- `planApiViewRequests`,
  `projectApiView`, `ApiViewProjectOutcome`, and their private join/validation
  helpers (`resolveModules`, `categoryFor`, `joinArea`, `groupEntries`,
  `coverageCount`, `encodedBytes`, `validFacts`, `canonicalPath`,
  `parentIndex`, `originalsIndex`).
- `subs/analysis/src/interfaces/session.ts` -- added `ApiViewCategory`,
  `ApiViewEntry`, `ApiViewFile`, `ApiViewAreaProjection`,
  `ApiViewModuleProjection`, `ApiViewProjection`, `ApiViewSelection`,
  `ApiViewQuery`, `ApiViewQueryOutcome`, carried by the file's existing
  `expose-src * from "interfaces/session.ts" to parent` wildcard. No method
  was added to `RetainedSession`.
- `subs/analysis/src/index.ts` -- added
  `export { planApiViewRequests, projectApiView } from './api-view.js';` and
  `export type { ApiViewProjectOutcome } from './api-view.js';`.
- `subs/analysis/src/tests/api-view.test.ts` (new, 17 tests) -- all nine
  `I2A-05` leaves plus general-correctness tests (selection resolution,
  invalid-input rejection, detail-marker counting).
- `subs/analysis/module.ramify` -- added
  `expose-src planApiViewRequests, projectApiView from "api-view.ts" to parent`
  (a revision of the reviewed single-name line; see "Contract deviations").

### Root

- `/ramify/module.ramify` -- appended `ApiViewCategory, ApiViewEntry,
  ApiViewFile, ApiViewAreaProjection, ApiViewModuleProjection,
  ApiViewProjection, ApiViewSelection, ApiViewQuery, ApiViewQueryOutcome` to
  the existing "R3" `expose-sub ... from analysis to descendants` line, per
  owners.md's "Cross-subtree relay additions" item 4.

### Documentation

- `docs/plans/iteration-2a-materialized-api-view/owners.md` -- added a dated
  "Revision (iteration 5, 2026-09-15)" note recording the two-name owned
  exposure line and confirming item 4's completion.

### Reference harness (shared infrastructure, per the coordinator's explicit
mid-task instruction to wire unit-test-backed `I2A-03`/`I2A-04` leaves)

- `scripts/reference-harness/plan2a-projection-cases.ts` (new) -- the nine
  `I2A-05` handlers. Builds `SessionFacts`-shaped values from real batch
  `AnalysisReport` snapshots (`factsFrom`) for R/T evidence, and from small
  purpose-built fixture trees (transcribed independently from, not imported
  from, `api-view.test.ts`'s `ancestryFiles`/`emptyFiles`) for F evidence.
- `scripts/reference-harness/plan2a-symbol-details-cases.ts` (new) -- the
  eight `I2A-04` handlers, ported from
  `subs/analysis/subs/typescript/src/tests/symbol-details.test.ts`'s own
  fixture-F cases, using a real, independently opened
  `typescript/unstable/sync` `Project` exactly as that test file does. Only
  declaration kinds unaffected by the concurrent class-rendering work on
  `symbol-details.ts` (function, a plain class with no heritage/static
  members, interface, type-alias, enum, variable, default export) are
  exercised, to avoid racing that edit.
- `scripts/reference-harness/plan2a-availability-cases.ts` -- added the seven
  previously-unwired `I2A-03` handlers (`value-available`, `pure-type`,
  `required-symbol-fallback`, `required-importer-block`, `testing-origin`,
  `test-complete-reclassification`, `same-owner-absent`), ported from
  `available-originals.test.ts`'s own fixture-F cases using the same
  `subs/analysis/subs/model/src/tests/fixtures.ts` helpers
  (`moduleRecord`/`original`/`exposure`/`modelOf`).
- `scripts/reference-harness/plan2a-runtime.ts` -- merged in
  `plan2aProjectionHandlers` and `plan2aSymbolDetailsHandlers`; added
  `'symbol-details'` and `'projection'` to the runtime's capability set.

No file under `analysis/model`, `analysis/project`, `analysis/typescript`,
`daemon`, `daemon/contexts`, `cli` or root's own `interfaces/service.ts` was
touched. `subs/analysis/subs/typescript/src/symbol-details.ts` (the parallel
agent's class-rendering work) was not touched.

## Design: why two functions, and their exact contract

`SymbolDetail` extraction is asynchronous (`RetainedSourceAnalysis.details`)
and owned by `analysis/typescript`; a pure projection function cannot call it.
Per the coordinator's two offered designs, this iteration picked option (a):

1. `planApiViewRequests(facts: SessionFacts, selection: ApiViewSelection):
   { status: 'planned'; requests: readonly SymbolDetailRequest[] } |
   { status: 'unavailable'; reason: 'invalid-location' | 'invalid-projection'
     | 'analysis-failed'; message: string }` -- resolves the selection to one
   or every inventory module, performs the same availability/catalog join
   `projectApiView` performs, and returns the deduplicated, byte-ordered list
   of `SymbolDetailRequest`s the caller must fetch with one
   `RetainedSourceAnalysis.details(...)` call.
2. `projectApiView(facts: SessionFacts, sequence: number, inputId: string,
   selection: ApiViewSelection, detailsOf: (request: SymbolDetailRequest) =>
   SymbolDetail, limits: { maxAreaBytes: number; maxInvocationBytes: number
   }): ApiViewProjectOutcome` -- the exposed main entry. Recomputes the
   identical join (cheap and pure: no filesystem/compiler work, just iterating
   already-retained `SessionFacts`) and folds each entry's detail through the
   synchronous `detailsOf` lookup the caller built from the async results,
   enforcing bounds before returning.

`sequence`/`inputId` are accepted as explicit parameters (not derived from
`SessionFacts`, which carries neither) because `RetainedSession.apiView`
(iteration 7) already knows both from its own `SessionRevision` and must stamp
them into `ApiViewProjection` verbatim. `ApiViewProjectOutcome = Exclude<
ApiViewQueryOutcome, { status: 'superseded' | 'cancelled' }>` -- a narrowed
alias of the type this iteration already added to `interfaces/session.ts`,
rather than a new named type, since `projectApiView` never compares against a
later observation or crosses an abortable async boundary itself; those two
states, and `'invalid-revision'`, are exclusively iteration 7's to produce.

`detailsOf` must return a result for every request `planApiViewRequests`
named for the same `facts`/`selection`; it throws otherwise (a caller-contract
violation, not a projectable outcome). Iteration 7 typically builds it from a
`Map` keyed by `(originalKey(original), exportName)` over one
`details(planned.requests, limits)` call's results, matching this iteration's
own test/harness helper (`lookupFrom`).

## A load-bearing correction found only by running real fixtures

The original design assumed `AvailableOriginal.original.file` (i.e.
`OriginalId.file`) was the project-relative defining-file path scope.md's join
describes. Running the first real-project test immediately falsified this:
`OriginalId.file` is relative to *the original's own owner's* `src/`
directory (the same convention `SymbolDetailRequest.original` and the
TypeScript adapter use -- confirmed at `subs/analysis/subs/typescript/src/catalog.ts`'s
`OriginalId` construction, `relative(resolve(root, ordinary.root), resolve(root, file))`),
not the project root. The project-relative path scope.md's join and the
generated document path actually need is `Original.origin.file`
(`SourceOrigin.file`, confirmed project-relative at the same file's `origin()`
helper, `{ file: inventory.path, ... }`). `joinArea` therefore resolves each
available `OriginalId` back to its full `Original` record in `model.originals`
(via `originalKey`) for `origin.file`, and uses *that* for both the
`SourceCatalog.files` lookup and `ApiViewFile.definingFile` -- while
`SymbolDetailRequest.original` still carries the original `OriginalId`
(owner-relative), unchanged, since that is what the TypeScript adapter
expects. This is recorded here rather than as a `contracts.md`/`scope.md`
revision because neither document specifies the internal representation this
precisely; it is a bug that real R/T evidence caught before any handoff, not
a settled contract this iteration changed.

## Coverage rule (documented precisely, as the coordinator required)

`ApiViewAreaProjection.coverage` counts **distinct `facts.catalog.coverage`
entries** (by `id`) whose `location.file`:

1. resolves (via `facts.inventory.files`) to a **foreign** owner (not the
   consuming module) -- a same-owner catalog limit cannot hide a *foreign* API,
   since same-owner originals are never listed anyway; and
2. is **not testing-blocked** from the consuming area's profile -- the same
   one-line test `listAvailableOriginals` itself applies
   (`!consumerProfile.includes('testing') && originArea.profile.includes('testing')`),
   reimplemented locally (not imported: `testingBlocked` is not exposed
   outside `analysis/model`) since it is trivial and applies to a coverage
   *note*, not an availability *decision* -- the "share the requirement
   helper" rule in scope.md binds availability itself, which is entirely
   delegated to `listAvailableOriginals`.

`facts.files[*].coverage` (access-level notes, from interpreting one file's
own accesses) is never read by this rule: it cannot hide a foreign API, only
how one file happens to use it. Verified by both the vitest unit test and the
harness handler: three synthetic notes (foreign+ordinary, same-owner,
foreign+testing-origin) plus one synthetic access-only note prove all four
exclusion/inclusion cases in one assertion pair.

## Matrix leaves executed (I2A-05, all nine)

| ID | Evidence | Result |
| --- | --- | --- |
| `I2A-05:child-category` | `api-view.test.ts` (F, unit) + `plan2a-projection-cases.ts` (F, api) | Passed |
| `I2A-05:external-category` | same | Passed |
| `I2A-05:defining-path-roundtrip` | `api-view.test.ts` (F, unit) + `plan2a-projection-cases.ts` real R,T structural invariant check (every projected file resolves to a real catalog file, extension preserved) | Passed |
| `I2A-05:defining-export-names` | `api-view.test.ts` (F, unit) + `plan2a-projection-cases.ts` (F, api) | Passed |
| `I2A-05:file-group-and-order` | `api-view.test.ts` (F, unit; includes a request-order shuffle) + `plan2a-projection-cases.ts` real R,T grouping/ordering invariant check | Passed |
| `I2A-05:test-view-complete` | `api-view.test.ts` (F, unit) + `plan2a-projection-cases.ts` (F fixture, plus a real-R sweep over every module with a present tests area) | Passed |
| `I2A-05:empty-view` | `api-view.test.ts` (F, unit) + `plan2a-projection-cases.ts` (F, api) | Passed |
| `I2A-05:coverage-count` | `api-view.test.ts` (F, unit, synthetic injection) + `plan2a-projection-cases.ts` (F, api) | Passed |
| `I2A-05:projection-bound` | `api-view.test.ts` + `plan2a-projection-cases.ts`: F-fixture just-under/just-over `maxAreaBytes`/`maxInvocationBytes` (exact boundary, both directions). S1000: **not re-run**; iteration 1's already-recorded `scripts/probes/results/plan2a/scale-baseline.json` evidence (S100/S500/S1000 all produce zero cross-module availability entries, since the synthetic generator declares no `expose-src`) is cited as sufficient "zero-entry projection within limits" evidence per the brief's explicit allowance, rather than re-running the ~100s disposable S1000 batch for a bound this fixture's deterministic boundary test already exercises precisely | Passed |

Also executed (registered by earlier iterations, wired to real assertions
here per the coordinator's request, not this iteration's own required group
but required transitively by `--iteration 5`):

| Group | Leaves | Result |
| --- | --- | --- |
| `I2A-03` (7 previously unwired) | `value-available`, `pure-type`, `required-symbol-fallback`, `required-importer-block`, `testing-origin`, `test-complete-reclassification`, `same-owner-absent` | All passed |
| `I2A-04` (8, none previously wired) | `declaration-kinds`, `overloads`, `first-documentation-paragraph`, `no-documentation`, `byte-truncation`, `identity-and-alias`, `isolated-unavailable`, `protocol-lifecycle` | All passed |

## Commands run

| Command | Outcome |
| --- | --- |
| `npx vitest run subs/analysis/src/tests/api-view.test.ts` | 17 tests passed |
| `npx vitest run subs/analysis/src/tests/` | 16 files, 248 tests passed (no regression) |
| `npx vitest run subs/analysis/subs/model/src/tests/ subs/analysis/subs/typescript/src/tests/` | 24 files, 381 tests passed (no regression, including the parallel agent's concurrent class-rendering additions to `symbol-details.test.ts`) |
| `npm run type-check` (`tsc --noEmit`, `tsconfig.portable.json`, `tsconfig.scripts.json`, `scripts/reference-harness/tsconfig.json`) | Passed, exit 0, no errors anywhere |
| `npx tsx` on temporary smoke-test scripts (deleted after use) | Smoke-ran all 9 `I2A-05` + 7 `I2A-03` + 8 `I2A-04` handlers directly; all passed with real assertion evidence before wiring into `verify.ts` |
| `npm run build` | Succeeded (coordinator-authorized for this iteration only) |
| `dist/src/ramify check --batch --root .` | `execution: completed; check: passed; coverage: complete`; 11 owners, 292 source files, 0 errors, 0 warnings, 0 analysis limits -- confirms every `module.ramify` edit this iteration made (and the current state of parallel iterations' edits) is legal under Ramify's own self-check |
| `npm run reference:verify -- --plan 2a --iteration 5` | **Passed.** Required iterations: 1, 2, 3, 4, 5. Instances: 104; required 41; passed 41; failed 0; not executed 63 (all `future-iteration`) |

Not run (per the brief): bare `npm test`, `npm run reference:cases`,
`npm run check:self`/`check:reference` (both would additionally validate
declarations beyond this iteration's own scope; not required by the brief's
check list), non-dry `reference:report`, full Plan 1/2/5 `reference:verify`
gates.

## Contract deviations

1. **`subs/analysis/module.ramify`'s owned line names two exports, not one.**
   owners.md's reviewed text was `expose-src projectApiView from "api-view.ts"
   to parent`. Implementation split the join into `planApiViewRequests` (the
   detail-request planner) and `projectApiView` (the main entry, unchanged
   name and role) for the reasons in "Design" above; both live in
   `api-view.ts`, so one line names both:
   `expose-src planApiViewRequests, projectApiView from "api-view.ts" to
   parent`. Recorded as a dated revision note in owners.md.
2. **The `OriginalId.file` vs. `SourceOrigin.file` convention mismatch**
   described above. Not a `contracts.md`/`scope.md` deviation (see that
   section for why), but recorded here per the brief's instruction to record
   any place implementation proved a document's assumption incomplete.

No other deviation from `contracts.md`, `scope.md` or `owners.md` was needed.
`ApiViewCategory`/`ApiViewEntry`/`ApiViewFile`/`ApiViewAreaProjection`/
`ApiViewModuleProjection`/`ApiViewProjection`/`ApiViewSelection`/`ApiViewQuery`/
`ApiViewQueryOutcome` match contracts.md's "Analysis projection" shapes
verbatim.

## Remaining limits

- **`joinArea` matches only top-level `FileExports.exports` entries**, not
  nested `CatalogExport.namespace` members. A namespace re-export
  (`export * as ns from './x.js'`) lives in the *re-exporting* file's own
  export list, not the original's own defining file, so it was already
  excluded by the `filesByPath.get(original's own file)` lookup regardless;
  this only means an original's defining file *itself* containing a
  self-referential namespace export around one of its own bindings would not
  contribute a namespace-qualified heading. Not exercised by any required
  leaf.
- **`coverageCount`'s foreign/testing-blocked rule is this iteration's own
  precise reading** of scope.md's "distinct catalog/source-description limits
  that may have omitted an API" -- scope.md does not spell out the exact
  foreign/testing-blocked filter; see "Coverage rule" above for the exact,
  tested rule and its rationale.
- **`I2A-05:projection-bound`'s S1000 evidence is reused, not re-run** (see
  the matrix row above); this matches the brief's explicit "or run S1000 once
  if feasible... otherwise record why not" allowance and the carried-forward
  Plan 5 measurement policy (S1000 is a sanity/smoke run only).
- **The harness's R-evidence handlers duplicate the vitest fixture trees**
  (`ancestryFiles`/`emptyFiles` in both `api-view.test.ts` and
  `plan2a-projection-cases.ts`) rather than sharing one definition, matching
  the project's "independent expected results" testing principle (two
  independently authored fixtures agreeing is stronger evidence than one
  shared fixture consumed twice) -- this is intentional duplication, not
  drift risk to fix later.
- **`I2A-04` harness coverage intentionally avoids class heritage/static
  members** (a parallel agent's concurrent edit to
  `subs/analysis/subs/typescript/src/symbol-details.ts`), exercising only the
  six declaration-kind cases already stable at iteration 4's close. That
  parallel work's own new test cases (in
  `subs/analysis/subs/typescript/src/tests/symbol-details.test.ts`) remain
  covered only by the owner's own unit tests, not by a harness handler; this
  is unchanged scope, not a gap this iteration introduced.

## Required follow-up for other owners

None. No file outside `analysis`, root's `module.ramify`, and the reference
harness's shared infrastructure needed a change.

## Handoff (for iteration 6 and iteration 7)

- **Exports** (from `subs/analysis/src/index.ts`, and thus the `analysis`
  package entry once built):
  - `planApiViewRequests(facts: SessionFacts, selection: ApiViewSelection):
    { status: 'planned'; requests: readonly SymbolDetailRequest[] } |
    { status: 'unavailable'; reason: 'invalid-location' | 'invalid-projection'
      | 'analysis-failed'; message: string }`
  - `projectApiView(facts: SessionFacts, sequence: number, inputId: string,
    selection: ApiViewSelection, detailsOf: (request: SymbolDetailRequest) =>
    SymbolDetail, limits: { maxAreaBytes: number; maxInvocationBytes: number
    }): ApiViewProjectOutcome`
  - `ApiViewProjectOutcome = Exclude<ApiViewQueryOutcome, { status:
    'superseded' | 'cancelled' }>` -- iteration 7's `RetainedSession.apiView`
    can return this directly for every case except `superseded` and
    `cancelled`, which it must produce itself from the sequence/observation
    comparison and any abort signal.
- **Semantics iteration 7 must preserve when calling these**: obtain the
  *current valid* `SessionFacts` for the requested sequence first (never
  `lastValid`); on a queued update before the query, use the updated facts; on
  one after, do not substitute it (the "query-serialization" leaf, I2A-08,
  iteration 7's own). Call `planApiViewRequests` once, then
  `RetainedSourceAnalysis.details(planned.requests, query.details)` once
  (only while `analysis.hot` -- see iteration 4's handoff for the warm-
  rehydration path), then `projectApiView` with a lookup built from those
  results. Never call `report()` or acquire a second inventory/model
  (`projectApiView` never does either).
- **`ApiViewProjection.bytes`** is `Buffer.byteLength(JSON.stringify(draft),
  'utf8')` where `draft` is the full projection object with `bytes: 0` in
  place (a documented, deterministic convention, not a contracts.md
  requirement beyond "deterministic encoded bytes"). `ApiViewAreaProjection`'s
  own bytes (for `maxAreaBytes`) are `Buffer.byteLength(JSON.stringify(area),
  'utf8')` directly (no self-reference issue there).
- **Rendering (iteration 6)**: `ApiViewFile.definingFile` is already the
  project-relative defining file path with its original extension untouched
  (no `.md`, no category prefix) -- the renderer appends `.md` and prefixes
  `<category>/` itself, per contracts.md/scope.md. `ApiViewEntry.detail` is
  the raw `SymbolDetail` from iteration 4's adapter, unmodified;
  `entry.form`/`entry.detail.state` together determine `[type-only]`/
  `[truncated]`/`[details-unavailable]` markers. `ApiViewAreaProjection.root`
  is the model's own `SourceArea.root` (e.g. `"src"` or
  `"subs/x/src/tests"`), matching the `<area>/.ramify/` path segment
  convention directly.
