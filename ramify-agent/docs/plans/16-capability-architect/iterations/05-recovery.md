# Iteration 5: durable continuation, nested needs and limits

[Plan 16](../main-plan.md) · [Contracts](../contract-appendix.md)

## Prerequisites and owners

Iteration 4. Scope: harness internals. Reuse ledger effects, session lifecycle,
failure analysis and writer settlement; do not give the generic ledger
knowledge of capability semantics.

## Goal and read first

Recover the same work and authority after interruption. Read `run/log.ts`,
`run/sessions.ts`, `run/excursions.ts`, `run/writer.ts`, `work/failure.ts`,
`run/policy.ts` and existing composition/recovery tests under harness source.

## Deliverables

- Implement idempotent effects for delegation, questions/answers, assignments,
  plan updates and handback. Reconcile committed effects before invoking agents.
- Preserve unsubmitted source and failure evidence on timeout/context loss;
  recover the full provisional candidate, including inherited A source, index
  state, untracked files and recorded assignment attribution. Continue via a
  reconstructed engineer that must submit its own result.
- Reconstruct lost architect or consumer sessions from durable current context,
  recording actual fresh starts, losses and remaining work.
- Support one nested fresh capability task per delegated dependency, preserving
  the suspended parent and requesting engineer. Detect exact dependency cycles;
  let agents resolve semantic reuse or conflicting requests.
- Apply captured run/repair/reconstruction policy. Preview validation is not a
  failed submission; a repair/partial turn is not successful handback. Preserve
  the original cause when limits exhaust. Persist task assignment sequences,
  work-item deferrals and all limit counters. No wait or reconstruction can
  bypass the coordination stack to dispatch unrelated frontier work.
  Record changed defaults explicitly.

## Verification and exit criteria

Add `capability-recovery.test.ts` and `capability-dependencies.test.ts` covering
CA05, CA18–CA22, CA25–CA26 and CA28–CA32. Use fault injection at every side-effect boundary,
real dirty-tree recovery, missing-session fixtures and an unsettled writer.
Run per-iteration checks.

Exit: restart and uninterrupted runs produce equivalent accepted task state;
no duplicate coordinator/writer/handback occurs; missing submissions stay
unfinished; nested work returns to the correct requester.

## Handoff

Publish state projection fixtures for active, waiting, stopped, reconstructed,
failed and handed-back tasks to iteration 6. Record actual policy values.
Write `iteration5-results.md` following the [iteration index](README.md).
