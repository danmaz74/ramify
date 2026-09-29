# Iteration 4: shared completion and recovery

[Plan 18](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and owners

Iteration 3. Harness owns completion, ledger/versioning and public projections.
Web changes follow separately if its consumed contracts change.

## Goal and read first

Read verifyCapabilityHandback, ordinary completion/review reconciliation,
capability dependencies/recovery, commit recovery and task projections.

## Deliverables

- Apply common completion and review machinery to the delegated bounded goal;
  delete the separately maintained capability acceptance/reviewer pipeline.
- Keep per-iteration failed checks with the engineer; task-completion checks
  return to the current ordinary/capability architect. Task checks never replace
  iteration checks. Reuse evidence only under the common producer applicability
  policy, with no capability-specific cache key.
- Preserve original consumer continuation, independent provider entry goals,
  task sequence/limits, depth-first nesting and deferred unrelated work.
- Preserve dirty/staged/untracked/deleted inherited source and writer-start
  attribution through failed gates, owner repairs and restart. A later accepted
  combined tree does not retroactively accept partial iterations.
- Resume shared iteration state after interruption; retain counters, IDs,
  settled-writer preconditions and ordinary terminal outcomes.
- Recover provider results by exact retained identity after a crash between
  completion and acknowledgement. Do not re-execute merely for diagnosis or use
  a mutable latest ref in place of the recorded report.
- Use one combined record/version migration. Read historical records without
  rewriting verdicts or inventing fields; refuse incompatible resumes before
  acquiring a writer or starting a gate.

## Verification and exit criteria

SI03–SI05, SI08–SI11; AE03–AE04, AE09, AE14–AE16.
Inject crashes at relevant intent/effect/completion boundaries, including after
provider completion and before harness acknowledgement. Verify one effect,
one eventual handback and the same requesting assignment on return.
Test lost sessions, exhausted bounds, waiting nested tasks and stale reviews.

Exit: common completion and recovery preserve all source and producer evidence;
a task's handback is neither its consumer's broader completion nor B's entry
completion. No historical or new-run fallback executes the removed loop.

## Handoff

Record revision-bound recovery traces, shared completion results and updated
producer-owned projection contracts in iteration4-results.md.
