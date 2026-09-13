# Iteration 5 results: Skip the sweep after reacquisition

**Date:** 2026-09-13. **Outcome:** SE-13 and SE-14 pass; HO-13 to HO-15 still
pass. A capture whose sweep was required only by configuration or manifest path
events now skips its sweep leg when its update reports that it acquired the
project again. Every other required sweep still runs. Direct work; no Studio
workflow.

The SE-13 test found a defect that predates this plan, recorded under
[Compiler options defect](#compiler-options-defect-found-by-se-13). An
options-only edit that changes the default libraries, such as `target` without
an explicit `lib`, did not reach the retained compiler. The session then
published inputs and an `inputId` that differed from batch, and its audit
compared equal. It is fixed in a separate commit, in the `typescript` owner.

## Implemented behavior

- **Reacquisition report, `analysis`.**
  - `Computed` gains an optional `reacquired` flag. The broad branch of `revise`
    sets it to whether the observer update was `structural`
    (`subs/analysis/src/session-revision.ts:682`). A structural update reaches
    only that branch, because it counts as a broad trigger.
  - `#complete` reports `reacquired` as the flag, but only when the facts are
    valid, because only then does promotion run
    (`subs/analysis/src/session-engine.ts:277`, `:286`).
  - Every other revised result reports `false`: identical updates, republished
    invocations, sweeps with identical results, the context manager's open and
    audit mismatch, and `#reopen`. `#reopen` retries observation for a session
    opened over an invalid capture (`session-engine.ts:153`, `:158`, `:186`,
    `:392`, `:398`, `:414`).
  - A sweep's revised result carries the field truthfully. Contexts read it
    only on the update leg.
  - The worker and host pass the field through unchanged.
- **Sweep rule, `daemon/contexts`.**
  - `LiveContext.sweepRequired` is now `boolean | 'configuration'`
    (`subs/daemon/subs/contexts/src/context.ts:37-40`).
  - The configuration path pattern writes `'configuration'` only when no sweep
    is required yet (`context-manager.ts:182`).
  - Every other writer still writes `true`, which replaces `'configuration'`.
    These writers are: a watcher overflow or error, a queue overflow, a
    cancelled background capture, a reported or failed capture, a rejected
    publication, a cold transition, an unavailable watcher, and a request that
    needs a sweep. All readers test truthiness and are unchanged.
  - `analyze` computes `reacquirable` before it clears the requirement. The
    requirement must be `'configuration'`, and no request in the batch may need
    a sweep (`:347`).
  - The sweep leg is skipped when `reacquirable` holds and the update returned
    `revised` with `reacquired: true` (`:382-383`).
  - `lastSweepAt` was already set at the capture's start. `synchronization` is
    computed after publication exactly as when a sweep returns unchanged.
    `CaptureWork.sweep` stays 0. A cancelled or failed update keeps
    `sweepRequired` as before.
- **Architecture.** A bullet in
  [Fast incremental checks](../../../architecture/daemon.md#fast-incremental-checks)
  states the rule (`docs/architecture/daemon.md:540-542`). The document had no
  separate sweep scheduling text, so the bullet follows the covering rule.
- **Compiler options fix, `typescript`**
  (`subs/analysis/subs/typescript/src/retained-source-analysis.ts`).
  - `#parseConfiguration` (`:389`) records the text of every file the adapter's
    configuration parse reads: the selected configuration and its `extends`
    chain. It returns the files whose text changed or disappeared since the
    previous parse.
  - On `invalidateAll`, those files are named in a snapshot update
    (`changed`/`deleted`) before the whole invalidation (`:140-148`).
  - The membership update names them as well (`:157-165`), so the recorded
    texts never absorb a change the compiler has not seen.
  - A cold or reopened server clears the record (`:362`).

## Contract shapes

```ts
// subs/analysis/src/interfaces/session.ts
export type SessionUpdate =
  | { readonly status: 'revised'; readonly revision: SessionRevision; readonly identical: boolean;
      /** A structural observer update acquired the project again on a fresh, validated capture and
       * this revision promoted every compiler read into it. False for an identical or invalid result
       * and for the observation retry of a session opened over an invalid capture. */
      readonly reacquired: boolean; readonly timings?: OperationTimings }
  | { readonly status: 'reported'; readonly report: AnalysisReport; readonly timings?: OperationTimings }
  | { readonly status: 'cancelled' };

// subs/analysis/src/session-revision.ts (session-private)
export interface Computed { /* ... */ readonly reacquired?: boolean }

// subs/daemon/subs/contexts/src/context.ts (owner-private)
export interface LiveContext { /* ... */ sweepRequired: boolean | 'configuration' }
```

`reacquired` is required, so every producer states it. No exposure line,
package entry or codec change was needed: the daemon codec validates
`ContextRevision`, not `SessionUpdate`.

## Matrix rows

| ID | Evidence | Result |
| --- | --- | --- |
| SE-13 | `subs/daemon/subs/contexts/src/tests/covering.test.ts:465` `sweep-skipped-after-reacquire: a configuration event and a hook run one update that reacquired, no sweep, and publish synchronized`. A `tsconfig.json` event and a hook share one capture. The capture makes one update with `reacquired: true` and no sweep. `revision.capture` and the reply carry the update's work with `sweep: 0`. The context is `synchronized` with nothing pending, a following hook is covered without a capture, and no sweep starts before the interval. A watcher-only `package.json` capture skips the sweep the same way (`cause: 'watch'`, `sweep: 0`) | pass |
| SE-13 | `subs/daemon/src/tests/session-counters.test.ts:127` `sweep-skipped-after-reacquire, sweep-kept: ...`. Real daemon service with the counting session wrapper. A reacquiring configuration hook adds `{ analyses: 1, sweeps: 0 }`; a hook for an unrecorded `subs/tool/package.json` adds `{ analyses: 2, sweeps: 1 }` | pass |
| SE-13 | `subs/analysis/src/tests/session-revision.test.ts:1010` `sweep-skipped-after-reacquire: a structural update reports reacquisition, and a sweep of the same capture finds nothing`. In-process engine on disk. A `target` edit reports `{ identical: false, reacquired: true, path: 'broad' }`, and the following sweep returns `unchanged`. The source, identical, membership and `unknown`-broad updates report `false`. A structural update with an invalid acquisition reports `false`; its repair, a structural reconciliation, reports `true`. A sweep that finds a configuration edit reports `reacquired: true` on its revision. Batch equality and the audit hold after each group | pass |
| SE-13 | `subs/analysis/src/tests/retained-session.test.ts:227` `sweep-skipped-after-reacquire: a worker update reports reacquisition ...`. Worker-hosted session: the configuration edit reports `true` and the sweep is `unchanged`. Unchanged-surface, membership and identical membership updates report `false`. Equal to batch | pass |
| SE-14 | `covering.test.ts:495` `sweep-kept: a matched configuration path the update did not reacquire for still sweeps before the capture is synchronized`. The update keeps the capture and the sweep is held open. While the sweep runs, the context stays `reconciling` and still publishes sequence 1. After the sweep, it publishes sequence 2 as `synchronized` with `sweep: 25` | pass |
| SE-14 | `covering.test.ts:515` (two cases) `sweep-kept: a watcher overflow before / after the configuration event still sweeps after a reacquiring update`: one update and one sweep; `cause: 'conservative'`, `sweep: 25` | pass |
| SE-14 | `covering.test.ts:528` `sweep-kept: a queue overflow before a configuration event still sweeps after a reacquiring update` | pass |
| SE-14 | `covering.test.ts:542` `sweep-kept: a cancelled configuration update leaves a sweep that the next reacquiring update does not satisfy`. A newer write cancels the background capture. The retried capture updates `[src/index.ts, tsconfig.json]` with `reacquired: true` and still sweeps once | pass |
| SE-14 | `covering.test.ts:560` `sweep-kept: a request that needs a sweep still has one after a reacquiring configuration update` (report scope, empty expectations) | pass |
| SE-14 | `covering.test.ts:572` `sweep-kept: a cold open acquires in full and leaves no configuration requirement a later update could satisfy`, and `retained-session.test.ts:269`. In the first, after cooling, a hook reopens the context with an `open` and no update or sweep. A later configuration update that does not reacquire still sweeps. In the second, the worker session's observation retry after an invalid cold open reports `reacquired: false`. See [Deviations](#deviations) on what "cold open" can mean here | pass |
| SE-14 | `session-counters.test.ts:127`: see above, the kept sweep is counted | pass |

**Mutation check.** These were scratch edits, reverted before the commit.
With `reacquirable` forced to `true`, the five SE-14 cases that script a
reacquiring update fail. With `reacquirable` forced to `false`, the SE-13
contexts case and the counters case fail.

**HO-13 to HO-15 and earlier sweep cases.** They are unchanged and pass in
`covering.test.ts`, which has 126 tests across the contexts directory. The
existing configuration cases never report `reacquired`, so they keep their
sweep: `waits for a required configuration sweep before trusting a covered
identity`, `promotion-timed` and `sweep-cadence`.

**Exit criterion.** No test publishes a capture as synchronized after a skipped
sweep whose update did not reacquire. The only skips happen in the SE-13 cases,
and both scripted updates report `reacquired: true`.

## Compiler options defect (found by SE-13)

- **Symptom.** At `159634a`, an in-process session over the analysis fixture
  published different inputs from batch after editing `target` from ES2022 to
  ES2023. The fixture sets no `lib`. The session kept
  `external:.../lib.es2022.full.d.ts` and lacked the five `lib.es2023.*` reads,
  and its `inputId` differed. `verify()` still returned `equal`, because the
  audit recomputes through the same retained compiler.
- **Scope.** The same happened when the target moved in an `extends` file. The
  sweep does not detect the defect: in the SE-13 test it returned `unchanged`
  after the update. Skipping the sweep therefore neither causes nor hides it.
- **Measured rows.** The reference example sets
  `"lib": ["ES2022", "DOM", "DOM.Iterable"]`. Its measured ES2022/ES2021
  configuration row was unaffected, and every cycle of the loop below equaled
  batch even without the fix. Whether the S100 row was affected depends on
  whether its generated configuration names `lib`; this was not checked.
- **Cause.** Hypothesis 5 says "the adapter re-parses the configuration on
  `invalidateAll`". The adapter does call `parseConfigFile`, but only for its
  root list. The server keeps the options of the open project across an
  `invalidateAll` snapshot. Naming the edited configuration as `changed`
  refreshes them.
- **Evidence.** `subs/analysis/subs/typescript/src/tests/retained-source-analysis.test.ts:203`
  `reaches edited options of the configuration and its extended file through a whole invalidation, reading the libraries a fresh adapter reads`.
  - Setup: an `extends` target edit, followed by a target in the selected
    configuration, each with only `invalidateAll`.
  - Checks: the libraries read equal those a fresh adapter reads, and the
    program holds the new `lib.*.full.d.ts` and not the old one.
  - Result: it fails at `159634a` (63 against 67 libraries) and passes with the
    fix.
  - The SE-13 session test equals batch after its `target` edit only with the
    fix.
- **Cost.** An edit to configuration text costs one extra snapshot update.
  Nothing else is affected, because the adapter notifies only files whose text
  changed. In two back-to-back scratch runs on the reference example (below),
  the compiler stage median rose from 404 to 472 ms and, in an earlier pair,
  from 322 to 532 ms. The machine was shared and the totals were within noise.

## Reference sweep round trip (deliverable 5)

**Method.** A scratch script, outside the repository and not committed, run
with `npx tsx`:

1. Copy `examples/collection-review` without `node_modules`, `dist` and `.vite`,
   and link its `node_modules`.
2. Open the worker-hosted session with `openRetainedSession`.
3. Each cycle, toggle `"target"` between ES2022 and ES2021 (the
   `fast-fixture.mjs` edit), call `update([tsconfig.json])`, then `sweep()`, and
   compare `inputId` with `analyzeProject`.

The explicit `sweep()` is the leg a context ran before this iteration.
`sweepRoundTrip` is iteration 1's field, the sweep's `workerRoundTrip`, which
contexts add to `CaptureWork.sweep`. Every update reported `reacquired: true`
on the broad path, every sweep returned `unchanged`, and every cycle equaled
batch.

| Medians, ms | Run A, 5 cycles, before the fix | Run B, 7 cycles, adapter at `159634a` | Run C, 7 cycles, with the fix |
| --- | ---: | ---: | ---: |
| update `total` | 1,204 | 1,484 | 1,327 |
| compiler | 322 | 404 | 472 |
| promotion | 421 | 519 | 402 |
| update round trip | 1,215 | 1,507 | 1,338 |
| **sweep round trip (before this iteration)** | **275** | **321** | **264** |

**After this iteration** the context skips that leg for such a capture, so
`revision.capture.sweep` is 0 (SE-13). The saving is the sweep's round trip,
about 260 to 320 ms on the reference example in process. This matches the
plan's estimate of about 260 ms for S100. These are in-process worker figures,
not hook measurements.

## Commands

| Command | Result |
| --- | --- |
| `npx vitest run subs/analysis/src/tests` | 14 files, 227 tests passed |
| `npx vitest run subs/daemon/subs/contexts/src/tests` | 9 files, 126 tests passed |
| `npx vitest run subs/daemon/src/tests/session-counters.test.ts subs/daemon/src/tests/codec.test.ts src/tests/resident-assembly.test.ts` | 3 files, 25 tests passed (`resident-assembly` for its edited expectation) |
| `npx vitest run subs/analysis/subs/typescript/src/tests subs/analysis/subs/project/src/tests` (adapter changed) | 22 files, 293 tests passed |
| `npm run type-check` | pass, including the portable, scripts and reference-harness projects |
| `npm run build` then `npm run check:self` (adapter changed) | completed, passed, complete coverage: 11 owners, 283 source files, 3,764 accesses, 0 errors, 0 warnings, 0 analysis limits. The daemon it started, rooted at this worktree and holding one context, was stopped with `dist/src/ramify daemon stop` |
| `git diff --check` | clean |
| Scratch `config-loop.mts` via `npx tsx`, runs A to C | figures above |
| Scratch session test of the `target` edit, with the source at `159634a` and with the fix | failed, then passed; removed |

## Audit

The cucumber-viz commit audit of `387ddc0`, run with `use_existing_head` on the
worktree, passed in 2 min 10 s: worktree dependencies, type-check and the
Vitest regression suite. Evidence:
`refs/audited/runs/2026-09-13T21-40-33Z-387ddc0`. These results are a docs-only
follow-up.

## Deviations

- **Adapter fix in `typescript`.** This owner is not in the iteration's owner
  list. The defect breaks resolved decision 2, and SE-13's session evidence
  could not equal batch without the fix, so the fix landed as its own commit,
  `76728ac`. It needs review together with iteration 4's `MembershipReach`.
- **Which requirements a reacquisition satisfies.** Resolved decision 6 lists
  the sweeps that still run. The rule takes the conservative reading: only a
  requirement written solely by configuration path events is satisfiable. A
  batch with any other requirement keeps its sweep, even though a fresh
  capture would also cover a lost watcher event. The same applies to a
  cancellation of a configuration-only capture, and to a request that needs a
  sweep.
- **"Cold open" in SE-14.** The context manager's open has no sweep leg. The
  open is the capture's acquisition and sets `lastSweepAt`, and the manager
  cannot hold a session while its state is cold, so nothing can skip that
  requirement. The SE-14 evidence is therefore:
  - the reopen runs a full `open`;
  - the reopened context still sweeps after a configuration update that did not
    reacquire;
  - the session's cold observation retry (`#reopen`) reports
    `reacquired: false`.

  Reporting `true` from `#reopen` would be equally sound, since it is a fresh
  acquisition followed by promotion. The plan names only structural updates.
- **Session `lastSweepAt`.** `SessionStatus.lastSweepAt` still records only
  sweep operations; a skipped leg does not advance it. The context's own
  `lastSweepAt`, which schedules sweeps, does advance.
- **Identical reacquisition.** A structural update that `revise` reports as
  `identical` returns `reacquired: false`, because no compiler invalidation or
  promotion ran. Such a capture still sweeps.
- **Out-of-owner test edits.** `src/tests/resident-assembly.test.ts` gained
  `reacquired: false` in an exact expectation.

## Review items

1. **The adapter fix and its cost:** one extra snapshot update when
   configuration text changes, for exactness on options that change the files
   the compiler reads.
2. **The conservative requirement rule** above, against a broader reading of
   resolved decision 6.
3. **`#reopen` reporting `false`.**

## Remaining limits

- **The rule depends on the watcher.** If a hook names `tsconfig.json` before
  the watcher event arrives, the capture has no sweep requirement and runs no
  sweep, as before. If the event arrives while that capture runs, it requires a
  sweep in a following background capture. That capture's update is identical,
  so it reports `reacquired: false` and the sweep runs, outside the hook's
  reply.
- **Not measured through the hook.** The reference figures are in process; the
  measurement successor reads `revision.capture.sweep` on the configuration
  row.
- **The adapter's configuration record** covers what its own `parseConfigFile`
  reads. A configuration input that only the server's project parse reads, and
  that the adapter's parse does not, would not be named. None is known.

## Successor inputs

- **Iteration 6.**
  - An options-only update keeps the capture and is not structural, so it
    reports `reacquired: false` and its capture still sweeps. Iteration 6
    decides whether its whole invalidation's promotion re-verifies every
    retained observation. If it does, it can report `reacquired: true` for that
    update by setting `Computed.reacquired` on its branch; the context rule
    needs no change.
  - The compiler now honours option edits only through the adapter's
    configuration record. A kept-inventory update must still reach
    `invalidateAll`, or the membership branch's `inventory` parse, with the
    adapter's texts unchanged since the last parse, so that the edited
    configuration is named.
  - SE-15's batch equality needs an option that changes compiler reads, such as
    `target` without `lib`, to exercise this.
- **Iteration 7 and the measurement successor.**
  - On the configuration rows, expect `revision.capture.sweep` of 0.
  - The compiler stage includes the extra snapshot update for the configuration
    edit.
  - The S100 fixture's configuration should be checked for an explicit `lib`
    when interpreting earlier configuration row medians.
  - `fast-assertions.mjs` could assert `capture.sweep === 0` for the
    configuration row.
- **Review of resolved decision 2.** The session audit cannot detect a
  retained-compiler option mismatch, because it recomputes through the same
  compiler. Only batch comparison can.
