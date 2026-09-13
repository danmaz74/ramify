# Iteration 3 results: Build only what a hook publishes

**Date:** 2026-09-13. **Outcome:** HO-7 to HO-9 pass. Publication builds the
outcome, summary, diagnostics, warnings and coverage notes from the retained
facts without an analysis snapshot. It applies `maxReportBytes` to those, and it
neither measures nor copies a full report. A full report is still built from
the retained facts when it is requested, with its size limit applied there, and
it is unchanged. Only HO-9's behavior differs from before. The `ramify.check/1`
JSON document also carries the reply timings from iteration 1 (added deliverable
A). Direct work; no Studio workflow.

## Commits

| Commit | Content |
| --- | --- |
| `2594125` | Deliverable 1: publication no longer deep-copies the report. No behavior change. |
| second commit | Deliverables 2 to 6, added deliverable A and item B. |

## Design

### Step 1: no detached copy (`2594125`)

`ReportDraft.finish()` is now `copyReport(this.bounded())`.
`bounded()` (`subs/analysis/src/report.ts:241`) is the previous body: build,
measure, bound on failure. `#publish` called `bounded()`, because the revision
keeps only parts that `deepFreeze` freezes. A report that cannot be published is
still returned as `copyReport(...)`, so callers of a refused publication receive
the same detached, frozen report as before. `report()`, batch and every other
`finish()` caller are unchanged. That commit ran the analysis and contexts owner
tests (207 and 102 passed) plus type-check.

### Step 2: publication projection

- `draftPublication(facts, request)` (`subs/analysis/src/session-facts.ts:191`)
  and `draftReport(facts, request, inputs, inputId)` (`:177`) share one stage
  driver, `driveReport` (`:195`). It records the same stages, diagnostics,
  coverage and warnings in the same order, with the same `maxDiagnostics`
  admissions. With `snapshot` false it never calls `patch` and never builds the
  snapshot. `ReportDraft.inventory(inventory, false)` records only
  `counts` (`subs/analysis/src/report.ts:119`, `:131`). The inputs sort and
  `inputId` belong to `draftReport` only, still skipped for invalid facts as
  before.
- **Summary counts from facts.** `SnapshotCounts` (`report.ts:50`) holds the
  eight counts `build()` derived from the snapshot. The publication draft
  records owners and file counts from the inventory, and `originals` only where
  the full draft would patch the catalog. Accesses, allowed, denied and external
  come from `decisionCounts` (`session-facts.ts:257`), one pass over
  `facts.files` and `facts.decisions` that builds no list. A missing decision
  still throws, naming the first missing access in whole-pass order, as the full
  draft does.
- **Diagnostic order.** `recordedDiagnostics` lists decision diagnostics in
  whole-pass access order. `decidedDiagnostics` (`session-facts.ts:283`) sorts
  only the accesses that have diagnostics, with the same `accessOrder`
  comparator. A stable sort gives any subsequence the relative order that
  sorting every access gives it, so the recorded list is identical, including
  ties under the final `locatedOrder` sort.
- **`ReportDraft.publication()`** (`report.ts:218`) marks the report stage
  completed as `bounded()` does, builds the five kept fields through the helpers
  `build()` now shares (`isComplete`, `outcomeOf`, `summaryOf`), and measures
  `{ diagnostics, warnings, coverage }` against `maxReportBytes` less the 64 KiB
  envelope reserve. That is `bounded()`'s evidence admission without the
  snapshot. It then measures the kept fields against `maxReportBytes` and
  returns null on any failure.
- **`#publish`** (`subs/analysis/src/session-engine.ts:401-416`) uses the
  projection. When it is null, it builds the full draft's `bounded()` report.
  That report always fails, because the full evidence contains the same lists,
  and it is returned copied, exactly the refusal the previous build returned.
  Everything after that point (fact bytes, retained budget, delta, frozen
  revision) is unchanged.

### Full report on request

`report()` (`session-engine.ts:211`) still returns
`draftReport(...).finish()` from the retained version. The daemon's report
scope (`context-manager.ts` `deliver` and `cool`), resident `ramify check
--format json` (`printReport` over that report) and batch (`runAnalysis`
`finish()`) are unchanged code paths, with the size limit applied where they
build.

### Added deliverable A: reply timings in `ramify.check/1`

`CheckDocument.timings` gains optional `reply?: ReplyTimings`
(`subs/cli/src/interfaces/cli.ts:33-35`). `changedCommand`'s `reported()`
(`subs/cli/src/changed-command.ts:55-58`) adds it after `totalMs`, and only
when the reported reply carries `timings`. Other outcomes and replies without
timings leave the key absent. The final `totalMs` update and the cleanup-failure
path spread the document, so they keep it. `formatChangedHuman` does not read it,
so the human output a hook returns is unchanged.

### Item B: `byteOrder` in `report.ts`

Publication still sorts with it: warnings, coverage notes, diagnostics,
`assembleCoverage`, `accessOrder` for accesses with diagnostics, and
`sortedPaths` in `findingDelta`. It is now the non-allocating scalar comparator,
copied from `subs/analysis/subs/project/src/data.ts:12-32`
(`subs/analysis/src/report.ts:23-44`). That owner's copy is not exposed, and no
exposure line was added. The allocating copy in
`subs/analysis/src/inventory.ts:11` remains; publication does not use it.

## Files

| File | Change |
| --- | --- |
| `subs/analysis/src/report.ts` | `bounded()` (commit 1); `SnapshotCounts`, `PublishedReport`, `counts`, `inventory(…, snapshot)`, shared outcome and summary helpers, `publication()`, non-allocating `byteOrder` |
| `subs/analysis/src/session-facts.ts` | `driveReport`, `draftPublication`, `decisionCounts`, `decidedDiagnostics`, `accessOrder` |
| `subs/analysis/src/session-engine.ts` | `#publish` uses the projection, with a full bounded refusal |
| `subs/cli/src/interfaces/cli.ts`, `subs/cli/src/changed-command.ts` | Optional `timings.reply` |
| `docs/architecture/daemon.md` | Resolved decision 3's clarification |
| `subs/analysis/src/tests/report-publication.test.ts` | New: HO-7, HO-8, comparator equivalence |
| `subs/analysis/src/tests/session-revision.test.ts` | HO-9, revising an existing test |
| `subs/cli/src/tests/changed-command.test.ts` | HO-8 CLI JSON, reply timings |

No owner, exposure line, package entry or public export changed.
`draftPublication`, `SnapshotCounts` and `PublishedReport` are owner-internal.

## Matrix rows

| Row | Test | Evidence |
| --- | --- | --- |
| HO-7 `publication-without-snapshot` | `subs/analysis/src/tests/report-publication.test.ts:59` "publication-without-snapshot: open and updates build, measure and copy no full report, and keep the fields a full finish() yields" | In-process engine over a fixture with a denial, an outside-source warning and two coverage notes. The test spies on `ReportDraft.prototype.patch`, `build` and `bounded`, and a module mock counts `copyReport`. Opening and four updates call none of them: a source edit adding a second denial, an invalid link, an invalid module header and recovery. After each, the JSON of `outcome`, `summary`, `diagnostics`, `warnings` and `coverage` equals a full `draftReport(...).finish()` of the same retained facts, and `handle.report()` equals that report. Summary counts are pinned at open: owners 4, originals 5, accesses 7, allowed 4, denied 1, errors 1, warnings 1, coverage notes 2. The run ends with an audit and equality to batch. |
| HO-8 `full-report-on-request` (session and batch) | `report-publication.test.ts:96` "full-report-on-request: a requested report equals batch and still fails over maxReportBytes where it is built" | Unbounded: the requested report equals batch. With `maxReportBytes = 64 KiB + lists + 1 KiB` (a long README purpose makes only the snapshot exceed it), the session opens with the same kept fields. `handle.report()` is `incomplete` with a `maxReportBytes` limit diagnostic, a null snapshot, a failed report stage and at most `maximum` bytes. Apart from `runId`, it is byte-identical to a full `finish()` of the facts and to batch with the same limit. A historical read of the sequence returns the same result. |
| HO-8 (`--format json`) | `subs/cli/src/tests/changed-command.test.ts:243` "full-report-on-request: a resident JSON report equals the batch JSON report" | Quick environment with a real service: resident `check --format json` (report scope) and `check --batch --format json` print the same report, byte for byte apart from `runId` and the request echo, whose project keys the two invocations order differently. The echo is compared structurally. |
| HO-9 `hook-passes-under-limit` | `subs/analysis/src/tests/session-revision.test.ts:396` "hook-passes-under-limit: publishes when only the full report exceeds maxReportBytes and keeps published facts when what a revision keeps exceeds it" | An oversized README purpose, present only in the snapshot, now publishes a passing, complete revision. The requested report equals batch and carries the `maxReportBytes` failure with no snapshot. The session audits equal. Adding `ceil(maximum / 200)` denied imports makes the kept diagnostics exceed the limit: the update is refused with the `maxReportBytes` limit, `current` and the facts stay unchanged, and the retained report is unchanged. Recovery then publishes and equals batch. |
| Added A | `changed-command.test.ts:208` "timing-fields: the JSON document carries the reply timings only when the reply has them, and human output is unchanged" | The document's `timings` keys are `daemon, waitedMs, totalMs, reply`. `reply` equals the service reply's `ReplyTimings` (`invocationCheck`, `workerStatus`, `workerRoundTrip`, `publication`, `service`). `formatChangedHuman` output is identical with and without `reply`. A reply stripped of `timings` yields keys `daemon, waitedMs, totalMs` only. |
| Item B | `report-publication.test.ts:128` "orders strings by UTF-8 bytes without encoding them, as Buffer.compare does" | 576 ordered pairs over UTF-8 length boundaries, supplementary scalars, lone and reversed surrogates and path-shaped strings. |

HO-7 would fail on the previous build: its `#publish` called `patch`, `build`,
`bounded` and `copyReport`. HO-9's first update failed on the previous build
with `expected 'revised' to be 'reported'`, as observed below.

## Revised expectation

`subs/analysis/src/tests/session-revision.test.ts:396`, previously "keeps
published facts when report size admission fails, then recovers after the
oversized purpose is removed", expected the oversized README purpose to refuse
publication. Under resolved decision 3, that purpose is only in the snapshot, so
the update now publishes. It failed with exactly that assertion after
deliverable 2. The test keeps its fixture and its bound (`bytes + 64 KiB`). It
now asserts the HO-9 behavior. It keeps its original purpose (refusal keeps
published facts, then recovery) by exceeding the limit with findings, which a
revision keeps. No other expectation changed.

## Contract text added to `docs/architecture/daemon.md`

In "Revisions and atomic publication", after the paragraph on atomic
publication:

> A published revision keeps the outcome, summary, diagnostics, warnings and
> coverage notes; publication builds only those and applies the report-size
> limit (`maxReportBytes`) to them. The full report, with its analysis snapshot,
> is built from the revision's retained facts only when it is requested: a
> report-scope check, `--format json`, batch and later `inspect`. Its size limit
> applies where it is built. A hook's check can therefore pass while a full
> report for the same revision would exceed `maxReportBytes`; the limit protects
> the receiver of the full report, which still gets the resource-limit failure.

## Verification

| Command | Result |
| --- | --- |
| `npx vitest run subs/analysis/src/tests` | 12 files, 210 tests passed (207 existing, one of them revised, plus 3 new) |
| `npx vitest run subs/cli/src/tests` | 3 files, 123 tests passed (121 plus 2 new) |
| `npx vitest run subs/daemon/subs/contexts/src/tests` | 8 files, 102 tests passed |
| `npm run type-check` | Passed |
| `git diff --check` | Clean |

These commands ran after both steps. After step 1 alone, the analysis and
contexts directories passed (207 and 102) and type-check passed before
`2594125` was committed. No expectation outside these directories changed. The
cucumber-viz commit audit was not run by this agent; it remains for the
controlling session after each commit.

## Deviations and limits

- **Failure report on refusal.** When the kept fields exceed the limit,
  publication builds the full draft once more to return the same bounded failure
  report as before. That path pays the old cost, but only when publication is
  refused.
- **Report scope of a resident whole-project check.** When only the snapshot
  exceeds the limit, a resident `ramify check` (report scope) now receives a
  published revision whose report is the `incomplete` limit failure. Before, it
  received an unpublished refusal carrying the same failure report. `cool` and
  `abandonCandidate` retain that failure report for the revision. This is
  resolved decision 3 as written; the 96 MiB resident limit makes it unlikely.
- **Remaining publication costs.** `factBytes` (a `JSON.stringify` of the
  facts), `assembleCoverage` and `inventoryCounts` still run per publication.
  `factBytes` is deferred by the plan.
- **Request echo order.** Resident and batch CLI invocations echo
  `request.project` keys in different orders. Neither echo is built by code
  this iteration touches; the HO-8 CLI test compares the echo structurally.
- **Allocating comparator in `inventory.ts`.** Not on the publication path; left
  unchanged.

## Handoff

- Publication projection: `draftPublication(facts, request).publication()`,
  `subs/analysis/src/session-facts.ts:191` and `subs/analysis/src/report.ts:218`,
  called from `#publish` at `subs/analysis/src/session-engine.ts:401`. A null
  result falls back to `draftReport(...).bounded()` for the refusal.
- Report on request: `RetainedSession.report()` at `session-engine.ts:211`,
  `draftReport(...).finish()` from the retained version. `finish()` is
  `copyReport(bounded())` at `report.ts:234`.
- `ramify.check/1` `timings.reply` is optional. It is present only on documents
  built from a reported reply with `timings`. The measurement successor can
  read `invocationCheck`, `workerStatus`, `workerRoundTrip`, `publication`,
  `service` and, over a socket, `clientTransport`.
