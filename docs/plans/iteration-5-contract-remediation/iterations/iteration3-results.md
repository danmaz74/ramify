# Iteration 3 results: Harness attribution and ideal budgets

**Date:** 2026-09-13. **Outcome:** RC-8 and RC-9 pass. This file is also the
plan's completion report. Per resolved decision 7, no real-process workload
ran. Direct work; no Studio workflow.

## Completion report

- **Sweep classification.** A sweep is required after a configuration,
  manifest or lockfile change, a watcher overflow or error, when opening or
  conservative, when queued paths exceed `maxQueuedPaths`, and for an
  empty-expect synchronized plain check. A sweep started only because
  `sweepIntervalMs` elapsed is periodic: it never makes a covered request wait
  and never marks the context `reconciling`, and it publishes what it finds.
  See [iteration 1](iteration1-results.md).
- **Cadence.** A sweep starts no sooner than `sweepIntervalMs` after the start
  of the previous sweep of either kind; activity never shortens the interval.
- **Coverage during a periodic sweep.** A covered request is answered from the
  revision published before a running periodic sweep, without waiting.
- **Cancellation.** A sweep or revision cancelled before the observer applies
  changes returns `cancelled` and leaves the session as published; after that
  point it marks the session stale. The promotion and publication handler
  always follows the second case, because its revisions have already applied
  changes. See [iteration 2](iteration2-results.md).
- **Harness assertion.** Described below.
- **Evidence.** Deterministic owner tests and the harness self-test. Live
  confirmation is left to Plan 5's outstanding measurement.

## Implemented behavior

- **Attribution.** `fast-workloads.mjs` records `afterHook` status immediately
  after each published hook returns. The exported pure predicate
  `publishedHookAttributed(cycle)` in `fast-assertions.mjs`, with `b`, `a` and
  `s` the counters before the hook, after it and settled, requires: all of
  `analyses`, `revisions`, `coveredRequests`, `sweeps` and `audits` present;
  the published sequence equal to the hook's revision; exit code 0 and every
  changed entry covered; `a.coveredRequests === b.coveredRequests + 1`;
  `a.analyses - b.analyses` equal to the sweeps and audits started between `b`
  and `a`; `s.revisions === b.revisions`; `s.coveredRequests ===
  a.coveredRequests`; and `s.analyses - a.analyses` equal to the sweeps and
  audits started between `a` and `s`. The daemon increments `sweeps` or
  `audits` together with `analyses` when that work starts, so no substitute
  counter was needed. The assertion keeps its name, `published hooks perform
  zero analysis`, and reports the unattributed cycle numbers.
- **Ideal budgets.** `target()` records `enforcement: 'ideal'`, the target in
  `maximum` and `targetMet`; a miss never fails a workload. The `binding`
  split, which made reference and S100 timing rows fail on a miss, is removed.
  Missing or non-finite observations still fail as missing evidence.
  Correctness predicates and runtime limits stay enforced.
  `fast.mjs --help`, `performancePolicy`, the archive note and `README.md`
  state the rule; `fast.mjs` and `verify-fast-evidence.mjs` report
  `idealMisses`.

Files: `scripts/measurements/fast-assertions.mjs`, `fast-workloads.mjs`,
`fast.mjs`, `README.md`, `fast-evidence.test.mjs`, `verify-fast-evidence.mjs`
(the renamed miss list), `fast-plan.mjs` (a stale comment).

## Matrix rows

| ID | Test | Result |
| --- | --- | --- |
| RC-8 | `published hooks are judged by the counters sampled when the hook returns`: reference cycle 13, S100 cycle 18, a sweep before or after the hook's reply, and an audit plus sweep while settling pass; reference cycle 1, an update during the hook, a covered count other than one, an update, publication or covered request while settling, a sequence mismatch, a nonzero exit, uncovered or empty changes, and missing samples fail. A twenty-cycle workload fails with `unattributed: [1]` when cycle 1 is present | pass |
| RC-9 | `timing misses on every fixture are ideal budgets recorded without failing, while correctness still fails`: misses on all four fixtures record `enforcement: 'ideal'`, `targetMet: false` and their target and pass; a `broad` revision path still fails its correctness row; a null timing fails | pass |

The S100 cycle 18 counters are synthetic in shape; iteration 12 did not
enumerate them.

## Revised test expectations

- `reference and S100 timing misses fail while advisory misses remain
  recorded` is replaced by the RC-9 test, because resolved decision 5 changes
  the rule.
- The plateau test's comment now says ideal budgets, and it asserts every
  target is `ideal`.

## Limits

- By `s.revisions === b.revisions`, a periodic sweep that publishes an
  out-of-band change inside the settle window fails the hook.
- Archives recorded before this change lack `afterHook` and `ideal` rows and
  no longer verify.
- `scripts/reference-harness/plan5-fast-measure-cases.ts` still defaults a
  missing enforcement to `'binding'` in its printed label, and
  `plan5-instances.ts` still describes S500, S1000 and memory rows as
  advisory. Both are labels outside this plan's scope.
- The root `node_modules` shared by direct worktrees lacked the declared
  `@streamparser/json`; the integrated verification ran after `npm ci` in the
  worktree.

## Verification

Integrated build of iterations 1 to 3, Linux 6.8.0-85-generic x86_64,
Node v22.23.2:

| Command | Result |
| --- | --- |
| `npm run build && npm run type-check` | pass |
| `npx vitest run subs/daemon/subs/contexts/src/tests subs/daemon/src/tests subs/analysis/src/tests/session-revision.test.ts subs/analysis/src/tests/session-audit.test.ts subs/analysis/src/tests/session.test.ts subs/analysis/subs/project/src/tests/sweep.test.ts subs/analysis/subs/project/src/tests/capture.test.ts subs/analysis/src/tests/session-worker.test.ts` | 28 files, 337 tests pass |
| `node --test scripts/measurements/fast-evidence.test.mjs` | 19 tests pass |
| `git diff --check` | clean |

Full verification is the cucumber-viz commit audit on this worktree.

## Handoff

Plan 5's outstanding iteration 13 carries the sweep definition and the
coverage rule into its revision of
[daemon and analysis](../../../architecture/daemon.md). Plan 5's remaining
measurement uses the corrected harness, including any later run of the
hook-latency workloads.
