# Iteration 1 results: Periodic sweeps as maintenance

**Date:** 2026-09-13. **Outcome:** RC-1 to RC-4 pass. A periodic sweep no
longer marks a context `reconciling` or makes a covered request wait, and
sweeps keep `sweepIntervalMs` measured from the start of the previous sweep.
Direct work; no Studio workflow.

## Implemented behavior

- **Sweep kind.** `LiveContext.periodicSweepDue` records a due periodic sweep
  separately from `sweepRequired`; `RunningCapture.sweep` is `'required'`,
  `'periodic'` or `null`. `analyze()` classifies a run as a required sweep when
  `sweepRequired` is set or a request needs a sweep, and as periodic only when
  nothing but the elapsed interval caused it. A periodic sweep runs alone,
  behind any pending request, known change or audit, and leaves
  `synchronization` unchanged. `'sweep'` is removed from `background`.
- **Covering test.** Extracted as `covers()`. It admits a running periodic
  sweep that carries no requests and no changes (resolved decision 6), and
  `check()` evaluates it before `touch()` can mark a sweep due.
- **Cadence.** Starting any sweep records `lastSweepAt`, cancels the timer and
  clears `periodicSweepDue`. No timer is scheduled while a sweep runs; the
  finishing run reschedules it, and a firing timer re-checks elapsed time.
- **Cancellation.** A periodic sweep cancelled by a watcher event, or aborted,
  does not escalate to `sweepRequired`. A cancelled required sweep or watch
  update still does. Watcher reattachment ignores a running periodic sweep
  when choosing `reconciling`.

Files: `subs/daemon/subs/contexts/src/context-manager.ts`, `context.ts`,
`queue.ts` (type only), `tests/covering.test.ts`,
`tests/context-manager.test.ts`.

## Matrix rows

| ID | Test | Result |
| --- | --- | --- |
| RC-1 | `context-manager.test.ts`: configuration sweep at 20,000 ms held open; no periodic sweep at 30,000 ms; a hook and a status call during it do not bring the next closer; the next starts at 50,000 ms and the following at 80,000 ms | pass |
| RC-2 | `covering.test.ts`: covered hook during a held-open periodic sweep replies `captureStarted: null`, `reusedRevision: true` with no update; control: an uncovered hook waits, and the sweep then publishes with cause `sweep` | pass |
| RC-3 | `covering.test.ts`: covered hook at 31,000 ms answered before any sweep starts; control: the hook's activity then starts one periodic sweep and the context stays `synchronized` | pass |
| RC-4 | `covering.test.ts`: configuration, manifest, overflow and watcher-error sweeps each make a previously covered hook wait, with `reconciling` (`watcher-unavailable` for the error case) and `captureStarted` set | pass |

RC-1 to RC-3 fail against the original `context-manager.ts`; RC-4 passes on
both, as a regression guard.

## Revised test expectations

None. No existing test expected a periodic timer to mark the context
`reconciling`.

## Deviations and limits

- Deliverable 4 names cause `verify` or `watch`; the source and an existing
  test publish a periodic sweep's changes with cause `sweep`, which was kept.
- A periodic sweep that returns `reported` or an analysis error still sets
  `sweepRequired`.
- A running idle audit still refuses coverage; only periodic sweeps are
  maintenance for the covering test.
- A covered request can still be refused in the short interval after the
  session advances and before the context publishes.
- A run intended to sweep that ends before `session.sweep` still records its
  start as `lastSweepAt`.

## Verification

Run on the integrated build with iterations 2 and 3, Linux 6.8.0-85-generic
x86_64, Node v22.23.2:

- `npm run build && npm run type-check`: pass.
- `npx vitest run subs/daemon/subs/contexts/src/tests subs/daemon/src/tests`,
  included in the combined focused run recorded in
  [iteration 3 results](iteration3-results.md#verification): pass.
- `git diff --check`: clean.
