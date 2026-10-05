# Session cancellation repair results

**Date:** 2026-10-05. **Status:** repaired in the session host. The
`I1-28:relocated-package` failure in
`subs/analysis/src/tests/session-worker.test.ts` › "retained session worker
cancels queued and active calls without losing the last published revision"
was a product defect: the host answered `cancelled` for an update whose
revision the worker had published and the host had made current. Changes are
uncommitted.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit | `651a655a` |
| Changed | `subs/analysis/src/session-host.ts`; `subs/analysis/src/tests/session-worker.test.ts` (one new test, one adjusted expectation); `subs/analysis/src/tests/session-worker-fixture.ts` (an optional request route); `docs/architecture/daemon.md` (one sentence); this receipt |
| Unchanged | The worker, the engine, the revision step, the contexts layer, every `module.ramify`, every protected document |
| Evidence | `/home/app/ramify-pb1-evidence/session-cancel/` |

## Contract

- `docs/architecture/daemon.md`, update ordering: "an acknowledged request must
  receive its own revision result or an explicit cancellation/supersession
  outcome. Expensive obsolete work may be cancelled. It must never publish over
  a newer generation or return another revision's findings under the old
  request token."
- [Contract remediation](../../iteration-5-contract-remediation/main-plan.md),
  rule 3: "A revision cancelled before it applies observer changes or updates
  the compiler returns `cancelled` and leaves the session exactly as published.
  A revision cancelled after either point still marks the session stale."
- [Plan 5 scope](../../iteration-5-fast-incremental-checks/scope.md): "The
  update continues unless explicitly cancelled or failed; successful work
  publishes."
- Iteration 2 subcase `I2-06:cancel-request` (contexts): "`cancelled` under its
  id; ... no revision published for that request."

Cancellation is best effort: work that completes before it observes its abort
publishes, and its caller receives that revision. A `cancelled` answer means
the call published nothing. The engine already keeps that rule: it never
publishes and answers `cancelled`. The host broke it.

## Cause

`SessionHost` (`session-host.ts`) set `#current` from every reply that carried a
new revision, then `update`, `sweep` and `verify` returned
`control.signal?.aborted ? { status: 'cancelled' } : result`. The host's
answer was decided by the caller's signal, not by what the worker did.

An abort reaches the worker as a `cancel` message, which the worker processes
only at a macrotask boundary. On the broad path after `releaseCompiler`, the
worker opens the compiler and recomputes synchronously for about 300 ms with no
macrotask boundary. The last signal check before publication is
`observer.apply([], signal)`'s `throwIfAborted` at the start of the final
promotion, and that promotion's file reads are the first boundary.

Instrumented failing run (`diag-fail-22.log`; temporary worker, engine and
revision-step logging under 14 busy Node loops, since reverted), worker clock in ms:

| Time | Event |
| --- | --- |
| 2348.08 | worker receives `update#3`; the engine starts `revise`, not aborted |
| 2351.07 | observer applied, not aborted |
| 2620.42–2658.86 | broad recompute after the synchronous compiler open, not aborted |
| 2658.96 | `revise` returns computed; `#complete` starts promotion |
| 2669.15–2669.52 | worker processes `update#4`, `cancel#4`, `cancel#3` (control present), during the promotion's reads |
| 2786.78 | promoted; publishing with the signal aborted |
| 2788.50 | reply `update#3` **revised** (sequence 2); `update#4` cancelled |

The host made sequence 2 current and answered `update#3` `cancelled`. In a
passing run (`diag-pass-example.log`), the cancels arrive 2 ms after the update
starts, during `revise`'s observer apply, and the update answers `cancelled`.

The test-only diagnostic captured the same reply sequence in all five baseline
failures (`baseline-diagnostic.jsonl`): `#3 revised sequence 2`, `#4 cancelled`.
The same disagreement occurs without any delay in the worker whenever the caller
aborts after the worker has published but before its reply arrives.

## Classification and fix

This is a product defect: the answer and the handle's state disagreed. The fix
follows the contract. Once a call's reply publishes a revision, the call answers
it:

- The message handler records each reply whose revision became `#current` (a
  private `WeakSet` of the frozen answers it resolves).
- `#cancelled(control, result)` is true only when the signal aborted and the
  reply published nothing. `update`, `sweep` and `verify` use it; a `verify`
  mismatch publishes, so it is covered as well.
- A reply that publishes nothing still answers an aborted call `cancelled`,
  including an identical update and an unchanged sweep. A call aborted before
  posting still answers `cancelled` without a round trip.

The worker, engine and revision step are unchanged. An extra signal check
between promotion and publication would narrow the window. It cannot close it,
since an abort can still arrive after publication and before the reply, and it
would discard completed work. The engine was not changed.

## Tests

- New: "answers a call whose abort reaches the worker after it published with
  the revision it made current". It holds the host's `cancel` messages until
  each call settles, through an optional `route` added to `observedOpen`. That
  forces the failing interleaving with the real supervisor, worker and engine.
  It asserts the following:
  - The aborted broad update's worker reply is `revised`; the call answers
    `revised` at sequence 2, and `current` is that revision.
  - An aborted sweep after a further edit answers `revised` at sequence 3, and
    `current` is that revision.
  - An aborted identical update, whose worker reply is `revised` with
    `identical: true`, answers `cancelled`, and `current` is unchanged.
  - The session then equals batch.
- Adjusted: the existing test now asserts the outcome for each possible
  interleaving. The queued call is always `cancelled`. If the active update
  answers `cancelled`, `current` is still the opened revision. Otherwise it
  answers `revised`, not identical, at the next sequence, and that revision is
  `current`. The old expectation that the active update always answers
  `cancelled` is wrong under the contract: it allows work to finish and publish
  when it completes before observing its abort.

| Run | Result |
| --- | --- |
| Original test before the fix, 80 runs under load | 5 failed (runs 15, 43, 50, 57, 80), each `expected { sequence: 2 } to be { sequence: 1 }` (`baseline-load-filtered.log`) |
| New test before the fix, 5 runs | 5/5 failed at `expect(updated.answer.status).toBe('revised')`: received `cancelled` after the worker's reply was asserted `revised` (`regression-before-*.log`) |
| New test after the fix, 5 runs | 5/5 passed (`regression-after-*.log`) |
| Both cancellation tests after the fix, 200 runs under load | 200/200 passed (`after-load-cancel-tests.log`) |

The load was 14 busy Node loops (`busy.mjs`) on 12 cores, at the same nice level
as the tests (5). Each loop was stopped by its PID and confirmed gone
(`load-stopped.txt`). Repetition stopped at the user's instruction. No unloaded
repetition batch was run.

## Siblings checked

| Operation | Finding |
| --- | --- |
| `sweep` | Same defect (a revised reply answered `cancelled`); fixed and covered by the new test |
| `verify` | Same defect for a `mismatch` reply, which publishes; fixed by the same rule. Not exercised deterministically: a mismatch cannot be forced without an injected fault |
| `report`, `apiView`, `architectView`, `measurements`, `affected`, `explorerDetails` | Their replies never change `current`; answering `cancelled` or `null` after an abort agrees with the state. Unchanged |
| `releaseCompiler`, `releaseRevision` | No signal. Unchanged |
| `open` | An aborted open disposes the session before answering `cancelled`, so no state survives. Unchanged |
| Engine (`session-engine.ts`) | Never answers `cancelled` after publishing; a publication in `#complete`, `#reopen`, `update` and `verify` returns its revision. Unchanged |
| Contexts (`context-manager.ts` `analyze`) | Checks its own controller before reading a run's status and publishes from `session.current`. `releaseUnpublished` keeps the current revision, and a later request is not covered until it is published. It therefore never relied on the host's answer and had no disagreement. The deadline path never aborts the session. Unchanged; the one difference is that an aborted audit that found a mismatch now records its `auditedSequence`, which is accurate |

## Commands and results

Focused commands ran without the lock, after the last source edit and with the load stopped. The
reference cases and the I5-08 instances held `/tmp/ramify-audit-tests.lock`
(`run-locked.sh`: requested and acquired 05:39:20, released 05:47:29 UTC). The
tree was identical (same `git status` and diff hash) before and after them.

| Command | Exit | Result | Evidence |
| --- | --- | --- | --- |
| `git diff --check` | 0 | clean | `diff-check.log` |
| `npm run type-check` | 0 | four scopes | `type-check.out` |
| `npm run build` | 0 | built | `build.out` |
| `npm run check:self` | 0 | passed, partial; 15 owners, 591 source files, 17 resources, 8782 accesses, 0 errors, 0 warnings, 41 limits, 5628 allowed, 0 denied, 3110 external | `check-self.out` |
| `npx vitest run subs/analysis/src/tests/session-worker.test.ts`, three times | 0 ×3 | 17/17 each | `session-worker-final-{1,2,3}.log` |
| `npx vitest run subs/analysis/src/tests/` | 0 | 44 files, 508 tests | `vitest-analysis.out` |
| `npx vitest run subs/daemon/subs/contexts/src/tests/` | 0 | 15 files, 191 tests | `vitest-contexts.out` |
| `npx vitest run subs/daemon/src/tests/` | 0 | 23 files, 257 tests | `vitest-daemon.out` |
| `npm run reference:cases` (locked) | 0 | 37 files, 393 tests | `cases.stdout`, `cases.stderr` |
| I5-08 `worker-nonblocking`, `deadline-exceeded-explicit` (locked, `some-instances.mts`) | 0 | 2/2 passed | `p5-instances.out` |

`reference:verify` and the audit were not run; they are left to the coordinator's gate.

## Protected documents

No `.principles.md`, `.spec.md` or glossary file was edited. The existing
contract text covers the behaviour, so no patch is proposed.
`docs/architecture/daemon.md` gains one sentence in the retained-session
structure paragraph stating the host's answer rule.

## Coordinator review

The coordinator commissioned this repair after the rerun of iteration 17's
gate failed `I1-28:relocated-package` through this test, and reviewed the
contract passages, the interleaving and the change. The session host
answered `cancelled` for a call whose reply had already made a new revision
current; it now answers `cancelled` only when the reply published nothing.
The existing test's expectation that the in-flight update always answers
`cancelled` contradicted the contract and now accepts each outcome the
contract allows, with the state that must go with it; the new test forces
the failing order and fails on the previous code. No protected document
changed. The load repetition was stopped when the user's flaky-test policy
of 2026-10-05 arrived. The gate runs on the committed candidate.
