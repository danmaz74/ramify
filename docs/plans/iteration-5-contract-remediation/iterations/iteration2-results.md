# Iteration 2 results: Cancellation without advanced state

**Date:** 2026-09-13. **Outcome:** RC-5 to RC-7 pass with batch equality. A
sweep or revision cancelled before the observer applies changes leaves the
session as published, so the next description edit takes `description`.
Deliverable 2 was not applied as written; see Deviations. Direct work; no
Studio workflow.

## Implemented behavior

- **Advanced-state marker in `revise()`.** A local `advanced` flag is set
  immediately before `observer.apply`; every compiler update follows it. The
  error handler sets `state.stale` only when `advanced` is set or the error is
  not a cancellation.
- **Check before revising.** `sweep` returns `cancelled` when the signal
  aborted during `reobserve()`, without entering `revise()`. Both cancelled
  returns go through `#cancelledSweep`, which still marks the session stale
  when `observer.inputId` differs from the published revision's: reobservation
  first promotes pending compiler reads, and changes it recorded would not be
  observed again.
- **Early stop.** `Capture.changes(signal?)` checks the signal between paths
  and between hashed chunks; `Observer.reobserve` passes it. `validate()` is
  unchanged.
- **Promotion and publication handler.** Unchanged in behavior; a comment
  records why it still marks the session stale on cancellation.

Files: `subs/analysis/src/session-revision.ts`, `session-engine.ts`,
`subs/analysis/subs/project/src/capture.ts`, `observer.ts`,
`src/tests/session-test-fixture.ts` (a `reobserve` spy and a pass-through
`revise` counter), `src/tests/session-revision.test.ts`.

## Matrix rows

| ID | Test | Result |
| --- | --- | --- |
| RC-5 | `reobserve` wrapped to abort after the real call: `sweep` returns `cancelled`, `apply` is never called, the next revision takes `description`, the audit is equal and the facts equal batch | pass; failed with `broad` before the fix |
| RC-6 | abort after the real `apply`: the session is stale; the next revision takes `broad`, reflects the edit and equals batch | pass before and after (positive control) |
| RC-7 | signal aborted during reobservation: `reobserve` rejects, `revise()` is not entered, the session is not stale; the next revision takes `description` and equals batch | pass; failed before the fix |

Two further cases: cancellation after reobservation promoted a changed
compiler read (stale, then `broad`, equals batch; fails without the inputId
test), and cancellation before promotion in the publication handler (stale,
then `broad`, equals batch).

## Revised test expectations

None. The audit case "cancels during observation promotion" still expects
stale, because `verify`'s handler is unchanged.

## Deviations

Deliverable 2 asked the promotion and publication handler not to mark the
session stale for a cancellation before `#promote`. Every revision reaching
that handler has already applied its changes to the observer inside
`revise()`, so resolved decision 3 itself requires stale there. Applying the
literal deliverable made the repeated event compare `identical: true`, and the
edit was never published; the fifth test above failed that way before the
handler was restored.

## Limits

A sweep cancelled after `revise()` has applied changes still marks the session
stale, and the next description edit takes `broad`. That window is short:
reobservation has finished and the description path does no compiler work.
Closing it would require replaying unpublished changes rather than marking
the session stale.

## Verification

Run on the integrated build with iterations 1 and 3, Linux 6.8.0-85-generic
x86_64, Node v22.23.2:

- `npm run build && npm run type-check`: pass.
- `npx vitest run` on `session-revision`, `session-audit`, `session`,
  `session-worker`, and the project owner's `sweep` and `capture` tests,
  included in the combined focused run recorded in
  [iteration 3 results](iteration3-results.md#verification): pass.
- `git diff --check`: clean.
