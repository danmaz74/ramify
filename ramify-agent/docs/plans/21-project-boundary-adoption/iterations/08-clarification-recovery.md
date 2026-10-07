# Iteration 8: incomplete-request rejection and durable reassessment

**Plan:** [Plan 21](../main-plan.md). **Prerequisites:** iteration 7.
**Owners:** harness ordinary/capability architect continuation, ledger/recovery,
briefs and public projections. Reuse existing limits/effects.

## Goal

Reject completion requests that omit reports through the existing
rejected-submission path, and make declarations durable, without harness
semantic judgments, new budgets or automatic declaration invalidation.

## Read first

[Recovery contract](../contracts.md#11-incomplete-requests-reassessment-and-recovery),
current local completion/capability handback turns, the rejected-submission
bound, accepted-submission recovery, durable effects and fresh-architect briefing tools.

## Deliverables

- On completion/handback, calculate only outstanding registered required IDs
  belonging to the responsible architect. Reject a request that omits one,
  naming the IDs, through the existing rejected-submission path and bound; the
  same turn continues. No continuation brief or outstanding-question record.
- Accept forgotten-report declarations in that turn; let genuinely unfinished
  work continue normal coordination or an explicit blocker. Do not request
  test-file or audit corroboration. Omitted `where` never causes a rejection.
- Use the existing rejection and work/recovery bounds. Exhaustion ends the
  session as a rejected-submissions result carrying the outstanding IDs; no
  semantic code-failure verdict or counter.
- Persist declarations with existing effects. Recover before another writer,
  and apply duplicate submissions/replayed effects idempotently.
- Supply relevant current source/delta, audit reports and reviews through current
  readable tools and concise briefs. Architect decides whether to revise prior
  judgments; no affected-case inference, source-triggered reset or audit withdrawal.
- Keep ordinary/capability flows consistent and preserve standalone engineering,
  nested suspension and Plan 20 scratch lifetime.

## Verification

PB3-C01–C06. Extend `run-recovery.test.ts`, `capability-recovery.test.ts`,
`local-architect-submission.test.ts`, shared recovery-table fixtures and existing
continuation integration tests. Add a focused rejection suite if needed.

Cover forgotten report, unfinished work, blocker, repeated incomplete
requests to the bound, interruption before/after accepted submission and
effect completion, duplicate reports, fresh architect recovery, source/audit
changes and explicit reassessment. Verify the rejection names the IDs, no
gate runs on a rejected request, no second writer and no full status reset.
Run type-check/check:self.

## Exit criteria

Incomplete completion requests are rejected naming their IDs within the
existing bound, and resolved by the responsible architect in the same turn.
Declarations survive restart, while current source and diagnostics remain
inspectable for agent reassessment.

## Handoff

`iteration8-results.md`, rejection/recovery traces, bound evidence and fresh
brief showing declarations and relevant changes as separate facts.
