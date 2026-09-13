# Iteration 1 results: Time the promotion and the sweep

**Date:** 2026-09-13. **Outcome:** SE-1 and SE-2 pass. A revised or reported
update now reports the promotion of compiler reads that follows its
computation, and a sweep's round trip reaches the capture work even when the
sweep finds nothing. On the reference example the promotion accounts for
98.8 % of a broad created or deleted file revision's time outside the eight
stages. Direct work; no Studio workflow.

## Implemented behavior

- **Promotion.** `#complete` times `#promote`, including a promotion that
  throws, and returns it on its revised or reported result
  (`subs/analysis/src/session-engine.ts:270-292`). `update()` merges it beside
  `invocationCheck` (`:134-137`); every other update result reports
  `promotion: 0`. The observation retry in `#reopen` also times its promotion
  (`:400-408`). A sweep's revised result from `#complete` carries the same
  field.
- **Worker and host.** One predicate, `timedResult` in
  `subs/analysis/src/session-messages.ts:22-29`, selects the results that carry
  operation timings: an update's revised or reported result, and a sweep's
  revised, reported or unchanged result. The worker adds `workerStatus`
  (`session-worker.ts:56-57`) and the host adds `workerRoundTrip`
  (`session-host.ts:103-105`), both defaulting `invocationCheck` and
  `promotion` to 0. A cancelled result carries none. The in-process engine's
  unchanged sweep still returns `{ status: 'unchanged' }`; only its hosting
  layers add timings.
- **Contexts.** `account` adds `promotion` to the capture's work and, for the
  sweep leg only, adds the result's `workerRoundTrip` to `sweep` as well as to
  `workerRoundTrip` (`subs/daemon/subs/contexts/src/context-manager.ts:239-258`,
  sweep leg at `:378-380`). A sweep result without timings adds nothing. The
  capture's `revision.capture` and the reply's `ReplyTimings` receive both
  fields as before.
- **Codec.** The wire `capture()` validator requires `promotion` and `sweep`
  as finite non-negative numbers beside the existing fields
  (`subs/daemon/src/codec.ts:175-179`). Check response values are still not
  schema-validated, so `ReplyTimings` needs no codec change.

## Contract shapes

```ts
// subs/analysis/src/interfaces/session.ts
export interface OperationTimings {
  readonly invocationCheck: number;
  /** Promotion of the compiler's reads into the capture after computation, inside
   * `RevisionTimings.total` but outside its stages; zero when it did not run. */
  readonly promotion: number;
  readonly workerStatus?: number;
  readonly workerRoundTrip?: number;
}
export interface RetainedSession {
  // ...
  /** An unchanged sweep may carry the timings its hosting layers measured. */
  sweep(control?: RunControl): Promise<SessionUpdate | { readonly status: 'unchanged'; readonly timings?: OperationTimings }>;
}

// subs/daemon/subs/contexts/src/interfaces/contexts.ts
export interface CaptureWork {
  readonly invocationCheck: number;
  /** Promotion of compiler reads after computation, inside `total` but outside its stages. */
  readonly promotion: number;
  readonly workerStatus: number;
  readonly workerRoundTrip: number;
  /** The round trips of the capture's sweep operations, also counted in `workerRoundTrip`. */
  readonly sweep: number;
}
```

`CaptureTimings` and `ReplyTimings` extend `CaptureWork` and inherit both
fields. `promotion` is required, so every `OperationTimings` producer states
it. No type name, exposure line or package entry was added:
`WorkerResult` and the context manager's private `SweepResult` alias spell the
unchanged sweep structurally.

## Matrix rows

| ID | Evidence | Result |
| --- | --- | --- |
| SE-1 | `subs/analysis/src/tests/session-revision.test.ts:616` `promotion-timed: a revised update reports its promotion, which lies inside the total and outside the eight stages`: in-process engine; the observer's empty `apply` is delayed 40 ms; a created file takes the broad path, promotes once and reports `promotion ≥ 39` and `≤ total − Σ stages`; an unchanged-surface edit does the same; an identical update reports `{ invocationCheck: 0, promotion: 0 }`; the in-process unchanged sweep carries no timings; audit and batch equality hold | pass |
| SE-1 | `subs/analysis/src/tests/session-worker.test.ts:397` `timing-fields: worker replies add ...` (extended): real worker; an identical update reports `promotion: 0`; a source edit reports frozen `{ invocationCheck, promotion, workerRoundTrip, workerStatus }` with `promotion > 0` and `workerRoundTrip ≥ total + workerStatus`; an unchanged sweep carries `{ invocationCheck: 0, promotion: 0, workerStatus, workerRoundTrip }` with a positive round trip | pass |
| SE-1 | `subs/daemon/subs/contexts/src/tests/covering.test.ts:434` `promotion-timed: a capture adds its update's promotion and its sweep's round trip, including an unchanged sweep`: a `tsconfig.json` event and a hook share one capture; the update's promotion 7 and the unchanged sweep's round trip 25 give `revision.capture` and the reply `{ invocationCheck: 3, promotion: 7, workerStatus: 3, workerRoundTrip: 65, sweep: 25 }`; a following sweep without timings adds `sweep: 0` | pass |
| SE-1 | `subs/daemon/src/tests/codec.test.ts:164` `timing-fields: accepts a published revision whose capture carries session work, promotion, sweep round trips and watcher times ...` and `:170` `rejects a revision without its capture or with malformed capture timings`, now also rejecting a negative `promotion`, an infinite `sweep` and a capture missing either field | pass |
| SE-1 | `subs/daemon/src/tests/ipc.test.ts:102` `timing-fields: a socket check reply ...` (extended): real service, worker and socket; the reply has eight fields with `promotion > 0`, and `revision.capture` equals the reply's `promotion` and `sweep` | pass |
| SE-2 | [Attribution](#attribution-se-2) below: 98.8 % of the time outside the stages named for both created and deleted files, with per-part figures | pass |

Existing timing-field cases were updated for the added fields and still pass:
`session-revision.test.ts:588`, `covering.test.ts:401`, and the exact
`toEqual` expectations at `session-worker.test.ts:44-45` and `:123`, `:150`
(unchanged sweeps), `retained-session.test.ts:109`,
`root-resolution.test.ts:44` and `src/tests/resident-assembly.test.ts:44`.

## Attribution (SE-2)

**Method.** Resolved decision 8 permits a bounded loop. A scratch script
outside the repository copied `examples/collection-review` without
`node_modules`, `dist` and `.vite`, symlinked its `node_modules`, and applied
the `fast-fixture.mjs` setup: the `import './fast-measurement-created.js'`
witness in `src/assembly.ts` and the created file. It opened the session
engine in process with `sessionInputs(root)` and ran ten cycles, each deleting
and recreating `src/fast-measurement-created.ts` and calling `update` with the
matching change, releasing the previous revision each time. Every update took
the `broad` path. Temporary counters, since removed, timed the parts of
`#promote` and `ProjectObserver.#promoteReported`, the untimed work in
`recomputeAll` (`deriveAreas`, file-fact assembly, `buildIndexes` and the
final `deepFreeze`), the gaps between `revise`, promotion and `#publish`, and
`draftPublication`, `factBytes` and `findingDelta` inside `publish`. The
`promotion` column is the committed field. The instrumentation and the script
are not committed; `git status` was clean after restoring the files.

**Reference broad revision, medians of ten, milliseconds.** *Outside* is
`total` minus the eight stages.

| Field | Created | Deleted |
| --- | ---: | ---: |
| `total` | 1,019.6 | 1,031.5 |
| compiler | 457.7 | 470.0 |
| descriptions, accesses, link, decide | 41.3, 69.9, 17.3, 11.3 | 39.4, 62.9, 16.7, 10.9 |
| classify, inventory, publish | 2.7, 8.8, 5.5 | 2.5, 9.7, 5.4 |
| **Outside the stages** | **403.2** | **393.3** |
| **`promotion` (new field)** | **398.5** | **388.7** |
| Share of outside named by `promotion` | 98.8 % | 98.8 % |

| Part of the time outside the stages | Created | Deleted |
| --- | ---: | ---: |
| Promotion: `observer.inputs` before, merging 3,602 pending compiler reports into the captured list and sorting | 23.9 | 23.6 |
| Promotion: `observer.apply([])`, of which: | 348.1 | 344.3 |
| &nbsp;&nbsp;`capture.observe` of each reported path (entry kind) | 149.0 | 146.8 |
| &nbsp;&nbsp;`capture.readFile` of each reported file (read and hash, 898 files) | 147.2 | 147.4 |
| &nbsp;&nbsp;identity comparison after observation | 33.0 | 33.5 |
| &nbsp;&nbsp;path resolution, recorded lookup and prior identity | 8.5 | 8.8 |
| &nbsp;&nbsp;`take`, refresh, directory reads and the empty update | 7.4 | 7.6 |
| Promotion: `observer.inputs` after, the capture's rebuilt list | 21.2 | 21.5 |
| Promotion: the changed-read comparison | 1.0 | 1.1 |
| `#complete`: `observer.inputs` and `inputId` before `#publish` | 3.3 | 3.4 |
| `recomputeAll`: `deriveAreas`, fact assembly, `buildIndexes`, final `deepFreeze` | 1.1 | 1.1 |
| Unattributed | 0.1 | 0.1 |

Medians of parts do not add exactly to the medians above. Per cycle, the named
parts left 0.1 to 0.7 ms unattributed.

**What the promotion does.** A created or deleted file makes the observer
retire every compiler-reported observation
(`observer.ts:108-111`), and the session's whole invalidation makes the
compiler report them all again. The following promotion therefore takes about
3,600 observations: 2,648 absence probes, 898 files and 56 directories;
3,360 of them are under `node_modules`, and only 168 were still recorded. Each
is observed afresh and each file is read and hashed. That is the reference's
unattributed time, and it is independent of the change.

**Other named work.** Inside `publish`, `factBytes` takes 5.1 ms,
`draftPublication` 0.3 ms and `findingDelta` under 0.1 ms, which is nearly
all of the stage. The revision's own `deepFreeze` runs after `total` is taken
and costs 0.1 ms.

**Comparison with the measured median.** The measurement results give 456.5
(created) and 455.3 ms (deleted) outside the stages, through the worker and
daemon on build `4981ed5`. This in-process loop gives 403.2 and 393.3 ms.
The difference is not attributed: the loop has no worker heap limit, no
concurrent daemon or watcher, and adds about 50,000 `performance.now()` calls
of instrumentation per promotion. The measurement successor should read the
`promotion` field on the real process rather than assume this split.

## Commands

| Command | Result |
| --- | --- |
| `npx vitest run subs/analysis/src/tests` | 14 files, 216 tests passed |
| `npx vitest run subs/daemon/subs/contexts/src/tests` | 9 files, 117 tests passed |
| `npx vitest run subs/daemon/src/tests/codec.test.ts subs/daemon/src/tests/ipc.test.ts` | 2 files, 24 tests passed |
| `npx vitest run src/tests/resident-assembly.test.ts` | 6 tests passed, for the out-of-owner expectation |
| `npm run type-check` | pass, including the scripts and reference-harness projects |
| `git diff --check` | clean |
| Attribution loop, `npx tsx <scratch>/loop.mts 10` | ten created and ten deleted broad revisions; figures above |

The analysis run prints a Go stack trace from a compiler process that a test
ends deliberately; every test passed.

## Deviations

- **Out-of-owner edits.** `scripts/reference-harness/plan5-hosting-cases.ts`
  compared three worker sweeps with `{ status: 'unchanged' }` exactly; it now
  compares `status`, because the worker sweep carries timings.
  `src/tests/resident-assembly.test.ts` gained `promotion: 0`. Neither is a
  behavior change.
- **`timedResult` is new runtime code in `session-messages.ts`,** previously a
  type-only module. The worker imports it before the engine loads; it imports
  only types.
- **The in-process engine's unchanged sweep carries no timings.** The contract
  says it may; the worker supplies `invocationCheck: 0, promotion: 0` with
  its status checkpoint, so every hosted sweep result carries them. This keeps
  the reference harness's in-process comparisons and the scripted doubles
  valid.
- **`sweep` counts only round trips.** It is the part of `workerRoundTrip`
  spent in sweep operations. The in-process engine and scripted sessions
  without a host report 0.

## Remaining limits

- **Open and verify do not report promotion.** The cold open and the audit's
  mismatch publication both promote, but `SessionOpen` and `VerifyOutcome`
  have no timings, as before.
- **A failed promotion** is reported on the update's `reported` result; a
  cancelled one is not reported.
- **The attribution is in process,** not the measured worker path; see the
  comparison above.

## Successor inputs

- **Iterations 3 and 4.** The reference's 400 ms promotion comes from retiring
  every compiler observation and re-reporting them after a whole
  invalidation; 3,360 of the 3,602 re-promoted observations are dependency
  paths under `node_modules` that no owned file contributes. Targeted
  retirement under resolved decision 5 keeps them, so `promotion` on the
  membership path should fall to the few affected paths. SE-10 or SE-11 can
  assert that `timings.promotion` of a membership revision is far below that
  of the broad path on the same fixture.
- **Iteration 5.** `CaptureWork.sweep` is the sweep leg's cost on
  `revision.capture` and on the reply; SE-13 can show it at 0 after a
  reacquiring update, and SE-14 above 0 when the sweep is kept.
- **Iteration 7 and the measurement successor.** Read
  `timings.promotion` and `revision.capture.sweep` from the real hook replies.
  On S100 the time outside the stages was about 104 ms against about 456 ms on
  the reference, consistent with the promotion scaling with dependency reads
  rather than owners. `scripts/measurements/fast-assertions.mjs`
  `replySessionWork` still lists four fields; a covered answer's `promotion`
  and `sweep` are also 0, so it could list them.
- **Codec.** A hand-built `ContextRevision` sent through `encodeMessage` must
  include `capture.promotion` and `capture.sweep`.

## Audit

Pending.
