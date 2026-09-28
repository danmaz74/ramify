# Iteration 1 results: projector, session operation and worker round trip

**Date:** 2026-09-28. **Branch:** `feat/plan7-affected-modules`, from `87b806d4`.
**Status:** complete. All A7-01 to A7-05 instances pass; `npm run type-check`
and `npm run check:self` pass.

## What changed

Analysis (`subs/analysis/`):

- `src/interfaces/affected.ts`: `AffectedQuery`, `AffectedModule`,
  `AffectedPathBasis`, `AffectedPathSeed`, `AffectedWideningReason`,
  `AffectedSelection`, `AffectedUnavailableReason` and
  `SessionAffectedOutcome`, with the names and fields of contracts.md. Foreign
  types arrive as `import type` and are not re-exported.
- `src/interfaces/session.ts`: `RetainedSession.affected(query, control?)` with
  the documented comment. It is declared optional; see deviation 1.
- `src/affected-query.ts` (private): `AffectedFacts`, `projectAffected` and
  `assembleAffectedFacts`, plus `AffectedLimits`, `AffectedProjection`,
  `affectedLimits` (4,096 modules, 100,000 edges) and `maximumAffectedSeeds`
  (4,096). The projector validates seeds, resolves paths through the
  inventory, derives edges from every access form and from owned shims, drops
  self-edges, counts unique edges against the limit, traverses the reverse
  graph once from all seeds, classifies coverage by the owner-known code set
  and widens. It checks `control.signal` every 1,024 accesses, shim entries
  and traversal steps.
- `src/session-engine.ts`: `affected(query, control)` under `#serialize`, with
  the readiness order recorded below. It uses the revision's
  `outcome.check` as `analysisCheck` and `facts.inventory.scope` as `scope`.
- `src/session-messages.ts`, `src/session-worker.ts`, `src/session-host.ts`:
  the `affected` operation, wired as `measurements` is.
- `src/session-facts.ts`: `reportedCatalogCoverage(facts)` is extracted
  unchanged from `driveReport`, so the report and the projector filter catalog
  coverage the same way. `src/report.ts` exports its existing `locatedOrder`.
- `src/index.ts`: `export type * from './interfaces/affected.js'`.
- `module.ramify`: the A19 line
  `expose-src * from "interfaces/affected.ts" to parent`.
- `README.md`: the owners.md purpose sentence appended to the first paragraph.

Root (`module.ramify`): the owners.md R3 relay line for the eight affected
types. See deviation 2.

Tests (`subs/analysis/src/tests/`):

- `affected-fixtures.ts`: plain `AffectedFacts` builders (`chain`,
  `diamondCycle`, `isolated`, `rootGraph`, `shimGraph`, `coverageGraph`,
  `graphFacts`) and the disposable source-form project (`formFiles`), with
  its hand-written module list and dependents of `p`.
- `affected-query.test.ts`: 29 unit tests, covering every A7-01 and A7-02
  instance, the A7-04 unit instances, and unit supplements for forwarding,
  side-effect and shim edges and for cancellation.
- `affected-session.test.ts`: 23 tests over real in-process sessions. They
  cover every A7-03 instance, the A7-04 session instances, the A7-05 session
  instances, a cold `missing-facts` case, and session checks of unknown
  module IDs and invalid seeds.
- `affected-worker.test.ts`: two tests through the real worker, for
  `A7-05:worker-round-trip` (including the edit, stale-sequence and disposed
  cases through the worker) and `A7-05:worker-cancel`.

Each test title names its case ID. Every expected answer is written by hand
from the fixture's stated edges and never computed by the projector.

## Evidence used for `missing-facts`

The retained session interprets accesses for every revision whose model is
linked. It never consults the requested capabilities for this; only the
invocation check compares capability sets. So access interpretation is missing
only when a prerequisite stage blocks it. After the `invalid-current` checks
(`facts.invalid`, a null inventory, `facts.areaIssues`), the engine answers
`missing-facts` when any of these holds:

- `current.outcome.execution !== 'completed'`: the published revision's
  execution record. `driveReport`/`draftPublication` set `completed` only
  after the `access` and `decide` stages complete.
- `current.outcome.check === 'not-run'`.
- `facts.model === null` or `facts.linkIssues.length > 0`: the retained fields
  on which `driveReport` bases its decision to mark `access` completed rather
  than leave it `blocked`.

`report()` is not called. `A7-05:missing-facts` makes a valid session's `p`
expose an absent export (`expose-src nothing from "internal.ts"`); the next
revision has `link: invalid`, `access: blocked` and `execution: invalid`, and
the query answers `missing-facts`. A cold-open variant proves the same
outcome for a session that is blocked from its first revision.

## Verified spelling of `InventoryArea.root`

`subs/analysis/subs/project/src/inventory.ts` builds each area as
`join(moduleDirectory, 'src')` and `join(moduleDirectory, 'src/tests')`, where
`moduleDirectory` is `relative(capture.root, directory) || '.'`. Area roots are
therefore project-relative, `/`-separated, and have no trailing slash:
`src` and `src/tests` for the root module, and `subs/p/src` and
`subs/p/src/tests` for a child. A batch analysis of the source-form project
confirmed this. A path matches an area when it equals the root or starts with
`<root>/`. When the ordinary and tests areas both match, the longer root wins;
both belong to the same owner. An area matches whether or not its directory is
`present`, so a path under a deleted `src/` still resolves to its module.

## Commands and outcomes

From the worktree root:

| Command | Outcome |
| --- | --- |
| `npm run type-check` | passed (exit 0) |
| `npx vitest run subs/analysis/src/tests/affected-query.test.ts subs/analysis/src/tests/affected-session.test.ts subs/analysis/src/tests/affected-worker.test.ts` | passed: 3 files, 54 tests |
| `npx vitest run subs/analysis/src/tests/session-worker.test.ts subs/analysis/src/tests/module-measurements-session.test.ts` | passed: 2 files, 19 tests |
| `npm run build` | passed (exit 0; the existing explorer chunk-size warning) |
| `RAMIFY_ENDPOINT_DIR=$(mktemp -d) npm run check:self`, before the root relay line | failed as expected: 2 `exposed-without-companion` errors at `module.ramify:23:1` (`RetainedSession` without `AffectedQuery` and `SessionAffectedOutcome`) |
| the same `check:self`, after the root relay line | passed: 15 owners, 444 source files, 6,696 accesses, 0 errors, 0 warnings, 0 analysis limits |
| `RAMIFY_ENDPOINT_DIR=<same> dist/src/ramify daemon stop` | `Stopped: daemon stopped explicitly`; process gone |

A first `check:self` attempt with an endpoint under the long session
scratchpad path stopped before analysis with "Daemon socket path exceeds 100
bytes". The runs above use a short `mktemp -d` directory. The whole Vitest
suite was not run.

## Deviations from contracts.md and owners.md

1. **`RetainedSession.affected` is optional for this iteration.** A required
   member breaks every `RetainedSession` implementation outside analysis:
   `src/resident-assembly.ts` (`ownedSession`, around line 76),
   `subs/daemon/src/service.ts` (the counted session, around line 96),
   `subs/daemon/src/tests/measure-driver.ts:26`,
   `subs/daemon/src/tests/session-counters.test.ts` at lines 32, 86 and 141,
   and `subs/daemon/subs/contexts/src/tests/scripted-driver.ts:162`. Iteration
   1 may not change those owners. The declaration is therefore
   `affected?(query, control?)`, and the worker throws if the session lacks it.
   The engine and the worker host always implement it. **Iteration 2 must make
   the member required, forward it in the two production wrappers and add it
   to the three test stubs.**
2. **The root R3 relay line is added now.** `check:self` fails as long as the
   root relays `RetainedSession` to descendants without the new signature
   companions. Their transitive closure is exactly the eight types that
   owners.md lists for the root relay, so that line was added to the root
   `module.ramify` beside the measurements relay, word for word. This is the
   only change outside `subs/analysis/`. Iteration 2 must not add it again.
   The daemon relays of `AffectedRequest` and `ContextAffectedOutcome` remain
   for iteration 2.
3. **A worker failure is `invalid-revision`; an operation error is
   `analysis-failed`.** A failed worker disposes its session, so the host
   reports the failure with the disposed-session reason `invalid-revision` and
   the failure's message. An operation error the worker reports as `kind:
   'error'` leaves the session alive; the review added `analysis-failed` to
   `AffectedUnavailableReason` for it, and the host reports it with that
   reason and the error's message. Originally both answered
   `invalid-revision`.
4. **Coverage assembly and order.** `assembleAffectedFacts` keeps the
   contract's four parameters and assembles coverage from the facts, rather
   than from the published `revision.coverage`, which a bounded publication
   could shorten. Its notes are catalog coverage filtered as a report filters
   it, each file's access coverage, and the companion coverage. They are
   deduplicated by ID. The projector returns every note in the report's located
   order (file, start, code, ID), which this iteration takes to be "the
   catalog's existing order". `accesses` is a new array of references to the
   retained `SourceAccess` objects; no access is cloned.
5. **Validation order and counting.** The engine checks readiness first:
   cancellation, a disposed session, a non-object query (`invalid-query`), the
   sequence, `invalid-current` and `missing-facts`. It then calls the
   projector, which validates the seeds (`invalid-query`) and then checks
   unknown IDs (`unknown-module`), the module bound, paths, the edge bound and
   cancellation. A malformed query against a stale sequence therefore answers
   `invalid-revision`. The 4,096-seed bound counts raw entries before
   duplicates collapse. A path starting with a drive letter (`C:`) is
   absolute. `modules` or `paths` given as `null` is present and invalid;
   only `undefined` counts as absent.
6. **The session resource-limit instance uses a test seam.** The session's
   bounds are constants, so `A7-04:resource-limit` at session level mocks
   `affected-query.js` to pass smaller limits to the real projector. It then
   verifies that the engine returns `resource-limit` whole.
7. **The no-disk check adds a filesystem seam.** Beyond the existing seams
   (`instrumentCompiler`, `instrumentObserver`, a `report` spy and adapter
   query spies), `A7-05:no-disk-or-report` wraps the `node:fs/promises` and
   `node:fs` read functions to count reads during the query. A control update
   in the same test proves the seam records reads.

## Cases not satisfied

None.

## Handoff to iteration 2

- Consume `AffectedQuery`, `AffectedSelection`, `AffectedUnavailableReason`,
  `SessionAffectedOutcome` and `RetainedSession.affected` as declared. First
  make `affected` required and forward it (deviation 1).
- The root relay of the eight affected types exists (deviation 2).
- `subs/analysis/src/index.ts` exports the affected types, so
  `ramify.ts/analysis` carries them with no new subpath.
